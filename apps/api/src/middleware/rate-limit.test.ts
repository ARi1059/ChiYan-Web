import { Hono } from "hono";
import { afterEach, describe, expect, it } from "vitest";
import type { AppContext } from "../env";
import { _resetRateLimitForTests, keyFromIp, rateLimit } from "./rate-limit";

function app() {
  const a = new Hono<AppContext>();
  a.use(
    "*",
    rateLimit({ bucket: "public", windowMs: 60_000, max: 3, key: keyFromIp }),
  );
  a.get("/ping", (c) => c.json({ ok: true }));
  return a;
}

const headers = { "CF-Connecting-IP": "1.2.3.4" };

describe("rate-limit (sliding window mock)", () => {
  afterEach(() => _resetRateLimitForTests());

  it("allows up to max requests, blocks the next with 429 + Retry-After", async () => {
    const a = app();
    for (let i = 0; i < 3; i++) {
      const res = await a.request("/ping", { headers });
      expect(res.status).toBe(200);
    }
    const blocked = await a.request("/ping", { headers });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toMatch(/^\d+$/);
    const body = (await blocked.json()) as { code: number; data: { sub_code: string } };
    expect(body.code).toBe(42901);
    expect(body.data.sub_code).toBe("rate_limited");
  });

  it("different IP gets its own bucket", async () => {
    const a = app();
    for (let i = 0; i < 3; i++) await a.request("/ping", { headers });
    const otherIp = await a.request("/ping", { headers: { "CF-Connecting-IP": "5.6.7.8" } });
    expect(otherIp.status).toBe(200);
  });

  it("no key (missing IP header) → skip limit", async () => {
    const a = app();
    for (let i = 0; i < 10; i++) {
      const res = await a.request("/ping");
      expect(res.status).toBe(200);
    }
  });
});
