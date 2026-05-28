/**
 * /auth/login/totp 用：校验 challenge_token + 单次消费。
 *
 * 流程：
 *   1. body.challenge_token 解析（在 handler 里 zod 已校验存在 + 字符串非空）
 *   2. verifyJwt(token, JWT_SECRET, 'totp_challenge')
 *   3. challenge-store.consume(jti)：存在 + 删除 → ok；否则 40101（重放 / 已用 / 已过期）
 *   4. c.set('challenge_admin_id', Number(claims.sub))
 *
 * **注意**：本中间件只挂在 /auth/login/totp 路径上，并 expect body 已含 challenge_token。
 * 因此挂载顺序：zValidator('json') → challengeRequired。
 */
import { createMiddleware } from "hono/factory";
import type { AppContext } from "../env";
import { fail } from "../lib/api";
import { consume } from "../lib/challenge-store";
import { verifyJwt } from "../lib/jwt";

export const challengeRequired = createMiddleware<AppContext>(async (c, next) => {
  let token: string;
  try {
    const body = (await c.req.json()) as { challenge_token?: unknown };
    if (typeof body?.challenge_token !== "string" || body.challenge_token.length === 0) {
      return fail(c, 40101, "challenge 已失效");
    }
    token = body.challenge_token;
  } catch {
    return fail(c, 40001, "参数错误");
  }

  let claims;
  try {
    claims = await verifyJwt<Record<string, never>>(token, c.env.JWT_SECRET, "totp_challenge");
  } catch {
    return fail(c, 40101, "challenge 已失效");
  }

  const ok = await consume(claims.jti);
  if (!ok) return fail(c, 40101, "challenge 已失效");

  c.set("challenge_admin_id", Number(claims.sub));
  await next();
});
