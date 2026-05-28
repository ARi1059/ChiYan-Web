import { describe, expect, it } from "vitest";

describe("vitest-pool-workers runtime", () => {
  it("runs basic assertions", () => {
    expect(1).toBe(1);
  });

  it("exposes WebCrypto via globalThis.crypto", async () => {
    const buf = new Uint8Array(16);
    crypto.getRandomValues(buf);
    expect(buf.some((b) => b !== 0)).toBe(true);

    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
      "encrypt",
      "decrypt",
    ]);
    expect(key.type).toBe("secret");
  });
});
