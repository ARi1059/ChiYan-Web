/**
 * JWT 签发与校验（HS256 via hono/jwt）。
 *
 * 用途：
 * - access token（payload.kind = 'access', TTL 2h）
 * - refresh token（payload.kind = 'refresh', TTL 14d）
 * - challenge token（payload.kind = 'totp_challenge', TTL 5min）
 *
 * jti 必填，用于 Upstash 黑名单 / challenge 单次消费。
 */
import { sign as honoSign, verify as honoVerify } from "hono/jwt";

export type JwtKind = "access" | "refresh" | "totp_challenge";

export interface BaseClaims {
  sub: string;
  jti: string;
  kind: JwtKind;
  iat: number;
  exp: number;
}

export type Claims<T extends Record<string, unknown> = Record<string, never>> = BaseClaims & T;

export async function signJwt<T extends Record<string, unknown>>(
  payload: Omit<Claims<T>, "iat" | "exp"> & { ttlSec: number } & T,
  secret: string,
): Promise<string> {
  const { ttlSec, ...rest } = payload;
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + ttlSec;
  return honoSign({ ...rest, iat, exp }, secret, "HS256");
}

export async function verifyJwt<T extends Record<string, unknown> = Record<string, never>>(
  token: string,
  secret: string,
  expectedKind: JwtKind,
): Promise<Claims<T>> {
  const claims = (await honoVerify(token, secret, "HS256")) as Claims<T>;
  if (claims.kind !== expectedKind) {
    throw new Error(`expected kind=${expectedKind}, got ${claims.kind}`);
  }
  return claims;
}
