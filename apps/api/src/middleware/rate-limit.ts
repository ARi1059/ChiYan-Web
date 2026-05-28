/**
 * 限流中间件工厂：滑动窗口。
 *
 * 接口方案 §7.1 line 446：
 *   - 默认 /admin/* 120/min/admin_id
 *   - /public/*    60/min/IP
 *   - /auth/login  10/h/username + 20/min/IP（双限流，外面挂两层）
 *   - /auth/login/totp 10/5min/challenge_jti
 *   - /auth/change-password + /auth/totp/*  10/h/admin_id
 *
 * 触发：429 + Retry-After（秒数）+ 错码 42901。
 *
 * Phase 1 mock：in-memory sorted set 模拟。Workers 多 isolate 不共享，本地 dev 有效。
 * Step 6 切 Upstash zadd / zremrangebyscore / zcard。
 */
import { createMiddleware } from "hono/factory";
import type { Context } from "hono";
import type { AppContext } from "../env";
import { fail } from "../lib/api";

type Bucket = "public" | "admin" | "login_username" | "login_ip" | "login_totp" | "sensitive";

interface Opts {
  /** 桶名（Upstash key 前缀，也方便日志区分） */
  bucket: Bucket;
  /** 窗口大小，毫秒 */
  windowMs: number;
  /** 窗口内允许最大次数 */
  max: number;
  /** 从 ctx 提取限流 key（IP / admin_id / username / jti…）；返回 null → 跳过限流 */
  key: (c: Context<AppContext>) => string | null;
}

// 用 Map<bucketKey, sortedTimestamps[]> 模拟 Redis sorted set
const buckets = new Map<string, number[]>();

function record(key: string, now: number, windowMs: number): { count: number; oldest: number } {
  const arr = buckets.get(key) ?? [];
  const cutoff = now - windowMs;
  // drop 过期
  let i = 0;
  while (i < arr.length && arr[i]! <= cutoff) i++;
  const kept = i === 0 ? arr : arr.slice(i);
  kept.push(now);
  buckets.set(key, kept);
  return { count: kept.length, oldest: kept[0]! };
}

export function rateLimit(opts: Opts) {
  return createMiddleware<AppContext>(async (c, next) => {
    const rawKey = opts.key(c);
    if (rawKey == null) return next();
    const bucketKey = `${opts.bucket}:${rawKey}`;
    const now = Date.now();
    const { count, oldest } = record(bucketKey, now, opts.windowMs);

    if (count > opts.max) {
      const retryMs = Math.max(0, oldest + opts.windowMs - now);
      const retrySec = Math.ceil(retryMs / 1000);
      c.header("Retry-After", String(retrySec));
      return fail(c, 42901, "请求过于频繁，请稍后再试", {
        sub_code: "rate_limited",
        retry_after_sec: retrySec,
      });
    }

    await next();
  });
}

/** 测试用：清桶。 */
export function _resetRateLimitForTests(): void {
  buckets.clear();
}

/** 常用 key 提取器。 */
export const keyFromIp = (c: Context<AppContext>): string | null =>
  c.req.header("CF-Connecting-IP") ?? c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ?? null;

export const keyFromAdmin = (c: Context<AppContext>): string | null => {
  const a = c.get("admin");
  return a ? String(a.admin_id) : null;
};
