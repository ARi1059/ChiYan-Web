/**
 * AES-256-GCM 字段加密，密钥版本化。
 *
 * 落库布局：[version: 1 byte][iv: 12 bytes][ciphertext + 16-byte GCM tag]
 *
 * - version: 0x01 起递增，对应 ENC_KEY_V1 / ENC_KEY_V2 ...
 * - iv: 每次加密随机 12 字节（GCM 推荐）
 * - 解密按 version 路由到对应 key
 */

const IV_BYTES = 12;
const VERSION_BYTES = 1;

export type KeyVersion = number;

export type KeyRing = Record<KeyVersion, Uint8Array>;

async function importKey(rawKey: Uint8Array, usage: KeyUsage[]): Promise<CryptoKey> {
  if (rawKey.byteLength !== 32) {
    throw new Error(`AES-256-GCM key must be 32 bytes, got ${rawKey.byteLength}`);
  }
  return crypto.subtle.importKey("raw", rawKey as BufferSource, { name: "AES-GCM" }, false, usage);
}

export async function encrypt(
  plaintext: string,
  version: KeyVersion,
  rawKey: Uint8Array,
): Promise<Uint8Array> {
  if (version < 1 || version > 255) {
    throw new Error(`key version must fit in 1 byte (1..255), got ${version}`);
  }
  const key = await importKey(rawKey, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const pt = new TextEncoder().encode(plaintext);
  const ctBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, pt);
  const ct = new Uint8Array(ctBuf);

  const out = new Uint8Array(VERSION_BYTES + IV_BYTES + ct.byteLength);
  out[0] = version;
  out.set(iv, VERSION_BYTES);
  out.set(ct, VERSION_BYTES + IV_BYTES);
  return out;
}

export async function decrypt(blob: Uint8Array, keys: KeyRing): Promise<string> {
  if (blob.byteLength < VERSION_BYTES + IV_BYTES + 16) {
    throw new Error("ciphertext too short");
  }
  const version = blob[0]!;
  const rawKey = keys[version];
  if (!rawKey) {
    throw new Error(`no key available for version ${version}`);
  }
  const iv = blob.subarray(VERSION_BYTES, VERSION_BYTES + IV_BYTES);
  const ct = blob.subarray(VERSION_BYTES + IV_BYTES);
  const key = await importKey(rawKey, ["decrypt"]);
  const ptBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, ct);
  return new TextDecoder().decode(ptBuf);
}

export function generateKey(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}
