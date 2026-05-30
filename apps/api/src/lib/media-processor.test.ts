/**
 * media-processor 单元测：用 sharp 自己生成一张 1200x1600 RGB 测试图，跑管线，断言
 *   - 三个槽都写到了正确路径
 *   - 主图 + 缩略都是 webp（magic bytes "RIFF...WEBP"）
 *   - 主图被 resize 到 ≤ MAX_MAIN（1600 长边）；缩略 ≤ MAX_THUMB（480 长边）
 *   - hasWatermark=true 时 meta 准确
 *   - 视频路径走 passthrough，无 thumb
 *   - 损坏 bytes 不抛错（回退分支）
 */
import { beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { processUpload } from "./media-processor";

let MEDIA_ROOT: string;

beforeAll(async () => {
  MEDIA_ROOT = await mkdtemp(join(tmpdir(), "chiyan-mp-"));
});

function isWebp(buf: Buffer): boolean {
  // RIFF....WEBP
  return (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  );
}

async function makeJpeg(width: number, height: number): Promise<Uint8Array> {
  // 3-channel solid 灰 + 一条横线（便于水印对齐用例可见）
  const buf = await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 120, g: 120, b: 120 },
    },
  })
    .jpeg({ quality: 80 })
    .toBuffer();
  return new Uint8Array(buf);
}

describe("processUpload — 图片管线", () => {
  it("1200x1600 jpeg → 三槽都写，主 ≤1600 长边，缩略 ≤480 长边，主图有水印", async () => {
    const bytes = await makeJpeg(1200, 1600);
    const objectKey = "media/202605/test1.jpg";
    const r = await processUpload({
      bytes,
      objectKey,
      mediaType: "image",
      mediaRoot: MEDIA_ROOT,
      watermarkText: "ChiYan Studio",
    });

    // ─ 三槽 ─
    await expect(stat(join(MEDIA_ROOT, "originals", objectKey))).resolves.toBeDefined();
    await expect(stat(join(MEDIA_ROOT, objectKey))).resolves.toBeDefined();
    expect(r.meta.thumbObjectKey).toMatch(/^thumbs\/media\/202605\/test1\.webp$/);
    await expect(stat(join(MEDIA_ROOT, r.meta.thumbObjectKey!))).resolves.toBeDefined();

    // ─ 主图 ─
    const main = await readFile(join(MEDIA_ROOT, objectKey));
    expect(isWebp(main)).toBe(true);
    const mainMeta = await sharp(main).metadata();
    expect(Math.max(mainMeta.width!, mainMeta.height!)).toBeLessThanOrEqual(1600);

    // ─ 缩略 ─
    const thumb = await readFile(join(MEDIA_ROOT, r.meta.thumbObjectKey!));
    expect(isWebp(thumb)).toBe(true);
    const thumbMeta = await sharp(thumb).metadata();
    expect(Math.max(thumbMeta.width!, thumbMeta.height!)).toBeLessThanOrEqual(480);

    // ─ meta ─
    expect(r.meta.hasWatermark).toBe(true);
    expect(r.meta.width).toBe(mainMeta.width);
    expect(r.meta.height).toBe(mainMeta.height);
    expect(r.meta.fileSize).toBe(main.byteLength);
  });

  it("水印文本空 → hasWatermark=false 但仍 resize + WebP", async () => {
    const bytes = await makeJpeg(600, 800);
    const objectKey = "media/202605/test2.jpg";
    const r = await processUpload({
      bytes,
      objectKey,
      mediaType: "image",
      mediaRoot: MEDIA_ROOT,
      watermarkText: "",
    });
    expect(r.meta.hasWatermark).toBe(false);
    const main = await readFile(join(MEDIA_ROOT, objectKey));
    expect(isWebp(main)).toBe(true);
  });

  it("小图（<MAX）不被放大", async () => {
    const bytes = await makeJpeg(300, 200);
    const objectKey = "media/202605/test3.jpg";
    const r = await processUpload({
      bytes,
      objectKey,
      mediaType: "image",
      mediaRoot: MEDIA_ROOT,
      watermarkText: "ChiYan",
    });
    expect(r.meta.width).toBe(300);
    expect(r.meta.height).toBe(200);
  });
});

describe("processUpload — 边界", () => {
  it("video → passthrough：主槽 + 原始都写，thumb=null，hasWatermark=false", async () => {
    const fake = new Uint8Array([0, 0, 0, 32, 102, 116, 121, 112, 105, 115, 111, 109]); // fake mp4 ftyp
    const objectKey = "media/202605/clip.mp4";
    const r = await processUpload({
      bytes: fake,
      objectKey,
      mediaType: "video",
      mediaRoot: MEDIA_ROOT,
      watermarkText: "ChiYan",
    });
    expect(r.meta.thumbObjectKey).toBeNull();
    expect(r.meta.hasWatermark).toBe(false);
    expect(r.meta.fileSize).toBe(fake.byteLength);
    const main = await readFile(join(MEDIA_ROOT, objectKey));
    expect(main.byteLength).toBe(fake.byteLength);
    await expect(stat(join(MEDIA_ROOT, "originals", objectKey))).resolves.toBeDefined();
  });

  it("损坏 bytes 不抛错 → 主槽写原始，thumb=null，hasWatermark=false", async () => {
    const garbage = new Uint8Array([0xff, 0xff, 0xff, 0xff]);
    const objectKey = "media/202605/bad.jpg";
    const r = await processUpload({
      bytes: garbage,
      objectKey,
      mediaType: "image",
      mediaRoot: MEDIA_ROOT,
      watermarkText: "ChiYan",
    });
    expect(r.meta.thumbObjectKey).toBeNull();
    expect(r.meta.hasWatermark).toBe(false);
    const main = await readFile(join(MEDIA_ROOT, objectKey));
    expect(main.byteLength).toBe(garbage.byteLength);
  });

  it("路径越狱（..）被拒", async () => {
    const bytes = await makeJpeg(100, 100);
    await expect(
      processUpload({
        bytes,
        objectKey: "../../escape.jpg",
        mediaType: "image",
        mediaRoot: MEDIA_ROOT,
        watermarkText: "",
      }),
    ).rejects.toThrow(/outside MEDIA_ROOT/);
  });
});
