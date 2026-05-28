import { afterEach, describe, expect, it } from "vitest";
import { _resetJtiStoreForTests, isRevoked, revoke } from "./jti-store";

describe("jti-store (in-memory mock)", () => {
  afterEach(() => _resetJtiStoreForTests());

  it("returns false for unknown jti", async () => {
    expect(await isRevoked("never-seen")).toBe(false);
  });

  it("returns true after revoke until ttl elapsed", async () => {
    await revoke("j1", 60);
    expect(await isRevoked("j1")).toBe(true);
  });

  it("ttl <= 0 is no-op", async () => {
    await revoke("j2", 0);
    expect(await isRevoked("j2")).toBe(false);
    await revoke("j3", -1);
    expect(await isRevoked("j3")).toBe(false);
  });
});
