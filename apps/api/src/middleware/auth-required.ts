/**
 * Bearer 鉴权中间件。
 *
 * 流程：
 *   1. Authorization: Bearer <jwt>
 *   2. verifyJwt(token, JWT_SECRET, 'access')
 *   3. jti 黑名单查询（已撤销 → 40101）
 *   4. c.set('admin', claims & { admin_id })
 *
 * 失败统一 40101，不区分 token 缺失 / 过期 / 签名错 / 已撤销（避免给攻击者反馈）。
 */
import { createMiddleware } from "hono/factory";
import type { AppContext } from "../env";
import { fail } from "../lib/api";
import { isRevoked } from "../lib/jti-store";
import { verifyJwt } from "../lib/jwt";

const BEARER = /^Bearer\s+(.+)$/i;

export const authRequired = createMiddleware<AppContext>(async (c, next) => {
  const auth = c.req.header("Authorization");
  const match = auth ? BEARER.exec(auth) : null;
  if (!match || !match[1]) return fail(c, 40101, "未授权");
  const token = match[1];

  let claims;
  try {
    claims = await verifyJwt<{ admin_id: number }>(token, c.env.JWT_SECRET, "access");
  } catch {
    return fail(c, 40101, "未授权");
  }

  if (await isRevoked(claims.jti)) {
    return fail(c, 40101, "未授权");
  }

  c.set("admin", { ...claims, admin_id: Number(claims.sub) });
  await next();
});
