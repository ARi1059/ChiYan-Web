import { describe, expect, it } from "vitest";
import { sanitize } from "./sanitize";

describe("sanitize", () => {
  it("masks sensitive top-level fields", () => {
    expect(sanitize({ username: "a", password: "p" })).toEqual({
      username: "a",
      password: "***",
    });
  });

  it("masks deep nested fields", () => {
    expect(
      sanitize({
        payload: { admin: { username: "a", one_time_password: "X1y" } },
      }),
    ).toEqual({
      payload: { admin: { username: "a", one_time_password: "***" } },
    });
  });

  it("handles arrays", () => {
    expect(sanitize([{ password: "p" }, { code: "123456" }])).toEqual([
      { password: "***" },
      { code: "***" },
    ]);
  });

  it("leaves non-sensitive fields untouched", () => {
    expect(sanitize({ username: "alice", role: "owner", count: 5 })).toEqual({
      username: "alice",
      role: "owner",
      count: 5,
    });
  });

  it("handles circular references", () => {
    const a: Record<string, unknown> = { name: "a" };
    a.self = a;
    const out = sanitize(a) as Record<string, unknown>;
    expect(out["name"]).toBe("a");
    expect(out["self"]).toBe("[Circular]");
  });

  it("masks all token-family fields", () => {
    expect(
      sanitize({
        access_token: "x",
        refresh_token: "y",
        challenge_token: "z",
        csrf_token: "w",
      }),
    ).toEqual({
      access_token: "***",
      refresh_token: "***",
      challenge_token: "***",
      csrf_token: "***",
    });
  });
});
