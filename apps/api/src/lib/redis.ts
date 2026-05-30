/**
 * Redis 客户端封装（node-redis v4）。
 *
 * 接口方案 §6: 限流滑动窗口 + jti 黑名单 + 一次性 challenge token。
 *
 * 5 + 1 个原语足够 Phase 1 用：
 *   set(key, value, exSec)        ─ jti/challenge 入库
 *   get(key)                      ─ 偶尔回查（rare）
 *   zadd(key, score, member)      ─ rate-limit 滑动窗口
 *   zremrangebyscore(key, 0, max) ─ 过期成员清理
 *   zcard(key)                    ─ 当前计数
 *   expire(key, sec)              ─ 兜底 TTL
 *
 * 单例：server.ts 启动时 createRedis + setRedisClient；各 store 内部 getRedisClient()
 * 拿共享 client。getRedisClient() 返回 null 时（未注入 / 连接失败），store 退回 in-memory
 * Map —— 见 jti-store / challenge-store / totp-setup-store / rate-limit。
 *
 * 失败处理：所有原语透传 node-redis 抛出的错误；调用方按 fail-open（限流/jti）或
 * fail-closed（challenge/totp-setup）降级，并调 logRedisError 记录。
 */
import { createClient, type RedisClientType } from "redis";

export type RedisClient = RedisClientType;

export async function createRedis(url: string): Promise<RedisClient> {
  const client: RedisClient = createClient({ url });
  client.on("error", (err) => {
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: "error",
        source: "redis",
        msg: err instanceof Error ? err.message : String(err),
      }),
    );
  });
  try {
    await client.connect();
  } catch (err) {
    // 连接失败：关掉后台 socket / 重连 timer，避免持续刷 error 日志，再上抛由调用方降级到内存
    try {
      await client.disconnect();
    } catch {
      /* already down */
    }
    throw err;
  }
  return client;
}

export async function set(
  c: RedisClient,
  key: string,
  value: string,
  exSec?: number,
): Promise<void> {
  if (exSec && exSec > 0) {
    await c.set(key, value, { EX: exSec });
  } else {
    await c.set(key, value);
  }
}

export async function get(c: RedisClient, key: string): Promise<string | null> {
  return c.get(key);
}

export async function zadd(
  c: RedisClient,
  key: string,
  score: number,
  member: string,
): Promise<number> {
  return c.zAdd(key, { score, value: member });
}

export async function zremrangebyscore(
  c: RedisClient,
  key: string,
  min: number,
  max: number,
): Promise<number> {
  return c.zRemRangeByScore(key, min, max);
}

export async function zcard(c: RedisClient, key: string): Promise<number> {
  return c.zCard(key);
}

export async function expire(c: RedisClient, key: string, sec: number): Promise<void> {
  await c.expire(key, sec);
}

/** key 删除（rare：手动失效）。 */
export async function del(c: RedisClient, key: string): Promise<void> {
  await c.del(key);
}

/** 原子读取并删除 —— challenge 一次性消费防重放（node-redis GETDEL，单命令原子）。 */
export async function getDel(c: RedisClient, key: string): Promise<string | null> {
  return c.getDel(key);
}

/** sorted set 按 score 升序取 [start,stop]（含 score）。限流取最旧戳算 retry-after。 */
export async function zrangeWithScores(
  c: RedisClient,
  key: string,
  start: number,
  stop: number,
): Promise<Array<{ value: string; score: number }>> {
  return c.zRangeWithScores(key, start, stop);
}

// ─── 模块级单例 ───────────────────────────────────────────────
// server.ts 启动时 setRedisClient(await createRedis(...))；store 内部 getRedisClient()。
// 与 lib/db.ts 的 setDb/getDb 同构。getRedisClient() 为 null 时各 store 退回 in-memory Map。
let sharedClient: RedisClient | null = null;

export function setRedisClient(c: RedisClient | null): void {
  sharedClient = c;
}

export function getRedisClient(): RedisClient | null {
  return sharedClient;
}

/** store 在 fail-open / fail-closed 降级时统一记录（结构化，便于 journalctl 抓）。 */
export function logRedisError(source: string, err: unknown): void {
  console.error(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: "error",
      source: `redis:${source}`,
      msg: err instanceof Error ? err.message : String(err),
    }),
  );
}
