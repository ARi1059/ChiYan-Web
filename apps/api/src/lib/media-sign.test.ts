import { beforeEach, describe, expect, it } from "vitest";
import {
  _consumeSignedKey,
  _markKeyUploaded,
  _resetMediaSignForTests,
  signMediaUpload,
  signUploadSig,
  verifyUploadSig,
} from "./media-sign";

const ENV = {
  API_PUBLIC_URL: "http://localhost:3000",
  JWT_SECRET: "test-secret-at-least-32-bytes-long-xx",
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
    expect(res.upload_url).toMatch(/sig=[A-Za-z0-9\-_]+/);
    expect(res.upload_url).toContain("expires=");
    expect(res.expires_at.getTime()).toBeGreaterThan(Date.now());
  });

  it("API_PUBLIC_URL 尾斜杠去重", async () => {
    const res = await signMediaUpload(
      { ...ENV, API_PUBLIC_URL: "http://localhost:3000///" } as Parameters<typeof signMediaUpload>[0],
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

describe("signUploadSig / verifyUploadSig (HMAC)", () => {
  it("同一 (secret, key, expires) → 同 sig；篡改任一参数 sig 变", async () => {
    const sig1 = await signUploadSig(ENV.JWT_SECRET, "media/202611/abc.jpg", 1_700_000_000_000);
    const sig2 = await signUploadSig(ENV.JWT_SECRET, "media/202611/abc.jpg", 1_700_000_000_000);
    expect(sig1).toBe(sig2);
    const sigKey = await signUploadSig(ENV.JWT_SECRET, "media/202611/abd.jpg", 1_700_000_000_000);
    expect(sigKey).not.toBe(sig1);
    const sigExp = await signUploadSig(ENV.JWT_SECRET, "media/202611/abc.jpg", 1_700_000_000_001);
    expect(sigExp).not.toBe(sig1);
  });

  it("verify ok / bad_sig / expired 三态", async () => {
    const future = Date.now() + 60_000;
    const past = Date.now() - 1;
    const key = "media/202611/abc.jpg";
    const sig = await signUploadSig(ENV.JWT_SECRET, key, future);

    expect(await verifyUploadSig(ENV.JWT_SECRET, key, sig, future)).toEqual({ ok: true });
    expect(await verifyUploadSig(ENV.JWT_SECRET, key, "wrong-sig-xxxxxx", future)).toEqual({
      ok: false,
      reason: "bad_sig",
    });
    expect(await verifyUploadSig(ENV.JWT_SECRET, key, sig, past)).toEqual({
      ok: false,
      reason: "expired",
    });
  });
});

describe("_markKeyUploaded + _consumeSignedKey", () => {
  it("sign 不写 → consume 失败；_markKeyUploaded 后 consume 返 meta；再 consume null", async () => {
    const r = await signMediaUpload(ENV, { type: "image", filename: "x.png", content_type: "image/png" });
    // 仅 sign 还没 PUT，register 必败
    expect(_consumeSignedKey(r.object_key)).toBeNull();
    _markKeyUploaded(r.object_key);
    // 没传 meta → 默认 EMPTY_META 结构（width null 等）但对象本身 truthy
    const meta = _consumeSignedKey(r.object_key);
    expect(meta).not.toBeNull();
    expect(meta?.width).toBeNull();
    expect(meta?.hasWatermark).toBe(false);
    // 一次性
    expect(_consumeSignedKey(r.object_key)).toBeNull();
  });

  it("从未 sign 过的 key → null", () => {
    expect(_consumeSignedKey("media/202605/unknownkey.jpg")).toBeNull();
  });

  it("携带 meta → consume 返回 meta", async () => {
    const r = await signMediaUpload(ENV, { type: "image", filename: "y.jpg", content_type: "image/jpeg" });
    _markKeyUploaded(r.object_key, {
      width: 800,
      height: 1200,
      thumbObjectKey: "thumbs/media/X/abc.webp",
      hasWatermark: true,
      fileSize: 12345,
    });
    const meta = _consumeSignedKey(r.object_key);
    expect(meta).toEqual({
      width: 800,
      height: 1200,
      thumbObjectKey: "thumbs/media/X/abc.webp",
      hasWatermark: true,
      fileSize: 12345,
    });
  });
});
