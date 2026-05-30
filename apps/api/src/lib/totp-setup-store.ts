/**
 * TOTP 绑定中临时 secret 存储（按 admin_id，TTL 5min，同一用户多次 setup 留最新）。
 *
 * /auth/totp/setup 生成 secret → 临时存这里；/auth/totp/verify 取出校验，成功才落库。
 * 中间态不能落库（防 verify 失败污染 admins.totp_secret_enc），也不能放纯前端（网络裸奔）。
 *
 * 后端：getRedisClient() 有则用 Redis（SET k secret EX 300 / GET / DEL）；为 null 时退回 in-memory Map。
 *
 * 降级：fail-closed —— putSecret 失败上抛（setup 失败）、getSecret 失败返回 null
 * （verify 拿不到 secret 即校验失败，安全）、clearSecret 失败仅记录（有 TTL 兜底）。
 */
import { getRedisClient, get, set, del, logRedisError } from "./redis";

const KEY_PREFIX = "totp:setup:";

type Entry = { secret: string; expiresAt: number };
const store = new Map<number, Entry>();

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

export async function putSecret(
  adminId: number,
  secret: string,
  ttlSec: number = 300,
): Promise<void> {
  const c = getRedisClient();
  if (c) {
    try {
      await set(c, KEY_PREFIX + adminId, secret, ttlSec);
    } catch (err) {
      logRedisError("totp-setup.putSecret", err);
      throw err; // fail-closed
    }
    return;
  }
  store.set(adminId, { secret, expiresAt: nowSec() + ttlSec });
}

export async function getSecret(adminId: number): Promise<string | null> {
  const c = getRedisClient();
  if (c) {
    try {
      return await get(c, KEY_PREFIX + adminId);
    } catch (err) {
      logRedisError("totp-setup.getSecret", err);
      return null; // fail-closed：拿不到 secret → verify 失败
    }
  }
  const e = store.get(adminId);
  if (!e) return null;
  if (e.expiresAt <= nowSec()) {
    store.delete(adminId);
    return null;
  }
  return e.secret;
}

export async function clearSecret(adminId: number): Promise<void> {
  const c = getRedisClient();
  if (c) {
    try {
      await del(c, KEY_PREFIX + adminId);
    } catch (err) {
      logRedisError("totp-setup.clearSecret", err); // 残留有 TTL 兜底，不抛
    }
    return;
  }
  store.delete(adminId);
}

export function _resetTotpSetupStoreForTests(): void {
  store.clear();
}
