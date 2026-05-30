/**
 * E2E 共享：TOTP base32 secret + 当下 6 位 code。
 *
 * dev-with-seed.ts 和测试用例都 import 这个常量 —— 一边 encrypt 进 admins.totp_secret_enc，
 * 一边在登录时算当下 code 输入。任何 32 字符 base32 都行；这里固定为可读字串方便排查。
 */
import { TOTP, Secret } from "otpauth";

export const E2E_TOTP_SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP"; // 32 chars base32

export function currentTotpCode(): string {
  const totp = new TOTP({
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(E2E_TOTP_SECRET),
  });
  return totp.generate();
}
