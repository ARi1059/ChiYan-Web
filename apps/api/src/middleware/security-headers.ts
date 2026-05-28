/**
 * 安全响应头。Workers 是纯 API（JSON-only），CSP 用 deny-all 模板。
 *
 * 对应接口方案 §7（安全）+ §10.2 不放行渲染。
 *
 * 头列表（参考 OWASP Secure Headers Project）：
 *   - Strict-Transport-Security：1 年 + includeSubDomains + preload
 *   - X-Content-Type-Options：nosniff
 *   - X-Frame-Options：DENY（叠加 CSP frame-ancestors 'none' 双保险）
 *   - Referrer-Policy：strict-origin-when-cross-origin
 *   - Cross-Origin-* 三件套：避免 SAB / Spectre 类利用
 *   - Permissions-Policy：禁掉所有传感器 / 摄像头 / 麦克风 / 支付
 *   - Content-Security-Policy：default-src 'none'; frame-ancestors 'none'
 *
 * 注意：HSTS 在 dev (http://localhost) 浏览器会忽略；prod 必须 https。
 */
import { createMiddleware } from "hono/factory";
import type { AppContext } from "../env";

const HEADERS: Record<string, string> = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-site",
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Permissions-Policy":
    "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
};

export const securityHeaders = createMiddleware<AppContext>(async (c, next) => {
  await next();
  for (const [k, v] of Object.entries(HEADERS)) {
    c.header(k, v);
  }
});
