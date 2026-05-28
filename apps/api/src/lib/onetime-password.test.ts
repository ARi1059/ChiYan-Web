import { describe, expect, it } from "vitest";
import { generateOneTimePassword } from "./onetime-password";

describe("generateOneTimePassword", () => {
  it("默认 16 字符，全在 alphabet 内", () => {
    const pwd = generateOneTimePassword();
    expect(pwd.length).toBe(16);
    expect(pwd).toMatch(/^[A-HJ-NP-Za-hjkmnp-z2-9]{16}$/);
  });

  it("不含易混字符 0/O/1/l/I/o", () => {
    for (let i = 0; i < 20; i++) {
      const pwd = generateOneTimePassword();
      expect(pwd).not.toMatch(/[0O1lIo]/);
    }
  });

  it("连续调用结果不同（熵充足）", () => {
    const a = generateOneTimePassword();
    const b = generateOneTimePassword();
    expect(a).not.toBe(b);
  });
});
