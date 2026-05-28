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
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { admin as adminTypes } from "@chiyan/types";
import { z } from "zod";
import type { AppContext } from "../../env";
import { fail, ok } from "../../lib/api";
import { writeAudit } from "../../lib/audit";
import { purgeByTags } from "../../lib/cf-cache";
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
import { _consumeSignedKey, signR2Put } from "../../lib/r2-sign";
import { csrf } from "../../middleware/csrf";
import { fullyOnboarded } from "../../middleware/fully-onboarded";
import { roleRequired } from "../../middleware/role-required";

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
    const r = await signR2Put({
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

// ─── POST /register ─────────────────────────────────────────
app.post(
  "/register",
  roleRequired("owner", "admin", "operator"),
  csrf,
  zValidator("json", adminTypes.AdminMediaRegisterRequest),
  async (c) => {
    const input = c.req.valid("json");
    if (!_consumeSignedKey(input.object_key)) {
      return fail(c, 40001, "object_key 未签或已过期", { sub_code: "unknown_key" });
    }
    const operator = c.get("admin")!;
    // mock URL pair：cdn / r2（Step 7 接真 R2 时换成签名 URL + bucket public/private split）
    const url = `https://cdn-mock.local/${input.object_key}?cdn=1`;
    const original_url = `https://r2-mock.local/${input.object_key}`;
    try {
      const created = await adminCreateMedia({
        model_id: input.model_id ?? null,
        type: input.type,
        url,
        original_url,
        thumb_url: null,
        width: input.width ?? null,
        height: input.height ?? null,
        file_size: input.file_size,
        hash: input.hash,
        has_watermark: false,
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
    const associatedModel = existing.model_id != null
      ? await adminFindModelById(existing.model_id)
      : null;
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
