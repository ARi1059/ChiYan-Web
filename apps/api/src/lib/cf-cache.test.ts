import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../env";
import { purgeByTags } from "./cf-cache";

function makeEnv(over: Partial<Env> = {}): Env {
  return {
    ENV: "dev",
    ALLOWED_ORIGINS: '["http://localhost:5173"]',
    DATABASE_URL: "postgres://test",
    REDIS_URL: "redis://127.0.0.1:6379/0",
    MEDIA_ROOT: "/tmp/chiyan-test-media",
    API_PUBLIC_URL: "http://localhost:3000",
    JWT_SECRET: "test-jwt-secret-at-least-32-bytes-long-padding-padding",
    ENC_KEY_V1: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==",
    ...over,
  };
}

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
});

afterEach(() => {
  fetchSpy.mockRestore();
});

describe("cf-cache.purgeByTags", () => {
  it("空 tags → no-op，不发请求", async () => {
    await purgeByTags(makeEnv({ CF_API_TOKEN: "tok", CF_ZONE_ID: "zone" }), []);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("无 CF_API_TOKEN → no-op", async () => {
    await purgeByTags(makeEnv({}), ["model:M-2026-0001"]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("无 CF_ZONE_ID → no-op", async () => {
    await purgeByTags(makeEnv({ CF_API_TOKEN: "tok" }), ["model:M-2026-0001"]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("配置齐全 → POST 到 zones/{ZONE_ID}/purge_cache + Bearer + JSON body", async () => {
    await purgeByTags(makeEnv({ CF_API_TOKEN: "tok-abc", CF_ZONE_ID: "zone-xyz" }), [
      "model:M-2026-0001",
      "roster:2026-05-29",
    ]);
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://api.cloudflare.com/client/v4/zones/zone-xyz/purge_cache");
    expect((init as RequestInit).method).toBe("POST");
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("Authorization")).toBe("Bearer tok-abc");
    expect(headers.get("Content-Type")).toBe("application/json");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toEqual({ tags: ["model:M-2026-0001", "roster:2026-05-29"] });
  });

  it("CF 返回 4xx → 不抛", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("nope", { status: 403 }));
    await expect(
      purgeByTags(makeEnv({ CF_API_TOKEN: "tok", CF_ZONE_ID: "zone" }), ["x"]),
    ).resolves.toBeUndefined();
  });

  it("fetch 抛 → 不冒泡", async () => {
    fetchSpy.mockRejectedValueOnce(new Error("network down"));
    await expect(
      purgeByTags(makeEnv({ CF_API_TOKEN: "tok", CF_ZONE_ID: "zone" }), ["x"]),
    ).resolves.toBeUndefined();
  });
});
