/**
 * Access / Refresh / Challenge token 集中签发 + cookie 落地。
 *
 * 把 sign + cookie + csrf 集中到一处，避免每个 handler 抄一遍。
 *
 * 三种 token TTL（接口方案 §3.2）：
 *   access      2h
 *   refresh    14d
 *   challenge   5min
 */
import type { Context } from "hono";
import type { AppContext } from "../env";
import {
  CSRF_COOKIE_NAME,
  clearCsrfCookie,
  clearRefreshCookie,
  generateCsrfToken,
  setCsrfCookie,
  setRefreshCookie,
} from "./cookie";
import { put as putChallenge } from "./challenge-store";
import { revoke } from "./jti-store";
import { signJwt, type BaseClaims, type JwtKind } from "./jwt";

export const TTL = {
  access: 2 * 60 * 60,
  refresh: 14 * 24 * 60 * 60,
  challenge: 5 * 60,
} as const;

function newJti(): string {
  return crypto.randomUUID();
}

export interface IssuedSession {
  access_token: string;
  refresh_token: string;
  access_jti: string;
  refresh_jti: string;
}

export async function issueSession(
  c: Context<AppContext>,
  adminId: number,
): Promise<IssuedSession> {
  const access_jti = newJti();
  const refresh_jti = newJti();
  const sub = String(adminId);
  const [access_token, refresh_token] = await Promise.all([
    signJwt({ sub, jti: access_jti, kind: "access" as JwtKind, ttlSec: TTL.access }, c.env.JWT_SECRET),
    signJwt({ sub, jti: refresh_jti, kind: "refresh" as JwtKind, ttlSec: TTL.refresh }, c.env.JWT_SECRET),
  ]);
  setRefreshCookie(c, refresh_token);
  setCsrfCookie(c, generateCsrfToken());
  return { access_token, refresh_token, access_jti, refresh_jti };
}

export async function issueChallenge(c: Context<AppContext>, adminId: number): Promise<{ challenge_token: string; jti: string }> {
  const jti = newJti();
  const challenge_token = await signJwt(
    { sub: String(adminId), jti, kind: "totp_challenge" as JwtKind, ttlSec: TTL.challenge },
    c.env.JWT_SECRET,
  );
  await putChallenge(jti, TTL.challenge);
  return { challenge_token, jti };
}

/** 撤销当前会话：access + refresh jti 加黑 + 清 cookie。 */
export async function revokeSession(
  c: Context<AppContext>,
  access: BaseClaims,
  refresh?: BaseClaims,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await revoke(access.jti, Math.max(0, access.exp - now));
  if (refresh) await revoke(refresh.jti, Math.max(0, refresh.exp - now));
  clearRefreshCookie(c);
  clearCsrfCookie(c);
}

export { CSRF_COOKIE_NAME };
