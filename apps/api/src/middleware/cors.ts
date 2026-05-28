/**
 * CORS：按 ALLOWED_ORIGINS（JSON 数组字符串）切白名单 + 允许 credentials。
 *
 * 关键点：
 * - 允许的 origin 列表来源是 env.ALLOWED_ORIGINS，启动时 JSON.parse 一次（不每请求 parse）
 * - 允许 credentials → 必须显式回 origin，不能 '*'
 * - 暴露 X-Request-Id（前端拿来排查问题）
 * - 预检（OPTIONS）由 hono 的 cors helper 处理
 *
 * 与 onError 配合：onError 内必须手动 set CORS 头，否则浏览器拿不到错误响应。
 * 见 lib/api.ts 的 errorHandler。
 */
import { cors as honoCors } from "hono/cors";
import { createMiddleware } from "hono/factory";
import type { AppContext } from "../env";

function parseOrigins(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

let cached: { raw: string; list: string[] } | null = null;
function originsFromEnv(raw: string | undefined): string[] {
  if (cached && cached.raw === raw) return cached.list;
  const list = parseOrigins(raw);
  cached = { raw: raw ?? "", list };
  return list;
}

export const cors = createMiddleware<AppContext>(async (c, next) => {
  const allowed = originsFromEnv(c.env.ALLOWED_ORIGINS);
  return honoCors({
    origin: (origin) => (allowed.includes(origin) ? origin : null),
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-CSRF-Token", "X-Request-Id"],
    exposeHeaders: ["X-Request-Id"],
    maxAge: 600,
  })(c, next);
});

/**
 * 给 onError / notFound 用：错误响应必须保证 CORS 头到位，不然前端 fetch 直接被浏览器吞掉错误细节。
 * Hono 的 cors 中间件在抛错前已经设过这些头时跳过；只在 cors 没生效的边缘路径补齐。
 */
export function applyCorsToError(c: import("hono").Context<AppContext>): void {
  const origin = c.req.header("Origin");
  if (!origin) return;
  const allowed = originsFromEnv(c.env.ALLOWED_ORIGINS);
  if (!allowed.includes(origin)) return;
  if (c.res.headers.has("Access-Control-Allow-Origin")) return;
  c.header("Access-Control-Allow-Origin", origin);
  c.header("Access-Control-Allow-Credentials", "true");
  c.header("Vary", "Origin");
}
