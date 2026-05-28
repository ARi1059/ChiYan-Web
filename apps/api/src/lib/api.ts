/**
 * 响应 helpers + onError 错误归一化。
 *
 * 接口方案 §4.1 envelope：
 *   success: { code: 0, message, data, request_id, timestamp }
 *   error:   { code: 4xxxx, message, data?: { sub_code, ... }, request_id, timestamp }
 *
 * 用法：
 *   import { ok, fail } from "./lib/api"
 *   return ok(c, { token: "..." })                    // 200
 *   return fail(c, 40401, "模特不存在")               // 状态码取 sub-code 前 3 位
 *   return fail(c, 40301, "需要先改密码", { sub_code: "must_change_password" })
 */
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ErrorCode } from "@chiyan/types";

const nowSec = () => Math.floor(Date.now() / 1000);

/** 错误码（5 位）→ HTTP 状态码（3 位）。约定：取前 3 位。 */
function codeToHttp(code: ErrorCode): ContentfulStatusCode {
  if (code === 0) return 200;
  const s = String(code);
  const httpStatus = Number(s.slice(0, 3));
  return httpStatus as ContentfulStatusCode;
}

export function ok<T>(c: Context, data: T, message = "ok") {
  const request_id = c.get("request_id") ?? "";
  return c.json(
    {
      code: 0 as const,
      message,
      data,
      request_id,
      timestamp: nowSec(),
    },
    200,
  );
}

export function fail(
  c: Context,
  code: Exclude<ErrorCode, 0>,
  message: string,
  data?: { sub_code?: string; [k: string]: unknown },
) {
  const request_id = c.get("request_id") ?? "";
  return c.json(
    {
      code,
      message,
      ...(data ? { data } : {}),
      request_id,
      timestamp: nowSec(),
    },
    codeToHttp(code),
  );
}
