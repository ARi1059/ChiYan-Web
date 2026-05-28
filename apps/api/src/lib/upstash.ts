/**
 * Upstash Redis REST 客户端（极简）。
 *
 * 接口方案 §6 line 433：Upstash REST 而非 ioredis（Workers 不支持原生 socket）。
 *
 * 5 个原语足够 Phase 1 用：
 *   set(key, value, exSec)        ─ jti/challenge 入库
 *   get(key)                      ─ 偶尔回查（rare）
 *   zadd(key, score, member)      ─ rate-limit 滑动窗口
 *   zremrangebyscore(key, 0, max) ─ 过期成员清理
 *   zcard(key)                    ─ 当前计数
 *
 * 鉴权：Authorization: Bearer ${UPSTASH_REDIS_REST_TOKEN}
 *
 * 失败处理：网络错 / 4xx / 5xx 一律抛错（上层决定是否降级到 in-memory 或拒绝服务）。
 * Phase 1 测试通过 mock fetch 验证，**不**真连 Upstash。
 */

export interface UpstashConfig {
  url: string;
  token: string;
}

interface UpstashResponse {
  result?: unknown;
  error?: string;
}

async function exec(cfg: UpstashConfig, command: (string | number)[]): Promise<unknown> {
  const res = await fetch(cfg.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`upstash ${command[0]} failed: ${res.status} ${text}`);
  }

  const body = (await res.json()) as UpstashResponse;
  if (body.error) throw new Error(`upstash ${command[0]} error: ${body.error}`);
  return body.result;
}

export async function set(cfg: UpstashConfig, key: string, value: string, exSec?: number): Promise<void> {
  const cmd: (string | number)[] = ["SET", key, value];
  if (exSec && exSec > 0) {
    cmd.push("EX", exSec);
  }
  await exec(cfg, cmd);
}

export async function get(cfg: UpstashConfig, key: string): Promise<string | null> {
  const r = await exec(cfg, ["GET", key]);
  return r == null ? null : String(r);
}

export async function zadd(cfg: UpstashConfig, key: string, score: number, member: string): Promise<number> {
  const r = await exec(cfg, ["ZADD", key, score, member]);
  return typeof r === "number" ? r : Number(r);
}

export async function zremrangebyscore(cfg: UpstashConfig, key: string, min: number | string, max: number | string): Promise<number> {
  const r = await exec(cfg, ["ZREMRANGEBYSCORE", key, min, max]);
  return typeof r === "number" ? r : Number(r);
}

export async function zcard(cfg: UpstashConfig, key: string): Promise<number> {
  const r = await exec(cfg, ["ZCARD", key]);
  return typeof r === "number" ? r : Number(r);
}

export async function expire(cfg: UpstashConfig, key: string, sec: number): Promise<void> {
  await exec(cfg, ["EXPIRE", key, sec]);
}

export function configFromEnv(env: { UPSTASH_REDIS_REST_URL: string; UPSTASH_REDIS_REST_TOKEN: string }): UpstashConfig {
  return { url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN };
}
