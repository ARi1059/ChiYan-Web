/**
 * 媒体直传 presigned URL（指向本机 API）。
 *
 * 两步契约（与前端 unchanged）：
 *   1. POST /admin/media/sign      → 返 upload_url + object_key + expires_at
 *   2. 前端 PUT 文件到 upload_url（本机 /api/v1/admin/media/upload?key=...&sig=...&expires=...）
 *   3. POST /admin/media/register  → 用 sign 返的 object_key 落 media_assets
 *
 * **本 PR 范围**：实际 PUT endpoint（落盘 MEDIA_ROOT、sharp 处理、水印副本）尚未实现，
 * 只把 sign 返回的 URL host 从 r2-mock.local 改为 env.API_PUBLIC_URL。in-memory signedKeys
 * 仍由 _consumeSignedKey 消费（一次性 key，避免 sign 后 N 次 register 同 key）。
 *
 * object_key 命名：media/${YYYYMM}/${nanoid}.${ext}（与 docs §4 /var/chiyan/media/ 子目录对齐）。
 */

import type { Env } from "../env";

const SIGN_TTL_MS = 15 * 60 * 1000;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

const signedKeys = new Map<string, Date>();

export interface MediaSignResult {
  upload_url: string;
  object_key: string;
  expires_at: Date;
}

function nanoid(len: number): string {
  const buf = crypto.getRandomValues(new Uint8Array(len));
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[buf[i]! % ALPHABET.length];
  return out;
}

function extOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot < 0 || dot === filename.length - 1) return "bin";
  // 过滤掉非字母数字字符以防注入到 object_key
  return filename.slice(dot + 1).replace(/[^a-zA-Z0-9]/g, "").toLowerCase().slice(0, 8) || "bin";
}

function yyyyMm(d: Date): string {
  const y = d.getUTCFullYear();
  const m = (d.getUTCMonth() + 1).toString().padStart(2, "0");
  return `${y}${m}`;
}

export interface SignMediaUploadInput {
  type: "image" | "video";
  filename: string;
  content_type: string;
}

export async function signMediaUpload(env: Env, input: SignMediaUploadInput): Promise<MediaSignResult> {
  const now = new Date();
  const expires_at = new Date(now.getTime() + SIGN_TTL_MS);
  const object_key = `media/${yyyyMm(now)}/${nanoid(10)}.${extOf(input.filename)}`;
  // 占位 sig（本 PR 不真做 HMAC；真实上传 endpoint 落地时改成 keyring 派生的 HMAC over object_key+expires）
  const base = env.API_PUBLIC_URL.replace(/\/+$/, "");
  const upload_url = `${base}/api/v1/admin/media/upload?key=${encodeURIComponent(object_key)}&sig=mock&expires=${expires_at.getTime()}`;
  signedKeys.set(object_key, expires_at);
  return { upload_url, object_key, expires_at };
}

/**
 * register endpoint 用：消费已签 key。返 false 表示"未签过"或"已过期"，handler 翻 40001。
 * 成功消费后 key 即从 map 删除（一次性，重复 register 同 key 会失败）。
 */
export function _consumeSignedKey(object_key: string): boolean {
  const exp = signedKeys.get(object_key);
  if (!exp) return false;
  if (exp.getTime() < Date.now()) {
    signedKeys.delete(object_key);
    return false;
  }
  signedKeys.delete(object_key);
  return true;
}

export function _resetMediaSignForTests(): void {
  signedKeys.clear();
}
