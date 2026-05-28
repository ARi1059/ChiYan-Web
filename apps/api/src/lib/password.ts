/**
 * 密码处理：
 * - bcryptjs hash + verify（cost 12，依赖 Workers nodejs_compat 的 Buffer polyfill）
 * - 一次性密码生成：20 字符 URL-safe random（A-Z a-z 0-9 - _，从 crypto.getRandomValues）
 *
 * cost 选择：12 在 Workers Paid plan 上 ~200-400ms CPU，可接受；如卡 30s/请求上限再降到 10。
 */
import bcrypt from "bcryptjs";

const BCRYPT_COST = 12;
const ONE_TIME_PASSWORD_LENGTH = 20;
const URL_SAFE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function generateOneTimePassword(length = ONE_TIME_PASSWORD_LENGTH): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (let i = 0; i < length; i++) {
    out += URL_SAFE_CHARS[bytes[i]! % URL_SAFE_CHARS.length];
  }
  return out;
}
