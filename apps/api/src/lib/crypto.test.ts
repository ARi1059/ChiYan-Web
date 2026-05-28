import { describe, expect, it } from "vitest";
import { decrypt, encrypt, generateKey, type KeyRing } from "./crypto";

describe("AES-256-GCM field encryption", () => {
  it("round-trips a UTF-8 string", async () => {
    const key = generateKey();
    const plain = "张三 · 158-0000-0000";
    const blob = await encrypt(plain, 1, key);
    const out = await decrypt(blob, { 1: key });
    expect(out).toBe(plain);
  });

  it("uses random IV per encryption (same plaintext → different ciphertext)", async () => {
    const key = generateKey();
    const a = await encrypt("hello", 1, key);
    const b = await encrypt("hello", 1, key);
    expect(a).not.toEqual(b);
    // first byte (version) must match
    expect(a[0]).toBe(1);
    expect(b[0]).toBe(1);
  });

  it("routes decryption by key version (v1 + v2 coexistence)", async () => {
    const k1 = generateKey();
    const k2 = generateKey();
    const ring: KeyRing = { 1: k1, 2: k2 };
    const blobV1 = await encrypt("alpha", 1, k1);
    const blobV2 = await encrypt("beta", 2, k2);
    expect(blobV1[0]).toBe(1);
    expect(blobV2[0]).toBe(2);
    expect(await decrypt(blobV1, ring)).toBe("alpha");
    expect(await decrypt(blobV2, ring)).toBe("beta");
  });

  it("rejects ciphertext when key version is missing from the ring", async () => {
    const k1 = generateKey();
    const blob = await encrypt("x", 1, k1);
    await expect(decrypt(blob, { 2: k1 })).rejects.toThrow(/version 1/);
  });

  it("rejects tampered ciphertext (GCM tag mismatch)", async () => {
    const key = generateKey();
    const blob = await encrypt("integrity", 1, key);
    blob[blob.byteLength - 1] = (blob[blob.byteLength - 1] ?? 0) ^ 0xff;
    await expect(decrypt(blob, { 1: key })).rejects.toBeDefined();
  });

  it("rejects key that is not exactly 32 bytes", async () => {
    const short = new Uint8Array(16);
    await expect(encrypt("x", 1, short)).rejects.toThrow(/32 bytes/);
  });
});
