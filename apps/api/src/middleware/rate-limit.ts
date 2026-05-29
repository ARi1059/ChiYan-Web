/**
 * 限流中间件 + handler 内可直接调用的 consumeBucket。
 *
 * 接口方案 §7.1 line 446：
 *   - /public/*    60/min/IP
 *   - /admin/*     120/min/admin_id
 *   - /auth/login  20/min/IP（中间件）+ 10/h/username（handler 内 consumeBucket）
 *   - /auth/login/totp 10/5min/IP
 *   - /auth/change-password + /auth/totp/*  10/h/admin_id（authRequired 后挂）
 *
 * 触发：429 + Retry-After（秒数）+ 错码 42901。
 *
 * Phase 1 backend：in-memory 滑动窗口。Step 7 切本地 Redis zadd + zremrangebyscore + zcard
 * 时换 `consumeBucket` 实现；中间件 / handler 接口形态不变。
 *
 * **mock 边界**：in-memory 在 Workers 多 isolate 之间不共享、cold start 后会丢，
 * 因此 Phase 1 不部署 staging 直到 Step 7。
 */
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import type { AppContext } from "../env";
import { fail } from "../lib/api";

export type Bucket =
  | "public_ip"
  | "admin_id"
  | "login_username"
  | "login_ip"
  | "login_totp_ip"
  | "sensitive_admin"
  | "refresh_ip";

export interface BucketOpts {
  bucket: Bucket;
  windowMs: number;
  max: number;
}

interface MiddlewareOpts extends BucketOpts {
  key: (c: Context<AppContext>) => string | null;
}

const buckets = new Map<string, number[]>();

function record(key: string, now: number, windowMs: number): { count: number; oldest: number } {
  const arr = buckets.get(key) ?? [];
  const cutoff = now - windowMs;
  let i = 0;
  while (i < arr.length && arr[i]! <= cutoff) i++;
  const kept = i === 0 ? arr : arr.slice(i);
  kept.push(now);
  buckets.set(key, kept);
  return { count: kept.length, oldest: kept[0]! };
}

/**
 * 直接调用，handler 内做 username / admin_id 二次限流。
 * 返回 blocked=true 时，handler 需自行回 429 + Retry-After。
 */
export interface ConsumeResult {
  blocked: boolean;
  retryAfterSec: number;
}

export function consumeBucket(opts: BucketOpts, key: string, now = Date.now()): ConsumeResult {
  if (!key) return { blocked: false, retryAfterSec: 0 };
  const bucketKey = `${opts.bucket}:${key}`;
  const { count, oldest } = record(bucketKey, now, opts.windowMs);
  if (count > opts.max) {
    const retryMs = Math.max(0, oldest + opts.windowMs - now);
    return { blocked: true, retryAfterSec: Math.ceil(retryMs / 1000) };
  }
  return { blocked: false, retryAfterSec: 0 };
}

/** handler 内回 429 的便利包装。 */
export function rateLimitedResponse(c: Context<AppContext>, retryAfterSec: number) {
  c.header("Retry-After", String(retryAfterSec));
  return fail(c, 42901, "请求过于频繁，请稍后再试", {
    sub_code: "rate_limited",
    retry_after_sec: retryAfterSec,
  });
}

export function rateLimit(opts: MiddlewareOpts) {
  return createMiddleware<AppContext>(async (c, next) => {
    const rawKey = opts.key(c);
    if (rawKey == null) return next();
    const r = consumeBucket(opts, rawKey);
    if (r.blocked) return rateLimitedResponse(c, r.retryAfterSec);
    await next();
  });
}

export function _resetRateLimitForTests(): void {
  buckets.clear();
}

export const keyFromIp = (c: Context<AppContext>): string | null =>
  c.req.header("CF-Connecting-IP") ?? c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ?? null;

export const keyFromAdmin = (c: Context<AppContext>): string | null => {
  const a = c.get("admin");
  return a ? String(a.admin_id) : null;
};
