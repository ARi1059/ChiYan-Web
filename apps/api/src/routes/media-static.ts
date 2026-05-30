/**
 * 静态媒体服务：GET /media/* → MEDIA_ROOT/<rest>
 *
 * mock / 单机部署阶段，Step 7 接 CDN 后这条路由会被 Cloudflare 边缘抢走。
 *
 * 安全：
 *  - 路径 resolve 后必须仍在 MEDIA_ROOT 之内（防 ../ traversal）
 *  - 仅 GET / HEAD；其它方法走默认 404
 *  - Content-Type 按扩展名简表，未识别 → application/octet-stream
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

  let info;
  try {
    info = await stat(target);
  } catch {
    return c.notFound();
  }
  if (!info.isFile()) return c.notFound();

  const buf = await readFile(target);
  const mime = MIME[extname(target).toLowerCase()] ?? "application/octet-stream";
  c.header("Content-Type", mime);
  c.header("Content-Length", String(info.size));
  c.header("Cache-Control", "public, max-age=2592000, immutable");
  return c.body(new Uint8Array(buf));
});

export default app;
