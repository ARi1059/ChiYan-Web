/**
 * /admin/media/* — 媒体管理（接口方案 §4.5）。
 *
 * 角色：
 *   sign / register / GET    → Owner+Admin+Operator
 *   PATCH / DELETE / watermark → Owner+Admin
 *
 * 直传流程（mock 阶段不真接 R2）：
 *   1. POST /sign        → 返 mock upload_url + object_key（in-memory 记 15min 过期）
 *   2. 前端 PUT 文件到 upload_url（mock 阶段被忽略）
 *   3. POST /register    → 用 sign 返的 object_key 落 media_assets
 *
 * patch is_cover=true 时，repo 同步把 model.cover_asset_id 指向本条；is_cover=false
 * 时若 model.cover_asset_id 正指向本条则清零（一次调用同事务，Step 7 切真 DB 仍同事务）。
 */
import { join, normalize, resolve, sep } from "node:path";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { admin as adminTypes } from "@chiyan/types";
import { z } from "zod";
import type { AppContext } from "../../env";
import { fail, ok } from "../../lib/api";
import { writeAudit } from "../../lib/audit";
import { purgeByTags } from "../../lib/cf-cache";
import { processUpload } from "../../lib/media-processor";
import { getSettings } from "../../lib/studio-info-repo";
import {
  adminCreateMedia,
  adminDeleteMedia,
  adminFindMediaById,
  adminFindModelById,
  adminListMedia,
  adminUpdateMedia,
  ModelsRepoConflictError,
  type AdminMediaRecord,
} from "../../lib/models-repo";
import {
  _consumeSignedKey,
  _markKeyUploaded,
  signMediaUpload,
  verifyUploadSig,
} from "../../lib/media-sign";
import { csrf } from "../../middleware/csrf";
import { fullyOnboarded } from "../../middleware/fully-onboarded";
import { roleRequired } from "../../middleware/role-required";

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // 100MB（与 AdminMediaSignRequest size 上限对齐）

const app = new Hono<AppContext>();

app.use("*", fullyOnboarded);

const IdParam = z.object({ id: z.coerce.number().int().positive() });

function serialize(m: AdminMediaRecord) {
  return {
    id: m.id,
    model_id: m.model_id,
    type: m.type,
    url: m.url,
    original_url: m.original_url,
    thumb_url: m.thumb_url,
    width: m.width,
    height: m.height,
    file_size: m.file_size,
    hash: m.hash,
    has_watermark: m.has_watermark,
    uploaded_by: m.uploaded_by,
    uploaded_at: m.uploaded_at.toISOString(),
  };
}

// ─── POST /sign ─────────────────────────────────────────────
app.post(
  "/sign",
  roleRequired("owner", "admin", "operator"),
  csrf,
  zValidator("json", adminTypes.AdminMediaSignRequest),
  async (c) => {
    const input = c.req.valid("json");
    const r = await signMediaUpload(c.env, {
      type: input.type,
      filename: input.filename,
      content_type: input.content_type,
    });
    return ok(c, {
      upload_url: r.upload_url,
      object_key: r.object_key,
      expires_at: r.expires_at.toISOString(),
    });
  },
);

// ─── PUT /upload?key=...&sig=...&expires=... ──────────────────
//
// 二进制直传 endpoint。query 三元组：
//   key:     sign 返回的 object_key（必须出现在路径里，sig 也覆盖它）
//   sig:     HMAC-SHA256(JWT_SECRET, `${key}:${expires}`) base64url
//   expires: 绝对毫秒时间戳，PUT 必须在此之前
//
// 防御：authRequired(全组) + fullyOnboarded + roleRequired + csrf + HMAC sig 五层。
// 即便 sig 单独被嗅探，没有 access_token 仍打不进。
//
// 落盘：MEDIA_ROOT/<object_key>，路径强制 resolve 后必须仍在 MEDIA_ROOT 内（防 traversal）。
// 落盘成功后 _markKeyUploaded —— 接下来 register 才能消费。
const UploadQuery = z.object({
  key: z.string().min(1).max(256),
  sig: z.string().min(1).max(128),
  expires: z.coerce.number().int().positive(),
});

