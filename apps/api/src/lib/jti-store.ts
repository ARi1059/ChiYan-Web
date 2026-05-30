/**
 * jti 黑名单：撤销已签发的 access/refresh token。
 *
 * 接口（从一开始就 async）：
 *   - isRevoked(jti) → 是否已加黑
 *   - revoke(jti, ttlSec) → 加黑，TTL = token 自然过期剩余秒数
 *
 * 后端：getRedisClient() 有则用 Redis（SET k 1 EX ttl / GET），重启 / 多实例共享、按 TTL 自动过期；
 * 为 null（本地 dev 没起 redis / 测试）时退回 in-memory Map。
 *
 * 降级：Redis 抛错时 fail-open —— isRevoked 当未撤销（false）、revoke 仅记录不抛。
 * token 自带 TTL 兜底，撤销失效窗口被限制在剩余 TTL 内。
 */
import { getRedisClient, get, set, logRedisError } from "./redis";

const KEY_PREFIX = "jti:revoked:";

// ─── in-memory fallback（getRedisClient()==null 时用）───
type Entry = { expiresAt: number };
const store = new Map<string, Entry>();

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

function gc(): void {
  const now = nowSec();
  for (const [k, v] of store) {
    if (v.expiresAt <= now) store.delete(k);
  }
}

export async function isRevoked(jti: string): Promise<boolean> {
  const c = getRedisClient();
  if (c) {
    try {
      return (await get(c, KEY_PREFIX + jti)) !== null;
    } catch (err) {
      logRedisError("jti.isRevoked", err);
      return false; // fail-open：Redis 挂时当未撤销（token TTL 兜底）
    }
  }
  gc();
  const entry = store.get(jti);
  if (!entry) return false;
  if (entry.expiresAt <= nowSec()) {
    store.delete(jti);
    return false;
  }
  return true;
}

export async function revoke(jti: string, ttlSec: number): Promise<void> {
  if (ttlSec <= 0) return;
  const c = getRedisClient();
  if (c) {
    try {
      await set(c, KEY_PREFIX + jti, "1", ttlSec);
    } catch (err) {
      logRedisError("jti.revoke", err); // fail-open：撤销写失败仅记录，不抛
    }
    return;
  }
  store.set(jti, { expiresAt: nowSec() + ttlSec });
}

/** 测试用：清空内存。Redis 路径由集成测试 flushDb。 */
export function _resetJtiStoreForTests(): void {
  store.clear();
}
