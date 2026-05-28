import { describe, expect, it } from "vitest";
import { generateOneTimePassword, hashPassword, verifyPassword } from "./password";

describe("bcryptjs password hash/verify", () => {
  it("verifies a known password against its hash", async () => {
    const hash = await hashPassword("CorrectHorseBatteryStaple!1");
    expect(await verifyPassword("CorrectHorseBatteryStaple!1", hash)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("alpha-bravo-12345!");
    expect(await verifyPassword("alpha-bravo-1234!", hash)).toBe(false);
  });

  it("produces a unique hash per call (random salt)", async () => {
    const a = await hashPassword("same-input");
    const b = await hashPassword("same-input");
    expect(a).not.toBe(b);
    expect(await verifyPassword("same-input", a)).toBe(true);
    expect(await verifyPassword("same-input", b)).toBe(true);
  });

  it("completes hash within the Workers paid 30s CPU budget", async () => {
    const t0 = performance.now();
    await hashPassword("budget-check");
    const elapsed = performance.now() - t0;
    expect(elapsed).toBeLessThan(5_000);
  });
});

describe("generateOneTimePassword", () => {
  it("produces a URL-safe string of the requested length", () => {
    const p = generateOneTimePassword(20);
    expect(p).toHaveLength(20);
    expect(p).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("produces a different string per call", () => {
    const a = generateOneTimePassword();
    const b = generateOneTimePassword();
    expect(a).not.toBe(b);
  });
});
