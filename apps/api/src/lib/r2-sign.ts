/**
 * R2 presigned PUT URL —— Phase 3 prep mock。
 *
 * 真实接 R2 时这里换成 @aws-sdk/client-s3 + getSignedUrl（R2 兼容 S3 v4 签名），
 * handler 形态不动。
 *
 * mock 行为：
 *  - 生成 object_key = `media/${YYYYMM}/${nanoid}.${ext}`
 *  - upload_url 占位 `https://r2-mock.local/upload/${object_key}?sig=mock`
 *  - 维护 in-memory signedKeys Map：key → expires_at（now + 15min）
 *  - register endpoint 调 _consumeSignedKey(key) 校验 key 是 sign 返回过且未过期，
 *    确保 mock 阶段也能模拟"必须先 sign 后 register"的契约
 */

const SIGN_TTL_MS = 15 * 60 * 1000;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

const signedKeys = new Map<string, Date>();

export interface R2SignResult {
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

export interface SignR2PutInput {
  type: "image" | "video";
  filename: string;
  content_type: string;
}

export async function signR2Put(input: SignR2PutInput): Promise<R2SignResult> {
  const now = new Date();
  const expires_at = new Date(now.getTime() + SIGN_TTL_MS);
  const object_key = `media/${yyyyMm(now)}/${nanoid(10)}.${extOf(input.filename)}`;
  const upload_url = `https://r2-mock.local/upload/${object_key}?sig=mock&expires=${expires_at.getTime()}`;
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

export function _resetR2SignForTests(): void {
  signedKeys.clear();
}
