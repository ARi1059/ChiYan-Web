/**
 * media-static originals 防护回归测试。
 *
 * 原图（底片）只落 MEDIA_ROOT/originals/，绝不经公开静态层外发；公开槽 cover/gallery/thumbs
 * 正常 serve。关键断言：originals 下文件**即使真实存在**也 404（被前缀拦，非 not-found），
 * 与公开槽 200 对照——证明拦的是 originals 前缀，而非碰巧文件缺失。
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import app from "../index";

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]); // JPEG SOI magic
const MEDIA_ROOT = join(tmpdir(), "chiyan-mstatic-test");

const ENV = {
  ENV: "dev" as const,
  ALLOWED_ORIGINS: '["http://localhost:5173"]',
  DATABASE_URL: "postgres://test",
  REDIS_URL: "redis://127.0.0.1:6379/0",
  MEDIA_ROOT,
  API_PUBLIC_URL: "http://localhost:3000",
  JWT_SECRET: "test-jwt-secret-at-least-32-bytes-long-padding-padding",
  ENC_KEY_V1: btoa(String.fromCharCode(...new Uint8Array(32).fill(7))),
};

beforeAll(async () => {
  await mkdir(join(MEDIA_ROOT, "originals", "media", "202611"), { recursive: true });
  await mkdir(join(MEDIA_ROOT, "thumbs", "media", "202611"), { recursive: true });
  await writeFile(join(MEDIA_ROOT, "originals", "media", "202611", "secret.jpg"), JPEG);
  await writeFile(join(MEDIA_ROOT, "thumbs", "media", "202611", "pub.jpg"), JPEG);
});

afterAll(async () => {
  await rm(MEDIA_ROOT, { recursive: true, force: true });
});

describe("media-static — originals 防护", () => {
  it("originals/ 下原图即使存在也 404（被前缀拦，非 not-found）", async () => {
    const res = await app.request("/media/originals/media/202611/secret.jpg", {}, ENV);
    expect(res.status).toBe(404);
  });

  it("公开缩略槽正常 serve 200 + 嗅 magic 出 image/jpeg", async () => {
    const res = await app.request("/media/thumbs/media/202611/pub.jpg", {}, ENV);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/jpeg");
  });

  it("originals 前缀任意路径都 404", async () => {
    const res = await app.request("/media/originals/anything.jpg", {}, ENV);
    expect(res.status).toBe(404);
  });
});
