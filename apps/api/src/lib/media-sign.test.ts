import { beforeEach, describe, expect, it } from "vitest";
import { _consumeSignedKey, _resetMediaSignForTests, signMediaUpload } from "./media-sign";

const ENV = {
  API_PUBLIC_URL: "http://localhost:3000",
} as Parameters<typeof signMediaUpload>[0];

beforeEach(() => {
  _resetMediaSignForTests();
});

describe("signMediaUpload", () => {
  it("生成 object_key = media/YYYYMM/<10>.<ext>，upload_url 指向 API_PUBLIC_URL", async () => {
    const res = await signMediaUpload(ENV, {
      type: "image",
      filename: "cover.JPG",
      content_type: "image/jpeg",
    });
    expect(res.object_key).toMatch(/^media\/\d{6}\/[A-HJ-NP-Za-hjkmnp-z2-9]{10}\.jpg$/);
    expect(res.upload_url).toContain("http://localhost:3000/api/v1/admin/media/upload");
    expect(res.upload_url).toContain(encodeURIComponent(res.object_key));
    expect(res.upload_url).toContain("sig=mock");
    expect(res.upload_url).toContain("expires=");
    expect(res.expires_at.getTime()).toBeGreaterThan(Date.now());
  });

  it("API_PUBLIC_URL 尾斜杠去重", async () => {
    const res = await signMediaUpload(
      { API_PUBLIC_URL: "http://localhost:3000///" } as Parameters<typeof signMediaUpload>[0],
      { type: "image", filename: "a.png", content_type: "image/png" },
    );
    expect(res.upload_url.startsWith("http://localhost:3000/api/v1/admin/media/upload")).toBe(true);
  });

  it("文件名无后缀 → ext=bin；非法字符过滤", async () => {
    const r1 = await signMediaUpload(ENV, { type: "image", filename: "no_dot", content_type: "" });
    expect(r1.object_key.endsWith(".bin")).toBe(true);
    const r2 = await signMediaUpload(ENV, { type: "image", filename: "x.J.peg", content_type: "" });
    expect(r2.object_key.endsWith(".peg")).toBe(true);
  });

  it("expires_at 约 15min 后", async () => {
    const before = Date.now();
    const r = await signMediaUpload(ENV, { type: "image", filename: "a.png", content_type: "image/png" });
    const after = Date.now();
    const diff = r.expires_at.getTime() - before;
    expect(diff).toBeGreaterThanOrEqual(15 * 60 * 1000 - 50);
    expect(r.expires_at.getTime() - after).toBeLessThanOrEqual(15 * 60 * 1000);
  });
});

describe("_consumeSignedKey", () => {
  it("sign 过的 key → true；消费后再 consume → false", async () => {
    const r = await signMediaUpload(ENV, { type: "image", filename: "x.png", content_type: "image/png" });
    expect(_consumeSignedKey(r.object_key)).toBe(true);
    expect(_consumeSignedKey(r.object_key)).toBe(false);
  });

  it("从未 sign 过的 key → false", () => {
    expect(_consumeSignedKey("media/202605/unknownkey.jpg")).toBe(false);
  });
});
