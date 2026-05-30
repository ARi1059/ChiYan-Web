/**
 * 媒体处理管线：sharp 落盘到 3 个槽。
 *
 * 槽位（相对 MEDIA_ROOT）：
 *   - originals/<object_key>     —— 原始 bytes，未处理。审查 / 重处理留作底片
 *   - <object_key>               —— 主图（resize 上限 1600px 长边 + 水印 + WebP q85）
 *   - thumbs/<thumb_object_key>  —— 缩略（resize 上限 480px 长边 + 无水印 + WebP q80）
 *
 * 主图 / 缩略统一用 WebP：浏览器支持率 >95%（safari 14+），体积比 jpeg 小 30%。
 * url 仍指向原 object_key 路径（不改扩展名），media-static 直接读 .webp 数据返回 ——
 * 浏览器看 Content-Type=image/webp 自己渲染，不依赖路径扩展。
 *
 * 水印：bottom-right 文本，studio_settings.name；sharp composite SVG。
 * 非图片（video 等）→ 跳过处理，把原始 bytes 直接写到主槽 + 原始槽（thumb=null）。
 *
 * 失败：sharp decode 抛错时回退到"只写原始 bytes 到主槽" —— 保证 register 不被卡住，
 * register 看 hasWatermark=false / thumb=null 自己决定是否走 PATCH /:id/watermark 重试。
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import sharp from "sharp";
import type { UploadedMeta } from "./media-sign";

const MAX_MAIN_DIMENSION = 1600;
const MAX_THUMB_DIMENSION = 480;
const MAIN_QUALITY = 85;
const THUMB_QUALITY = 80;

export interface ProcessResult {
  meta: UploadedMeta;
}

export interface ProcessOptions {
  bytes: Uint8Array;
  objectKey: string;
  /** "image" / "video"；video 跳过 sharp 处理。 */
  mediaType: "image" | "video";
  mediaRoot: string;
  /** 水印文字；通常是 studio_settings.name。空字符串 = 不加水印。 */
  watermarkText: string;
}

/** 把 thumb 文件名后缀改成 .webp（thumbs/.../abc.jpg → thumbs/.../abc.webp）。 */
function thumbKeyOf(objectKey: string): string {
  const lastDot = objectKey.lastIndexOf(".");
  const stem = lastDot < 0 ? objectKey : objectKey.slice(0, lastDot);
  return `thumbs/${stem}.webp`;
}

function originalKeyOf(objectKey: string): string {
  return `originals/${objectKey}`;
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) =>
    c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === "&" ? "&amp;" : c === "'" ? "&apos;" : "&quot;",
  );
}

