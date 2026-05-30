/**
 * 限流中间件 + handler 内可直接调用的 consumeBucket。
 *
 * 接口方案 §7.1：
 *   - /public/*    60/min/IP
 *   - /admin/*     120/min/admin_id
 *   - /auth/login  20/min/IP（中间件）+ 10/h/username（handler 内 consumeBucket）
 *   - /auth/login/totp 10/5min/IP
 *   - /auth/change-password + /auth/totp/*  10/h/admin_id（authRequired 后挂）
 *
 * 触发：429 + Retry-After（秒数）+ 错码 42901。
 *
 * 后端：getRedisClient() 有则用 Redis 滑动窗口（zadd + zremrangebyscore + zcard + expire），
 * 重启 / 多实例共享；为 null 时退回 in-memory 滑动窗口（重启即丢，仅本地 dev / 测试）。
 *
 * 降级：Redis 抛错时 fail-open —— 放行（对齐 docs/部署架构.md §九"Redis OOM 让请求穿透 DB"）。
 */
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { nanoid } from "nanoid";
import type { AppContext } from "../env";
import { fail } from "../lib/api";
import {
  getRedisClient,
  zadd,
  zremrangebyscore,
  zcard,
  expire,
  zrangeWithScores,
  logRedisError,
} from "../lib/redis";

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

/**
 * 直接调用，handler 内做 username / admin_id 二次限流。
 * 返回 blocked=true 时，handler 需自行回 429 + Retry-After。
 */
export interface ConsumeResult {
  blocked: boolean;
  retryAfterSec: number;
}

// ─── in-memory fallback（getRedisClient()==null 时用）───
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

/** 滑窗判定（内存 / Redis 共用）：count 含本次，> max 即 block，retryAfter 按最旧戳算。 */
function decide(opts: BucketOpts, count: number, oldest: number, now: number): ConsumeResult {
  if (count > opts.max) {
    const retryMs = Math.max(0, oldest + opts.windowMs - now);
    return { blocked: true, retryAfterSec: Math.ceil(retryMs / 1000) };
  }
  return { blocked: false, retryAfterSec: 0 };
}

export async function consumeBucket(
  opts: BucketOpts,
  key: string,
  now = Date.now(),
): Promise<ConsumeResult> {
  if (!key) return { blocked: false, retryAfterSec: 0 };
  const bucketKey = `${opts.bucket}:${key}`;
  const c = getRedisClient();
  if (!c) {
    const { count, oldest } = record(bucketKey, now, opts.windowMs);
    return decide(opts, count, oldest, now);
  }
  try {
    const cutoff = now - opts.windowMs;
    await zremrangebyscore(c, bucketKey, 0, cutoff); // 清窗口外旧戳
    await zadd(c, bucketKey, now, `${now}-${nanoid(8)}`); // member 唯一，防同毫秒覆盖
    const count = await zcard(c, bucketKey); // 含本次
    await expire(c, bucketKey, Math.ceil(opts.windowMs / 1000)); // 兜底 TTL：空闲 key 自动回收
    if (count > opts.max) {
      const oldestArr = await zrangeWithScores(c, bucketKey, 0, 0); // rank 0 = 最旧戳
      return decide(opts, count, oldestArr[0]?.score ?? now, now);
    }
    return { blocked: false, retryAfterSec: 0 };
  } catch (err) {
    logRedisError("rate-limit", err);
    return { blocked: false, retryAfterSec: 0 }; // fail-open：Redis 抖动时放行
  }
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
    const r = await consumeBucket(opts, rawKey);
    if (r.blocked) return rateLimitedResponse(c, r.retryAfterSec);
    await next();
  });
}

export function _resetRateLimitForTests(): void {
  buckets.clear();
}

export const keyFromIp = (c: Context<AppContext>): string | null =>
  c.req.header("CF-Connecting-IP") ??
  c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ??
  null;

export const keyFromAdmin = (c: Context<AppContext>): string | null => {
  const a = c.get("admin");
  return a ? String(a.admin_id) : null;
};