app.put(
  "/upload",
  roleRequired("owner", "admin", "operator"),
  csrf,
  zValidator("query", UploadQuery),
  async (c) => {
    const { key, sig, expires } = c.req.valid("query");

    // 1) HMAC + expires 校验
    const verdict = await verifyUploadSig(c.env.JWT_SECRET, key, sig, expires);
    if (!verdict.ok) {
      return fail(c, 40301, "上传授权无效", { sub_code: verdict.reason });
    }

    // 2) 路径安全：MEDIA_ROOT + key 解析后必须仍在 MEDIA_ROOT 之内
    const root = resolve(c.env.MEDIA_ROOT);
    const target = resolve(join(root, normalize(key)));
    if (target !== root && !target.startsWith(root + sep)) {
      return fail(c, 40001, "object_key 路径非法", { sub_code: "bad_key" });
    }

    // 3) 读 body；超 100MB 直接拒（与 sign schema 上限对齐）
    const buf = await c.req.arrayBuffer();
    if (buf.byteLength === 0) return fail(c, 40001, "空文件");
    if (buf.byteLength > MAX_UPLOAD_BYTES) {
      return fail(c, 40001, "文件超过 100MB 上限", { sub_code: "too_large" });
    }

    // 4) 走处理管线 —— sharp 三档落盘 + 水印 + WebP；非图片走 passthrough
    //    通过 type 推断：sign 时拿到的 type 不在 PUT 里传，object_key 扩展也未必准。
    //    用 Content-Type header 兜底（前端 axios 默认会带）；判图片靠 image/* 前缀。
    const contentType = c.req.header("Content-Type") ?? "";
    const mediaType: "image" | "video" = contentType.startsWith("video/") ? "video" : "image";
    const settings = await getSettings();
    const result = await processUpload({
      bytes: new Uint8Array(buf),
      objectKey: key,
      mediaType,
      mediaRoot: c.env.MEDIA_ROOT,
      watermarkText: settings.name,
    });

    // 5) 标记可 register，携带处理结果
    _markKeyUploaded(key, result.meta);

    return ok(c, {
      object_key: key,
      bytes: buf.byteLength,
      width: result.meta.width,
      height: result.meta.height,
      has_watermark: result.meta.hasWatermark,
      thumb_object_key: result.meta.thumbObjectKey,
    });
  },
);

// ─── POST /register ─────────────────────────────────────────
app.post(
  "/register",
  roleRequired("owner", "admin", "operator"),
  csrf,
  zValidator("json", adminTypes.AdminMediaRegisterRequest),
  async (c) => {
    const input = c.req.valid("json");
    const meta = _consumeSignedKey(input.object_key);
    if (!meta) {
      return fail(c, 40001, "object_key 未签或已过期", { sub_code: "unknown_key" });
    }
    const operator = c.get("admin")!;
    // VPS 自部署：url / original_url / thumb_url 都指向本机 /media/...（同源静态服务）。
    // - url:          MEDIA_ROOT/<object_key>          —— 处理后主图（已水印 / WebP）
    // - original_url: MEDIA_ROOT/originals/<object_key> —— 原始 bytes，留作审查
    // - thumb_url:    MEDIA_ROOT/thumbs/<thumb_key>    —— 缩略（无水印）
    // 没走 PUT 处理管线（meta 为 EMPTY）时退化：url=original_url，thumb=null
    const base = c.env.API_PUBLIC_URL.replace(/\/+$/, "");
    const url = `${base}/media/${input.object_key}`;
    const original_url = meta.thumbObjectKey ? `${base}/media/originals/${input.object_key}` : url;
    const thumb_url = meta.thumbObjectKey ? `${base}/media/${meta.thumbObjectKey}` : null;
    try {
      const created = await adminCreateMedia({
        model_id: input.model_id ?? null,
        type: input.type,
        url,
        original_url,
        thumb_url,
        // 服务器侧元信息优先（防前端伪造）；只有没跑管线时才退回 input
        width: meta.width ?? input.width ?? null,
        height: meta.height ?? input.height ?? null,
        file_size: meta.fileSize ?? input.file_size,
        hash: input.hash,
        has_watermark: meta.hasWatermark,
        uploaded_by: operator.admin_id,
      });
      await writeAudit({
        admin_id: operator.admin_id,
        action: "admin.media.registered",
        target_type: "media",
        target_id: String(created.id),
        payload: { object_key: input.object_key, model_id: created.model_id },
        ip: c.req.header("CF-Connecting-IP") ?? null,
        ua: c.req.header("User-Agent") ?? null,
      });
      if (created.model_id != null) {
        const m = await adminFindModelById(created.model_id);
        if (m) await purgeByTags(c.env, [`model:${m.code}`]);
      }
      return ok(c, serialize(created));
    } catch (e) {
      if (e instanceof ModelsRepoConflictError) {
        return fail(c, 40901, "文件已存在（hash 重复）", { sub_code: "hash_conflict" });
      }
      throw e;
    }
  },
);

