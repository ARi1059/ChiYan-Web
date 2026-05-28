/**
 * challenge_token 单次消费存储。
 *
 * 一次登录第一步成功后，发 challenge_token（jti，TTL 5min）。
 * /auth/login/totp 校验 totp 同时 consume(jti) — 用完即删，重放无效。
 *
 * 接口：async 从一开始就是 Promise，Step 7 切 Upstash（SET NX EX + GETDEL）。
 *
 * Phase 1 mock：in-memory Map。Workers 多 isolate 不共享，本地有效。
 */

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
  store.set(jti, { expiresAt: nowSec() + ttlSec });
}

/** 存在且未过期 → 删除并返回 true；否则 false。 */
export async function consume(jti: string): Promise<boolean> {
  gc();
  const entry = store.get(jti);
  if (!entry) return false;
  store.delete(jti);
  return entry.expiresAt > nowSec();
}

export function _resetChallengeStoreForTests(): void {
  store.clear();
}
