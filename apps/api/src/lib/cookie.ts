/**
 * Cookie 工具：refresh / csrf。
 *
 * 命名与属性参考接口方案 §3.2 line 257：
 *   - refresh：`__Host-chiyan_refresh`，HttpOnly + Secure + SameSite=Lax + Path=/，14d
 *   - csrf：   `chiyan_csrf`，非 HttpOnly（前端可读）+ Secure + SameSite=Lax + Path=/，14d，32B base64url
 *
 * dev 环境（本地 http）`__Host-` 前缀会被浏览器拒绝。按 ENV 切：
 *   dev      → `chiyan_refresh`（无前缀）
 *   staging  → `__Host-chiyan_refresh`
 *   production → `__Host-chiyan_refresh`
 */
import type { Context } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import type { AppContext } from "../env";

const REFRESH_DAYS = 14;
const REFRESH_MAX_AGE = REFRESH_DAYS * 24 * 60 * 60;

export function refreshCookieName(env: AppContext["Bindings"]): string {
  return env.ENV === "dev" ? "chiyan_refresh" : "__Host-chiyan_refresh";
}

export const CSRF_COOKIE_NAME = "chiyan_csrf";
export const CSRF_HEADER = "X-CSRF-Token";

export function setRefreshCookie(c: Context<AppContext>, token: string): void {
  const name = refreshCookieName(c.env);
  const isProd = c.env.ENV !== "dev";
  setCookie(c, name, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "Lax",
    path: "/",
    maxAge: REFRESH_MAX_AGE,
  });
}

export function clearRefreshCookie(c: Context<AppContext>): void {
  const name = refreshCookieName(c.env);
  deleteCookie(c, name, { path: "/" });
}

/** 生成 32 字节 base64url 随机串。用于 csrf token 值。 */
export function generateCsrfToken(): string {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  return base64url(buf);
}

export function setCsrfCookie(c: Context<AppContext>, token: string): void {
  const isProd = c.env.ENV !== "dev";
  setCookie(c, CSRF_COOKIE_NAME, token, {
    httpOnly: false,
    secure: isProd,
    sameSite: "Lax",
    path: "/",
    maxAge: REFRESH_MAX_AGE,
  });
}

export function clearCsrfCookie(c: Context<AppContext>): void {
  deleteCookie(c, CSRF_COOKIE_NAME, { path: "/" });
}

function base64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
