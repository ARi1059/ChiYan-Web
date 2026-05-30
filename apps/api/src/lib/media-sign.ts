/**
 * 媒体直传 presigned URL（指向本机 API）。
 *
 * 三步契约（前端配合）：
 *   1. POST /admin/media/sign      → 返 upload_url + object_key + expires_at
 *   2. 前端 PUT 文件到 upload_url（本机 /api/v1/admin/media/upload?key=...&sig=...&expires=...）
 *   3. POST /admin/media/register  → 用 sign 返的 object_key 落 media_assets
 *
 * 防御层叠：
 *   - PUT：HMAC-SHA256(JWT_SECRET, `${object_key}:${expires_ms}`) 校验 + expires 未过 + size limit。
 *     成功落盘后 _markKeyUploaded 写入 uploadedKeys 标记"已上传过"。
 *   - register：_consumeSignedKey 一次性消费 —— 防 PUT 后多次 register 同 key、防绕过 PUT 直接 register。
 *
 * object_key 命名：media/${YYYYMM}/${nanoid}.${ext}（与 docs §4 /var/chiyan/media/ 子目录对齐）。
 *
 * 不混用秘密：HMAC 用 JWT_SECRET（已要求 ≥32B 高熵），不再共享 AES 加密 key，避免一钥多用。
 */

import type { Env } from "../env";

const SIGN_TTL_MS = 15 * 60 * 1000;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

/**
 * 一次性消费的 key 集合：register 时 consume。
 * 写入时机：upload PUT 落盘成功后由 _markKeyUploaded 写入。
 * sign 不写入 —— 没真上传就 register 必然失败。
 */
const uploadedKeys = new Map<string, Date>();

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
  // 过滤非字母数字字符防注入到 object_key
  return filename.slice(dot + 1).replace(/[^a-zA-Z0-9]/g, "").toLowerCase().slice(0, 8) || "bin";
}

function yyyyMm(d: Date): string {
  const y = d.getUTCFullYear();
  const m = (d.getUTCMonth() + 1).toString().padStart(2, "0");
  return `${y}${m}`;
}

function base64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signUploadSig(
  jwtSecret: string,
  object_key: string,
  expiresMs: number,
): Promise<string> {
  const key = await importHmacKey(jwtSecret);
  const payload = new TextEncoder().encode(`${object_key}:${expiresMs}`);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, payload));
  return base64url(sig);
}

/** 常数时间字符串比较（HMAC 校验侧信道防御）。 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export interface VerifyUploadResult {
  ok: boolean;
  reason?: "expired" | "bad_sig";
}

export async function verifyUploadSig(
  jwtSecret: string,
  object_key: string,
  sig: string,
  expiresMs: number,
): Promise<VerifyUploadResult> {
  if (expiresMs < Date.now()) return { ok: false, reason: "expired" };
  const expected = await signUploadSig(jwtSecret, object_key, expiresMs);
  if (!timingSafeEqual(sig, expected)) return { ok: false, reason: "bad_sig" };
  return { ok: true };
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
  const expiresMs = expires_at.getTime();
  const sig = await signUploadSig(env.JWT_SECRET, object_key, expiresMs);
  const base = env.API_PUBLIC_URL.replace(/\/+$/, "");
  const upload_url = `${base}/api/v1/admin/media/upload?key=${encodeURIComponent(object_key)}&sig=${sig}&expires=${expiresMs}`;
  return { upload_url, object_key, expires_at };
}

/**
 * PUT 落盘成功后调用：标记此 object_key 已真正上传过。
 * 15min 后过期自动清；register 必须在窗口内消费。
 */
export function _markKeyUploaded(object_key: string): void {
  uploadedKeys.set(object_key, new Date(Date.now() + SIGN_TTL_MS));
}

/**
 * register endpoint 用：消费已上传 key。返 false 表示"未上传过"或"窗口已过"。
 * 成功消费后 key 即从 map 删除（一次性，重复 register 同 key 会失败）。
 */
export function _consumeSignedKey(object_key: string): boolean {
  const exp = uploadedKeys.get(object_key);
  if (!exp) return false;
  if (exp.getTime() < Date.now()) {
    uploadedKeys.delete(object_key);
    return false;
  }
  uploadedKeys.delete(object_key);
  return true;
}

export function _resetMediaSignForTests(): void {
  uploadedKeys.clear();
}
