/**
 * Redis 后端集成测试 —— 验证 setRedisClient 后四个 store 真的走 Redis（重启 / 多实例共享、
 * 按 TTL 过期），而非进程内 Map。
 *
 * 关键手法：每个用例先操作，再调 _resetXxxForTests() 清内存 Map；若数据仍在 → 证明在 Redis。
 *
 * 需要 TEST_REDIS_URL（或 REDIS_URL）。无则整组 skip（不打扰本地无 redis 环境）。
 * CI 用 redis:7 service，job env 注 TEST_REDIS_URL=redis://127.0.0.1:6379/1。
 * 用 db 1，afterEach flushDb，与 dev 的 db 0 隔离。
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createRedis, setRedisClient, type RedisClient } from "./redis";
import { isRevoked, revoke, _resetJtiStoreForTests } from "./jti-store";
import { put, consume, _resetChallengeStoreForTests } from "./challenge-store";
import {
  putSecret,
  getSecret,
  clearSecret,
  _resetTotpSetupStoreForTests,
} from "./totp-setup-store";
import { consumeBucket, _resetRateLimitForTests, type BucketOpts } from "../middleware/rate-limit";

const REDIS_URL = process.env.TEST_REDIS_URL ?? process.env.REDIS_URL;
const describeIf = REDIS_URL ? describe : describe.skip;

describeIf("Redis 后端 — 四个 store 走 Redis 而非内存", () => {
  let client: RedisClient;

  beforeAll(async () => {
    client = await createRedis(REDIS_URL!);
    setRedisClient(client);
  });

  afterEach(async () => {
    await client.flushDb();
  });

  afterAll(async () => {
    setRedisClient(null);
    await client.quit();
  });

  it("jti：revoke 后 isRevoked，清内存仍命中（在 Redis）", async () => {
    await revoke("jti-1", 60);
    _resetJtiStoreForTests(); // 若走内存早没了
    expect(await isRevoked("jti-1")).toBe(true);
    expect(await isRevoked("never-revoked")).toBe(false);
  });

  it("challenge：GETDEL 一次性消费，重放第二次失败", async () => {
    await put("ch-1", 60);
    _resetChallengeStoreForTests();
    expect(await consume("ch-1")).toBe(true); // 首次
    expect(await consume("ch-1")).toBe(false); // 重放 → 已删
    expect(await consume("ch-unknown")).toBe(false);
  });

  it("totp-setup：put/get/clear 走 Redis", async () => {
    await putSecret(42, "JBSWY3DPEHPK3PXP", 60);
    _resetTotpSetupStoreForTests();
    expect(await getSecret(42)).toBe("JBSWY3DPEHPK3PXP");
    await clearSecret(42);
    expect(await getSecret(42)).toBeNull();
  });

  it("rate-limit：滑窗计数走 Redis，超 max 即 blocked", async () => {
    const opts: BucketOpts = { bucket: "public_ip", windowMs: 60_000, max: 3 };
    const key = "1.2.3.4";
    expect((await consumeBucket(opts, key)).blocked).toBe(false); // 1
    expect((await consumeBucket(opts, key)).blocked).toBe(false); // 2
    expect((await consumeBucket(opts, key)).blocked).toBe(false); // 3
    _resetRateLimitForTests(); // 清内存：Redis 计数不受影响
    const r4 = await consumeBucket(opts, key); // 4 > 3
    expect(r4.blocked).toBe(true);
    expect(r4.retryAfterSec).toBeGreaterThan(0);
  });

  it("rate-limit：flushDb 后计数清零", async () => {
    const opts: BucketOpts = { bucket: "login_ip", windowMs: 60_000, max: 1 };
    expect((await consumeBucket(opts, "9.9.9.9")).blocked).toBe(false);
    expect((await consumeBucket(opts, "9.9.9.9")).blocked).toBe(true);
    await client.flushDb();
    expect((await consumeBucket(opts, "9.9.9.9")).blocked).toBe(false);
  });
});
