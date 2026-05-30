/**
 * 一次性密码生成器（§4.7 POST /admin/accounts、reset-password 用）。
 *
 * 16 字符，crypto.getRandomValues 随机。字符集排除易混的 0/O/1/l/I/o，避免
 * 业主把密码读错。生成强度：log2(54^16) ≈ 92 bit，远超 80 bit safety floor。
 *
 * 一次性密码只在 HTTP 响应里返一次明文；落库的是 bcrypt(cost=12) 后的 hash。
 * **绝不放进 audit payload / console.log**（sanitize.ts 自动 mask 'one_time_password'
 * 字段名兜底，handler 层也别主动放）。
 */

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

export function generateOneTimePassword(length = 16): string {
  const buf = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[buf[i]! % ALPHABET.length];
  return out;
}
