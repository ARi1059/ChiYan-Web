/**
 * node-redis v4 wrapper：用 fake client 验证 6 个原语的形参传递。
 * Step 7 切真实 endpoint 后由 e2e 兜底。
 */
import { describe, expect, it, vi } from "vitest";
import * as r from "./redis";
import type { RedisClient } from "./redis";

function fakeClient() {
  return {
    set: vi.fn().mockResolvedValue("OK"),
    get: vi.fn().mockResolvedValue(null),
    zAdd: vi.fn().mockResolvedValue(1),
    zRemRangeByScore: vi.fn().mockResolvedValue(3),
    zCard: vi.fn().mockResolvedValue(7),
    expire: vi.fn().mockResolvedValue(true),
  } as unknown as RedisClient & {
    set: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    zAdd: ReturnType<typeof vi.fn>;
    zRemRangeByScore: ReturnType<typeof vi.fn>;
    zCard: ReturnType<typeof vi.fn>;
    expire: ReturnType<typeof vi.fn>;
  };
}

describe("redis wrapper", () => {
  it("SET with EX", async () => {
    const c = fakeClient();
    await r.set(c, "k", "v", 60);
    expect(c.set).toHaveBeenCalledWith("k", "v", { EX: 60 });
  });

  it("SET without TTL", async () => {
    const c = fakeClient();
    await r.set(c, "k", "v");
    expect(c.set).toHaveBeenCalledWith("k", "v");
  });

  it("SET ignores zero/negative TTL", async () => {
    const c = fakeClient();
    await r.set(c, "k", "v", 0);
    expect(c.set).toHaveBeenCalledWith("k", "v");
  });

  it("GET returns null", async () => {
    const c = fakeClient();
    expect(await r.get(c, "k")).toBeNull();
  });

  it("ZADD forwards score/member object", async () => {
    const c = fakeClient();
    expect(await r.zadd(c, "k", 100, "m")).toBe(1);
    expect(c.zAdd).toHaveBeenCalledWith("k", { score: 100, value: "m" });
  });

  it("ZREMRANGEBYSCORE forwards min/max", async () => {
    const c = fakeClient();
    expect(await r.zremrangebyscore(c, "k", 0, 100)).toBe(3);
    expect(c.zRemRangeByScore).toHaveBeenCalledWith("k", 0, 100);
  });

  it("ZCARD returns count", async () => {
    const c = fakeClient();
    expect(await r.zcard(c, "k")).toBe(7);
  });

  it("EXPIRE forwards seconds", async () => {
    const c = fakeClient();
    await r.expire(c, "k", 30);
    expect(c.expire).toHaveBeenCalledWith("k", 30);
  });

  it("propagates client errors", async () => {
    const c = fakeClient();
    (c.get as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("boom"));
    await expect(r.get(c, "k")).rejects.toThrow("boom");
  });
});
