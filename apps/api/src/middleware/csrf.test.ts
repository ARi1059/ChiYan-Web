import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { AppContext } from "../env";
import { csrf } from "./csrf";

function app() {
  const a = new Hono<AppContext>();
  a.use("/protected/*", csrf);
  a.post("/protected/x", (c) => c.json({ ok: true }));
  return a;
}

describe("csrf middleware (dual token)", () => {
  it("rejects when header missing", async () => {
    const res = await app().request("/protected/x", {
      method: "POST",
      headers: { Cookie: "chiyan_csrf=abc123" },
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code: number; data?: { sub_code?: string } };
    expect(body.code).toBe(40301);
    expect(body.data?.sub_code).toBe("csrf_invalid");
  });

  it("rejects when cookie missing", async () => {
    const res = await app().request("/protected/x", {
      method: "POST",
      headers: { "X-CSRF-Token": "abc123" },
    });
    expect(res.status).toBe(403);
  });

  it("rejects when values mismatch", async () => {
    const res = await app().request("/protected/x", {
      method: "POST",
      headers: { "X-CSRF-Token": "abc123", Cookie: "chiyan_csrf=xyz789" },
    });
    expect(res.status).toBe(403);
  });

  it("passes when header == cookie", async () => {
    const res = await app().request("/protected/x", {
      method: "POST",
      headers: { "X-CSRF-Token": "match", Cookie: "chiyan_csrf=match" },
    });
    expect(res.status).toBe(200);
  });
});
