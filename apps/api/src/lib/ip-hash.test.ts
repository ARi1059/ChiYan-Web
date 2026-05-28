import { describe, expect, it } from "vitest";
import { hashIp } from "./ip-hash";

describe("ip-hash", () => {
  // 已知向量：echo -n "1.2.3.4" | shasum -a 256
  it("'1.2.3.4' → 已知 SHA-256 hex", async () => {
    const h = await hashIp("1.2.3.4");
    expect(h).toBe("6694f83c9f476da31f5df6bcc520034e7e57d421d247b9d34f49edbfc84a764c");
  });

  it("64 字符 hex（IPv4 + IPv6）", async () => {
    const h4 = await hashIp("127.0.0.1");
    expect(h4).toMatch(/^[0-9a-f]{64}$/);
    const h6 = await hashIp("2001:db8::1");
    expect(h6).toMatch(/^[0-9a-f]{64}$/);
  });

  it("相同 IP 多次哈希一致（无盐）", async () => {
    const a = await hashIp("8.8.8.8");
    const b = await hashIp("8.8.8.8");
    expect(a).toBe(b);
  });

  it("不同 IP 不同哈希", async () => {
    const a = await hashIp("1.1.1.1");
    const b = await hashIp("1.1.1.2");
    expect(a).not.toBe(b);
  });

  it("null / undefined / '' → null 透传", async () => {
    expect(await hashIp(null)).toBeNull();
    expect(await hashIp(undefined)).toBeNull();
    expect(await hashIp("")).toBeNull();
  });
});
