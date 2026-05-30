/**
 * 静态媒体服务：GET /media/* → MEDIA_ROOT/<rest>
 *
 * mock / 单机部署阶段，Step 7 接 CDN 后这条路由会被 Cloudflare 边缘抢走。
 *
 * 安全：
 *  - 路径 resolve 后必须仍在 MEDIA_ROOT 之内（防 ../ traversal）
 *  - 仅 GET / HEAD；其它方法走默认 404
 *  - Content-Type 先嗅 magic bytes（webp/png/jpeg/gif/mp4），失败回退按扩展名简表，
 *    都未识别 → application/octet-stream。
 *    背景：媒体管线把图全转 WebP 后写回原 .jpg 路径，前端浏览器看 Content-Type 渲染，
 *    不能信扩展名。
 *
 * 性能：mock 阶段 readFile 全读到内存即可（H5 上传图 < 几 MB）。Step 7 切流式或 CDN。
 *
 * 缓存：public, max-age=2592000（30d），immutable
 *  - object_key 内含 nanoid(10) 防碰撞，覆盖写概率极低
 *  - admin 改 cover 走 model 表，不改 object_key 内容
 */
import { stat, readFile } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { Hono } from "hono";
import type { AppContext } from "../env";

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
};

/** 嗅前 12 字节判常见图/视频 magic；未识别返 null。 */
function sniffMime(buf: Buffer | Uint8Array): string | null {
  if (buf.length >= 12) {
    // RIFF????WEBP
    if (
      buf[0] === 0x52 &&
      buf[1] === 0x49 &&
      buf[2] === 0x46 &&
      buf[3] === 0x46 &&
      buf[8] === 0x57 &&
      buf[9] === 0x45 &&
      buf[10] === 0x42 &&
      buf[11] === 0x50
    )
      return "image/webp";
    // ftyp (mp4 / mov)
    if (buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70)
      return "video/mp4";
  }
  if (buf.length >= 8) {
    // \x89PNG\r\n\x1a\n
    if (
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47 &&
      buf[4] === 0x0d &&
      buf[5] === 0x0a &&
      buf[6] === 0x1a &&
      buf[7] === 0x0a
    )
      return "image/png";
  }
  if (buf.length >= 6) {
    // GIF87a / GIF89a
    if (
      buf[0] === 0x47 &&
      buf[1] === 0x49 &&
      buf[2] === 0x46 &&
      buf[3] === 0x38 &&
      (buf[4] === 0x37 || buf[4] === 0x39) &&
      buf[5] === 0x61
    )
      return "image/gif";
  }
  if (buf.length >= 3) {
    // JPEG SOI: FF D8 FF
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  }
  return null;
}

const app = new Hono<AppContext>();

app.get("/*", async (c) => {
  // c.req.path 形如 "/media/202611/abc.jpg"；剥掉前缀 "/media/" 拿 rest
  const path = c.req.path.replace(/^\/media\//, "");
  if (!path || path.includes("\0")) return c.notFound();

  const root = resolve(c.env.MEDIA_ROOT);
  const target = resolve(join(root, normalize(path)));
  if (target !== root && !target.startsWith(root + sep)) {
    return c.notFound();
  }

  // 原图（底片）永不经公开静态层外发：公开图片只走 cover/gallery/thumbs；originals/ 仅后台
  // 审查留底，admin 端也不渲染原图。在 normalize+resolve 后判断，杜绝 /media/x/../originals/
  // 绕过。物理上 originals 目录 0700 chiyan:chiyan，caddy 进程读不到——此处是 API 域反代
  // 路径（reverse_proxy → :3000）的同等拦截，二者合一才完整封住原图。
  const originalsDir = resolve(join(root, "originals"));
  if (target === originalsDir || target.startsWith(originalsDir + sep)) {
    return c.notFound();
  }

  let info;
  try {
    info = await stat(target);
  } catch {
    return c.notFound();
  }
  if (!info.isFile()) return c.notFound();

  const buf = await readFile(target);
  // magic 优先；嗅不出再退扩展名表（媒体管线把图全转 WebP 写回 .jpg 路径，扩展名不可信）
  const mime = sniffMime(buf) ?? MIME[extname(target).toLowerCase()] ?? "application/octet-stream";
  c.header("Content-Type", mime);
  c.header("Content-Length", String(info.size));
  c.header("Cache-Control", "public, max-age=2592000, immutable");
  return c.body(new Uint8Array(buf));
});

export default app;
