/**
 * jti 黑名单：撤销已签发的 access/refresh token。
 *
 * 接口：从一开始就 async，Step 7 切 Upstash 时只换实现。
 *   - isRevoked(jti) → 是否已加黑
 *   - revoke(jti, ttlSec) → 加黑，TTL 应等于 token 自然过期剩余秒数
 *
 * Phase 1 mock：in-memory Map。
 *   - Workers isolate 之间不共享、cold start 后会丢
 *   - 仅本地 dev 用；上 staging 之前必须切 Upstash
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

export async function isRevoked(jti: string): Promise<boolean> {
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
  store.set(jti, { expiresAt: nowSec() + ttlSec });
}

/** 测试用：清空内存。 */
export function _resetJtiStoreForTests(): void {
  store.clear();
}