function watermarkSvg(text: string, mainWidth: number, mainHeight: number): Buffer {
  const safe = escapeXml(text);
  // 字号按主图短边的 3.2% 算，保证缩到 800 宽也读得清
  const fontSize = Math.max(14, Math.round(Math.min(mainWidth, mainHeight) * 0.032));
  const padding = Math.round(fontSize * 0.8);
  const shadowOffset = Math.max(1, Math.round(fontSize * 0.05));
  // 右下角对齐；text-anchor=end 让 x 是右边缘
  const x = mainWidth - padding;
  const y = mainHeight - padding;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${mainWidth}" height="${mainHeight}">
  <text x="${x + shadowOffset}" y="${y + shadowOffset}" font-family="'Noto Serif SC', 'PingFang SC', serif" font-size="${fontSize}" fill="black" fill-opacity="0.5" text-anchor="end">${safe}</text>
  <text x="${x}" y="${y}" font-family="'Noto Serif SC', 'PingFang SC', serif" font-size="${fontSize}" fill="white" fill-opacity="0.78" text-anchor="end">${safe}</text>
</svg>`);
}

/** 写一个 buffer 到 MEDIA_ROOT 下，自动建目录，且 resolve 后必须仍在 MEDIA_ROOT 内（防 traversal）。 */
async function writeUnderRoot(mediaRoot: string, relKey: string, data: Uint8Array): Promise<void> {
  const root = resolve(mediaRoot);
  const target = resolve(join(root, relKey));
  if (target !== root && !target.startsWith(root + "/")) {
    throw new Error(`[media-processor] target outside MEDIA_ROOT: ${target}`);
  }
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, data);
}

/**
 * 主入口：跑完整管线。无论成败，最终保证至少主槽有数据 —— 调用方依赖这一点。
 */
export async function processUpload(opts: ProcessOptions): Promise<ProcessResult> {
  const { bytes, objectKey, mediaType, mediaRoot, watermarkText } = opts;

  // 写原始（每种类型都写）
  await writeUnderRoot(mediaRoot, originalKeyOf(objectKey), bytes);

  // 视频：sharp 不处理；主槽 = 原始 bytes，无缩略，无水印
  if (mediaType === "video") {
    await writeUnderRoot(mediaRoot, objectKey, bytes);
    return {
      meta: {
        width: null,
        height: null,
        thumbObjectKey: null,
        hasWatermark: false,
        fileSize: bytes.byteLength,
      },
    };
  }

  // 图片：sharp 走一遍 decode 拿元信息
  try {
    const src = sharp(bytes, { failOn: "none" });
    const { width: srcW, height: srcH } = await src.metadata();
    if (!srcW || !srcH) throw new Error("missing metadata");

    // ── 主图：resize + 水印 + WebP ─────────────────────────────
    const targetW = srcW > srcH ? Math.min(srcW, MAX_MAIN_DIMENSION) : Math.round((srcW * Math.min(srcH, MAX_MAIN_DIMENSION)) / srcH);
    const targetH = srcH > srcW ? Math.min(srcH, MAX_MAIN_DIMENSION) : Math.round((srcH * Math.min(srcW, MAX_MAIN_DIMENSION)) / srcW);

    let mainPipeline = sharp(bytes, { failOn: "none" }).resize(targetW, targetH, {
      fit: "inside",
      withoutEnlargement: true,
    });

    const composites: sharp.OverlayOptions[] = [];
    let hasWatermark = false;
    if (watermarkText.trim().length > 0) {
      // 先 resize 才能拿到真实输出尺寸做水印 svg
      const resized = await mainPipeline.clone().toBuffer({ resolveWithObject: true });
      const wmSvg = watermarkSvg(watermarkText, resized.info.width, resized.info.height);
      composites.push({ input: wmSvg, top: 0, left: 0, blend: "over" });
      mainPipeline = sharp(resized.data).composite(composites);
      hasWatermark = true;
    }

    const mainOut = await mainPipeline.webp({ quality: MAIN_QUALITY }).toBuffer({
      resolveWithObject: true,
    });
    await writeUnderRoot(mediaRoot, objectKey, mainOut.data);

    // ── 缩略：resize + WebP（无水印） ───────────────────────────
    const thumbOut = await sharp(bytes, { failOn: "none" })
      .resize({
        width: MAX_THUMB_DIMENSION,
        height: MAX_THUMB_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: THUMB_QUALITY })
      .toBuffer({ resolveWithObject: true });
    const thumbKey = thumbKeyOf(objectKey);
    await writeUnderRoot(mediaRoot, thumbKey, thumbOut.data);

    return {
      meta: {
        width: mainOut.info.width,
        height: mainOut.info.height,
        thumbObjectKey: thumbKey,
        hasWatermark,
        fileSize: mainOut.data.byteLength,
      },
    };
  } catch {
    // decode 失败：原始 bytes 也算主槽数据，让 register 不被卡住
    await writeUnderRoot(mediaRoot, objectKey, bytes);
    return {
      meta: {
        width: null,
        height: null,
        thumbObjectKey: null,
        hasWatermark: false,
        fileSize: bytes.byteLength,
      },
    };
  }
}
