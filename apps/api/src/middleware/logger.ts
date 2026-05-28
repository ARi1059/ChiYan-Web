/**
 * 请求日志：结构化 JSON，每个请求一行，发到 Cloudflare Logs。
 *
 * 字段：ts / request_id / method / path / status / duration_ms / ip / ua / admin_id?
 *
 * 不打印 body（敏感字段难以全覆盖；body 走审计日志 + sanitize 过滤）。
 */
import { createMiddleware } from "hono/factory";
import type { AppContext } from "../env";

export const logger = createMiddleware<AppContext>(async (c, next) => {
  const start = Date.now();
  let status = 500;
  try {
    await next();
    status = c.res.status;
  } catch (err) {
    status = 500;
    throw err;
  } finally {
    const admin = c.get("admin");
    const ip = c.req.header("CF-Connecting-IP") ?? c.req.header("X-Forwarded-For") ?? "";
    const log = {
      ts: new Date().toISOString(),
      request_id: c.get("request_id"),
      method: c.req.method,
      path: new URL(c.req.url).pathname,
      status,
      duration_ms: Date.now() - start,
      ip,
      ua: c.req.header("User-Agent") ?? "",
      ...(admin?.admin_id ? { admin_id: admin.admin_id } : {}),
    };
    console.log(JSON.stringify(log));
  }
});
