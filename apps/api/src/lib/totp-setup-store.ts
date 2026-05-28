/**
 * TOTP 绑定中临时 secret 存储。
 *
 * /auth/totp/setup 生成 secret + otpauth_url → 返回给前端展示二维码。
 * /auth/totp/verify 用同一 secret + 用户输入 code 校验，verify 成功才落库。
 *
 * 中间态 secret 不能落库（防 verify 失败也污染 admins.totp_secret_enc）。
 * 也不能放纯前端（会随 JSON 在网络上裸奔）— 由前端回传不安全。
 * 因此服务端临时 store，按 admin_id 索引，TTL 5min，同一用户多次 setup 后只留最新。
 *
 * Phase 1 mock：in-memory Map。Step 7 切 Upstash SET adminId secret EX 300。
 */

type Entry = { secret: string; expiresAt: number };
const store = new Map<number, Entry>();

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

export async function putSecret(adminId: number, secret: string, ttlSec: number = 300): Promise<void> {
  store.set(adminId, { secret, expiresAt: nowSec() + ttlSec });
}

export async function getSecret(adminId: number): Promise<string | null> {
  const e = store.get(adminId);
  if (!e) return null;
  if (e.expiresAt <= nowSec()) {
    store.delete(adminId);
    return null;
  }
  return e.secret;
}

export async function clearSecret(adminId: number): Promise<void> {
  store.delete(adminId);
}

export function _resetTotpSetupStoreForTests(): void {
  store.clear();
}
