/**
 * 为每个请求生成 request_id 并写入 c.set('request_id')。
 *
 * - 优先用客户端传入的 X-Request-Id（前提：trust-able 入站，目前 H5/Admin 都不传）
 * - 否则生成 `req_` + nanoid(21)
 * - 响应头回写 X-Request-Id 方便客户端 / 监控对账
 */
import { createMiddleware } from "hono/factory";
import { nanoid } from "nanoid";
import type { AppContext } from "../env";

const HEADER = "X-Request-Id";

export const requestId = createMiddleware<AppContext>(async (c, next) => {
  const inbound = c.req.header(HEADER);
  const id = inbound && /^req_[A-Za-z0-9_-]+$/.test(inbound) ? inbound : `req_${nanoid(21)}`;
  c.set("request_id", id);
  c.header(HEADER, id);
  await next();
});
