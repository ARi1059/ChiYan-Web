/**
 * upstash REST wrapper：mock fetch 验证 命令构造 + Bearer 鉴权 + 错误处理。
 * Step 7 切真实 endpoint 后由 e2e 兜底。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as upstash from "./upstash";

const cfg = { url: "https://x.upstash.io", token: "tok_123" };

const realFetch = globalThis.fetch;

function mockResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  globalThis.fetch = vi.fn() as never;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("upstash REST wrapper", () => {
  it("SET with EX", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse({ result: "OK" }));
    await upstash.set(cfg, "k", "v", 60);
    const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe("https://x.upstash.io");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toEqual(["SET", "k", "v", "EX", 60]);
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer tok_123");
  });

  it("GET returns null on null result", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse({ result: null }));
    expect(await upstash.get(cfg, "k")).toBeNull();
  });

  it("ZADD returns numeric result", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse({ result: 1 }));
    expect(await upstash.zadd(cfg, "k", 100, "m")).toBe(1);
  });

  it("ZCARD returns numeric", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse({ result: 7 }));
    expect(await upstash.zcard(cfg, "k")).toBe(7);
  });

  it("ZREMRANGEBYSCORE supports - / + inf strings via numeric or string min/max", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse({ result: 3 }));
    await upstash.zremrangebyscore(cfg, "k", 0, 100);
    const body = JSON.parse(
      ((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1] as RequestInit).body as string,
    );
    expect(body).toEqual(["ZREMRANGEBYSCORE", "k", 0, 100]);
  });

  it("throws on non-OK HTTP", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse({}, 500));
    await expect(upstash.get(cfg, "k")).rejects.toThrow(/upstash GET failed: 500/);
  });

  it("throws on body.error", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse({ error: "ERR something" }));
    await expect(upstash.get(cfg, "k")).rejects.toThrow(/upstash GET error: ERR something/);
  });
});
