/**
 * TOTP（RFC 6238, HMAC-SHA1, 6 位, 30 秒, window=1）通过 otpauth 包封装。
 *
 * - 容忍 ±1 个时间窗（±30s）的客户端时钟漂移
 * - secret 以 base32 字符串形式与认证器 App 交换；落库前需 AES-256-GCM 加密
 */
import { Secret, TOTP } from "otpauth";

const DIGITS = 6;
const PERIOD = 30;
const ALGORITHM = "SHA1";

export interface TotpEnvelope {
  issuer: string;
  label: string;
  secret: string;
}

export function generateSecret(): string {
  return new Secret({ size: 20 }).base32;
}

export function buildOtpAuthUrl({ issuer, label, secret }: TotpEnvelope): string {
  const totp = new TOTP({
    issuer,
    label,
    algorithm: ALGORITHM,
    digits: DIGITS,
    period: PERIOD,
    secret: Secret.fromBase32(secret),
  });
  return totp.toString();
}

export function generateCode(secret: string, timestamp = Date.now()): string {
  const totp = new TOTP({
    algorithm: ALGORITHM,
    digits: DIGITS,
    period: PERIOD,
    secret: Secret.fromBase32(secret),
  });
  return totp.generate({ timestamp });
}

export function verifyCode(
  secret: string,
  code: string,
  options: { window?: number; timestamp?: number } = {},
): boolean {
  const totp = new TOTP({
    algorithm: ALGORITHM,
    digits: DIGITS,
    period: PERIOD,
    secret: Secret.fromBase32(secret),
  });
  const delta = totp.validate({
    token: code,
    window: options.window ?? 1,
    timestamp: options.timestamp ?? Date.now(),
  });
  return delta !== null;
}
