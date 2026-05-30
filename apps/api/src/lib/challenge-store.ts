/**
 * challenge_token 单次消费存储。
 *
 * 登录第一步成功后发 challenge_token（jti，TTL 5min）；/auth/login/totp 校验 totp 时
 * consume(jti) —— 用完即删，重放无效。
 *
 * 后端：getRedisClient() 有则用 Redis（SET k 1 EX ttl / 原子 GETDEL）；为 null 时退回 in-memory Map。
 *
 * 降级：challenge 是登录安全关键，fail-closed —— put 失败上抛（登录第一步失败）、
 * consume 失败返回 false（拒绝登录第二步），绝不因 Redis 抖动放过重放。
 */
import { getRedisClient, set, getDel, logRedisError } from "./redis";

const KEY_PREFIX = "challenge:";

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

export async function put(jti: string, ttlSec: number): Promise<void> {
  if (ttlSec <= 0) return;
  const c = getRedisClient();
  if (c) {
    try {
      await set(c, KEY_PREFIX + jti, "1", ttlSec);
    } catch (err) {
      logRedisError("challenge.put", err);
      throw err; // fail-closed：发不出 challenge 就让登录第一步失败
    }
    return;
  }
  store.set(jti, { expiresAt: nowSec() + ttlSec });
}

/** 存在且未过期 → 删除并返回 true；否则 false。Redis 用原子 GETDEL 防并发重放。 */
export async function consume(jti: string): Promise<boolean> {
  const c = getRedisClient();
  if (c) {
    try {
      // GETDEL 返回非 null 即"存在且未过期"（过期由 Redis 按 EX 自动删，返回 null）
      return (await getDel(c, KEY_PREFIX + jti)) !== null;
    } catch (err) {
      logRedisError("challenge.consume", err);
      return false; // fail-closed：Redis 挂时拒绝（宁可让用户重登，不放过重放）
    }
  }
  gc();
  const entry = store.get(jti);
  if (!entry) return false;
  store.delete(jti);
  return entry.expiresAt > nowSec();
}

export function _resetChallengeStoreForTests(): void {
  store.clear();
}
