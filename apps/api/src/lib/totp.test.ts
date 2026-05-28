import { describe, expect, it } from "vitest";
import { buildOtpAuthUrl, generateCode, generateSecret, verifyCode } from "./totp";

describe("TOTP (HMAC-SHA1, 6 digits, 30s, window=1)", () => {
  it("generates a base32 secret usable for round-trip", () => {
    const s = generateSecret();
    expect(s).toMatch(/^[A-Z2-7]+=*$/);
    const code = generateCode(s);
    expect(code).toMatch(/^\d{6}$/);
    expect(verifyCode(s, code)).toBe(true);
  });

  it("builds a standards-compliant otpauth_url", () => {
    const url = buildOtpAuthUrl({ issuer: "ChiYan", label: "alice", secret: generateSecret() });
    expect(url.startsWith("otpauth://totp/")).toBe(true);
    expect(url).toContain("issuer=ChiYan");
    expect(url).toContain("algorithm=SHA1");
    expect(url).toContain("digits=6");
    expect(url).toContain("period=30");
  });

  it("tolerates ±30s clock skew (window=1)", () => {
    const s = generateSecret();
    const now = Date.now();
    const codePrev = generateCode(s, now - 30_000);
    const codeNext = generateCode(s, now + 30_000);
    expect(verifyCode(s, codePrev, { timestamp: now })).toBe(true);
    expect(verifyCode(s, codeNext, { timestamp: now })).toBe(true);
  });

  it("rejects ≥60s clock skew", () => {
    const s = generateSecret();
    const now = Date.now();
    const codeFarPast = generateCode(s, now - 90_000);
    expect(verifyCode(s, codeFarPast, { timestamp: now })).toBe(false);
  });

  it("rejects a wrong code", () => {
    const s = generateSecret();
    expect(verifyCode(s, "000000")).toBe(false);
  });
});
