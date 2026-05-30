/**
 * /admin/models/* — 模特管理（接口方案 §4.3）。
 *
 * 角色矩阵：
 *  - 读（GET /, GET /:id）   → owner + admin + operator
 *  - 写（POST/PATCH/DELETE/restore/batch-import） → owner + admin
 *
 * 写入路径：encrypt(real_name) → adminCreateModel/Update → writeAudit → purgeByTags
 * 读路径：decrypt(real_name_enc) → AdminModelDetail；Operator 角色 strip real_name。
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { admin as adminTypes } from "@chiyan/types";
import { z } from "zod";
import type { AppContext } from "../../env";
import { fail, ok } from "../../lib/api";
import { findById } from "../../lib/admin-repo";
import { writeAudit } from "../../lib/audit";
import { purgeByTags } from "../../lib/cf-cache";
import { decrypt, encrypt } from "../../lib/crypto";
import { currentEncVersion, keyRingFromEnv } from "../../lib/keyring";
import {
  adminArchiveModel,
  adminCreateModel,
  adminFindModelById,
  adminListModels,
  adminRestoreModel,
  adminUpdateModel,
  ModelsRepoConflictError,
  type AdminCreateModelInput,
  type AdminModelRecord,
} from "../../lib/models-repo";
import { csrf } from "../../middleware/csrf";
import { fullyOnboarded } from "../../middleware/fully-onboarded";
import { roleRequired } from "../../middleware/role-required";

const app = new Hono<AppContext>();

app.use("*", fullyOnboarded);

const IdParam = z.object({ id: z.coerce.number().int().positive() });

async function serializeDetail(
  c: { env: AppContext["Bindings"] },
  r: AdminModelRecord,
  includeRealName: boolean,
): Promise<Record<string, unknown>> {
  let real_name: string | undefined;
  if (includeRealName && r.real_name_enc) {
    try {
      real_name = await decrypt(r.real_name_enc, keyRingFromEnv(c.env));
    } catch {
      // 解密失败（key 错位 / 数据损坏）→ omit；不暴露错误细节
      real_name = undefined;
    }
  }
  const out: Record<string, unknown> = {
    id: r.id,
    code: r.code,
    nickname: r.nickname,
    style_tags: r.style_tags,
    available_types: r.available_types,
    can_remote: r.can_remote,
    is_minor: r.is_minor,
    gallery_asset_ids: r.gallery_asset_ids,
    portfolio: r.portfolio,
    cooperation_history: r.cooperation_history,
    status: r.status,
    created_at: r.created_at.toISOString(),
    updated_at: r.updated_at.toISOString(),
  };
  if (real_name !== undefined) out.real_name = real_name;
  if (r.height_cm != null) out.height_cm = r.height_cm;
  if (r.weight_kg != null) out.weight_kg = r.weight_kg;
  if (r.bust != null) out.bust = r.bust;
  if (r.waist != null) out.waist = r.waist;
  if (r.hip != null) out.hip = r.hip;
  if (r.shoe_size_eu != null) out.shoe_size_eu = r.shoe_size_eu;
  if (r.age_range) out.age_range = r.age_range;
  if (r.age != null) out.age = r.age;
  if (r.hometown) out.hometown = r.hometown;
  if (r.city) out.city = r.city;
  if (r.district) out.district = r.district;
  if (r.qq) out.qq = r.qq;
  if (r.cover_asset_id != null) out.cover_asset_id = r.cover_asset_id;
  return out;
}

async function operatorIsAdmin(c: {
  get: (k: "admin") => { admin_id: number } | undefined;
}): Promise<{ admin_id: number; role: "owner" | "admin" | "operator" } | null> {
  const a = c.get("admin");
  if (!a) return null;
  const rec = await findById(a.admin_id);
  if (!rec) return null;
  return { admin_id: rec.id, role: rec.role };
}

// ─── GET / 列表 ──────────────────────────────────────────────
app.get(
  "/",
  roleRequired("owner", "admin", "operator"),
  zValidator("query", adminTypes.AdminModelsQuery),
  async (c) => {
    const opts = c.req.valid("query");
    const { items, total } = await adminListModels(opts);
    const me = await operatorIsAdmin(c);
    const includeRealName = me?.role === "owner" || me?.role === "admin";
    const serialized = await Promise.all(items.map((m) => serializeDetail(c, m, includeRealName)));
    return ok(c, {
      items: serialized,
      total,
      page: opts.page,
      page_size: opts.page_size,
    });
  },
);

// ─── GET /:id 详情 ──────────────────────────────────────────────
app.get(
  "/:id",
  roleRequired("owner", "admin", "operator"),
  zValidator("param", IdParam),
  async (c) => {
    const { id } = c.req.valid("param");
    const r = await adminFindModelById(id);
    if (!r) return fail(c, 40401, "模特不存在");
    const me = await operatorIsAdmin(c);
    const includeRealName = me?.role === "owner" || me?.role === "admin";
    return ok(c, await serializeDetail(c, r, includeRealName));
  },
);

// ─── POST / 创建 ──────────────────────────────────────────────
app.post(
  "/",
  roleRequired("owner", "admin"),
  csrf,
  zValidator("json", adminTypes.AdminCreateModelRequest),
  async (c) => {
    const body = c.req.valid("json");
    const { real_name, ...rest } = body;
    let real_name_enc: Uint8Array | null = null;
    if (real_name) {
      real_name_enc = await encrypt(
        real_name,
        currentEncVersion(c.env),
        keyRingFromEnv(c.env)[currentEncVersion(c.env)]!,
      );
    }
    try {
      const created = await adminCreateModel({
        ...(rest as AdminCreateModelInput),
        real_name_enc,
      });
      const operator = c.get("admin")!;
      await writeAudit({
        admin_id: operator.admin_id,
        action: "admin.model.created",
        target_type: "model",
        target_id: String(created.id),
        // 用 model_code 而不是 code —— sanitize.ts 的 deny-list 里 "code" 是 TOTP code 的兜底，
        // 用 model_code 避免被 mask 成 "***"。
        payload: { model_code: created.code, nickname: created.nickname },
        ip: c.req.header("CF-Connecting-IP") ?? null,
        ua: c.req.header("User-Agent") ?? null,
      });
      await purgeByTags(c.env, ["models-list"]);
      return ok(c, await serializeDetail(c, created, true));
    } catch (e) {
      if (e instanceof ModelsRepoConflictError) {
        return fail(c, 40901, "模特编号已存在", { sub_code: "code_conflict" });
      }
      throw e;
    }
  },
);

// ─── PATCH /:id 局部更新 ────────────────────────────────────────
app.patch(
  "/:id",
  roleRequired("owner", "admin"),
  csrf,
  zValidator("param", IdParam),
  zValidator("json", adminTypes.AdminUpdateModelRequest),
  async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const { real_name, ...rest } = body;
    const patch: Parameters<typeof adminUpdateModel>[1] = { ...rest };
    if (real_name !== undefined) {
      patch.real_name_enc = real_name
        ? await encrypt(
            real_name,
            currentEncVersion(c.env),
            keyRingFromEnv(c.env)[currentEncVersion(c.env)]!,
          )
        : null;
    }
    const updated = await adminUpdateModel(id, patch);
    if (!updated) return fail(c, 40401, "模特不存在");
    const operator = c.get("admin")!;
    await writeAudit({
      admin_id: operator.admin_id,
      action: "admin.model.updated",
      target_type: "model",
      target_id: String(updated.id),
      payload: { model_code: updated.code, fields: Object.keys(rest) },
      ip: c.req.header("CF-Connecting-IP") ?? null,
      ua: c.req.header("User-Agent") ?? null,
    });
    await purgeByTags(c.env, [`model:${updated.code}`, "models-list"]);
    return ok(c, await serializeDetail(c, updated, true));
  },
);

// ─── DELETE /:id 归档（软删） ──────────────────────────────────
app.delete(
  "/:id",
  roleRequired("owner", "admin"),
  csrf,
  zValidator("param", IdParam),
  async (c) => {
    const { id } = c.req.valid("param");
    const archived = await adminArchiveModel(id);
    if (!archived) return fail(c, 40401, "模特不存在");
    const operator = c.get("admin")!;
    await writeAudit({
      admin_id: operator.admin_id,
      action: "admin.model.archived",
      target_type: "model",
      target_id: String(archived.id),
      payload: { model_code: archived.code },
      ip: c.req.header("CF-Connecting-IP") ?? null,
      ua: c.req.header("User-Agent") ?? null,
    });
    await purgeByTags(c.env, [`model:${archived.code}`, "models-list"]);
    return ok(c, { archived: true });
  },
);

// ─── POST /:id/restore ─────────────────────────────────────────
app.post(
  "/:id/restore",
  roleRequired("owner", "admin"),
  csrf,
  zValidator("param", IdParam),
  async (c) => {
    const { id } = c.req.valid("param");
    const restored = await adminRestoreModel(id);
    if (!restored) return fail(c, 40401, "模特不存在");
    const operator = c.get("admin")!;
    await writeAudit({
      admin_id: operator.admin_id,
      action: "admin.model.restored",
      target_type: "model",
      target_id: String(restored.id),
      payload: { model_code: restored.code },
      ip: c.req.header("CF-Connecting-IP") ?? null,
      ua: c.req.header("User-Agent") ?? null,
    });
    await purgeByTags(c.env, [`model:${restored.code}`, "models-list"]);
    return ok(c, { restored: true });
  },
);

// ─── POST /batch-import ─────────────────────────────────────────
app.post(
  "/batch-import",
  roleRequired("owner", "admin"),
  csrf,
  zValidator("json", adminTypes.AdminBatchImportRequest),
  async (c) => {
    const { rows } = c.req.valid("json");
    const errors: { row_index: number; code: number; message: string }[] = [];
    let okCount = 0;
    const v = currentEncVersion(c.env);
    const ring = keyRingFromEnv(c.env);
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      try {
        const { real_name, ...rest } = row;
        const real_name_enc = real_name ? await encrypt(real_name, v, ring[v]!) : null;
        await adminCreateModel({
          ...(rest as AdminCreateModelInput),
          real_name_enc,
        });
        okCount += 1;
      } catch (e) {
        if (e instanceof ModelsRepoConflictError) {
          errors.push({ row_index: i, code: 40901, message: `code conflict: ${row.code}` });
        } else {
          errors.push({ row_index: i, code: 50001, message: String(e) });
        }
      }
    }
    const operator = c.get("admin")!;
    await writeAudit({
      admin_id: operator.admin_id,
      action: "admin.model.batch_imported",
      target_type: "model",
      target_id: null,
      payload: { ok_count: okCount, error_count: errors.length },
      ip: c.req.header("CF-Connecting-IP") ?? null,
      ua: c.req.header("User-Agent") ?? null,
    });
    if (okCount > 0) await purgeByTags(c.env, ["models-list"]);
    return ok(c, { ok_count: okCount, error_count: errors.length, errors });
  },
);

export default app;
