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
 * 单例：server.ts 启动时创建一个共享 client，handler 通过参数注入或 lazy 持有。
 * **本 PR 范围内** stores 还是 in-memory Map，redis client 尚未实例化（Step 7 切上来）。
 *
 * 失败处理：所有原语透传 node-redis 抛出的错误；调用方决定降级策略。
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
  await client.connect();
  return client;
}

export async function set(c: RedisClient, key: string, value: string, exSec?: number): Promise<void> {
  if (exSec && exSec > 0) {
    await c.set(key, value, { EX: exSec });
  } else {
    await c.set(key, value);
  }
}

export async function get(c: RedisClient, key: string): Promise<string | null> {
  return c.get(key);
}

export async function zadd(c: RedisClient, key: string, score: number, member: string): Promise<number> {
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