// ─── GET / list ─────────────────────────────────────────────
app.get(
  "/",
  roleRequired("owner", "admin", "operator"),
  zValidator("query", adminTypes.AdminMediaQuery),
  async (c) => {
    const opts = c.req.valid("query");
    const { items, total } = await adminListMedia(opts);
    return ok(c, {
      items: items.map(serialize),
      total,
      page: opts.page,
      page_size: opts.page_size,
    });
  },
);

// ─── PATCH /:id ─────────────────────────────────────────────
app.patch(
  "/:id",
  roleRequired("owner", "admin"),
  csrf,
  zValidator("param", IdParam),
  zValidator("json", adminTypes.AdminMediaPatchRequest),
  async (c) => {
    const { id } = c.req.valid("param");
    const patch = c.req.valid("json");
    const updated = await adminUpdateMedia(id, {
      is_cover: patch.is_cover,
    });
    if (!updated) return fail(c, 40401, "媒体不存在");
    const operator = c.get("admin")!;
    await writeAudit({
      admin_id: operator.admin_id,
      action: "admin.media.updated",
      target_type: "media",
      target_id: String(updated.id),
      payload: { fields: Object.keys(patch) },
      ip: c.req.header("CF-Connecting-IP") ?? null,
      ua: c.req.header("User-Agent") ?? null,
    });
    if (updated.model_id != null) {
      const m = await adminFindModelById(updated.model_id);
      if (m) await purgeByTags(c.env, [`model:${m.code}`]);
    }
    return ok(c, serialize(updated));
  },
);

// ─── DELETE /:id ────────────────────────────────────────────
app.delete(
  "/:id",
  roleRequired("owner", "admin"),
  csrf,
  zValidator("param", IdParam),
  async (c) => {
    const { id } = c.req.valid("param");
    const existing = await adminFindMediaById(id);
    if (!existing) return fail(c, 40401, "媒体不存在");
    const associatedModel =
      existing.model_id != null ? await adminFindModelById(existing.model_id) : null;
    const deleted = await adminDeleteMedia(id);
    if (!deleted) return fail(c, 40401, "媒体不存在");
    const operator = c.get("admin")!;
    await writeAudit({
      admin_id: operator.admin_id,
      action: "admin.media.deleted",
      target_type: "media",
      target_id: String(id),
      payload: { hash: existing.hash },
      ip: c.req.header("CF-Connecting-IP") ?? null,
      ua: c.req.header("User-Agent") ?? null,
    });
    if (associatedModel) {
      await purgeByTags(c.env, [`model:${associatedModel.code}`]);
    }
    return ok(c, { deleted: true });
  },
);

// ─── POST /:id/watermark ────────────────────────────────────
// mock 阶段直接置 has_watermark=true；Step 7 切真 R2 + CF Images 时由 worker 异步生成。
app.post(
  "/:id/watermark",
  roleRequired("owner", "admin"),
  csrf,
  zValidator("param", IdParam),
  async (c) => {
    const { id } = c.req.valid("param");
    const updated = await adminUpdateMedia(id, { has_watermark: true });
    if (!updated) return fail(c, 40401, "媒体不存在");
    const operator = c.get("admin")!;
    await writeAudit({
      admin_id: operator.admin_id,
      action: "admin.media.watermarked",
      target_type: "media",
      target_id: String(id),
      payload: null,
      ip: c.req.header("CF-Connecting-IP") ?? null,
      ua: c.req.header("User-Agent") ?? null,
    });
    if (updated.model_id != null) {
      const m = await adminFindModelById(updated.model_id);
      if (m) await purgeByTags(c.env, [`model:${m.code}`]);
    }
    return ok(c, serialize(updated));
  },
);

export default app;
