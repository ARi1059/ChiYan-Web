/**
 * 双 token CSRF：X-CSRF-Token Header 必须等于 chiyan_csrf Cookie。
 *
 * 仅写接口挂：/admin/* + /auth/change-password / totp/* / logout。
 * 不挂：/public/*、/auth/login、/auth/login/totp、/auth/refresh
 *   - login/login-totp 没有 cookie 可比对
 *   - refresh 由 SameSite=Lax + 同源前提防 CSRF
 *
 * 比较用常数时间，防侧信道。Header 缺失 / 不等 / cookie 缺失 → 40301 + sub_code=csrf_invalid。
 */
import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import type { AppContext } from "../env";
import { fail } from "../lib/api";
import { CSRF_COOKIE_NAME, CSRF_HEADER } from "../lib/cookie";

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const csrf = createMiddleware<AppContext>(async (c, next) => {
  const header = c.req.header(CSRF_HEADER);
  const cookie = getCookie(c, CSRF_COOKIE_NAME);
  if (!header || !cookie || !timingSafeEqual(header, cookie)) {
    return fail(c, 40301, "CSRF 校验失败", { sub_code: "csrf_invalid" });
  }
  await next();
});
