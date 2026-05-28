/**
 * SHA-256 IP 哈希（公开埋点用）。
 *
 * 设计：
 * - 隐私优先：public_visits 表禁止落原文 IP（接口方案 §10.2 / 公开方案 §安全）
 * - 不加盐：盐会导致同一访客跨会话 hash 不一致 → 影响"按访客分组"统计；
 *   反向破解风险很低（IPv4 仅 ~43 亿，本就可枚举）—— 这里防的是"批量泄露日志后能反查个人"，
 *   纯 SHA-256 已经把"日志被 LLM 半截爬走也读不出 IP"这一档堵住
 * - 不复用 lib/crypto.ts：那是 AES-GCM 加密落库（有密钥），语义不同
 */

const enc = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i]!.toString(16).padStart(2, "0");
  }
  return out;
}

export async function hashIp(ip: string | null | undefined): Promise<string | null> {
  if (!ip) return null;
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(ip));
  return toHex(digest);
}
