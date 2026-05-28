/**
 * /admin/accounts/* — Owner-only（接口方案 §4.7）。
 *
 * Endpoint：
 *  - GET    /              list（page/page_size，clone 时 strip password_hash / totp_secret_enc）
 *  - POST   /              新建账号 + 一次性密码（明文响应仅一次；audit payload 不带）
 *  - PATCH  /:id           profile patch（display_name / role / status）；防 self-降级/禁用
 *  - DELETE /:id           disable（设 status='disabled'）；防 self-disable
 *  - POST   /:id/unlock    Phase 1 已落地
 *  - POST   /:id/reset-password   生成新一次性密码 + must_change_password=true（不能重置自己）
 *  - POST   /:id/reset-2fa  totp_enrolled=false + totp_secret_enc=null
 *
 * 安全：
 *  - one_time_password 明文只出现在 HTTP 响应一次；audit payload 永远不带（sanitize 兜底）
 *  - 不允许 owner 把"自己"降级 / 禁用 / 重置密码 —— 40001 self_lock / self_reset
 *  - last-owner 约束（不能让所有 owner 都失效）本任务不做，Step 7 接真 DB 时加 DB 约束 + UI ban
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { admin as adminTypes } from "@chiyan/types";
import { z } from "zod";
import type { AppContext } from "../../env";
import { fail, ok } from "../../lib/api";
import { writeAudit } from "../../lib/audit";
import {
  AdminRepoConflictError,
  clearTotp,
  createAdmin,
  disableAdmin,
  findById,
  listAccounts,
  recordPasswordHistory,
  setMustChangePassword,
  unlockAccount,
  updateAdminProfile,
  type AdminRecord,
} from "../../lib/admin-repo";
import { generateOneTimePassword, hashPassword } from "../../lib/password";
import { csrf } from "../../middleware/csrf";
import { fullyOnboarded } from "../../middleware/fully-onboarded";
import { roleRequired } from "../../middleware/role-required";

const app = new Hono<AppContext>();

// authRequired + rateLimit 已在父路由 /api/v1/admin 挂载；账号端口统一 owner-only + csrf。
app.use("*", fullyOnboarded, csrf, roleRequired("owner"));

const IdParam = z.object({ id: z.coerce.number().int().positive() });

function summarize(a: AdminRecord) {
  return {
    id: a.id,
    username: a.username,
    display_name: a.display_name,
    role: a.role,
    status: a.status,
    totp_enrolled: a.totp_enrolled,
    must_change_password: a.must_change_password,
    last_login_at: a.last_login_at ? a.last_login_at.toISOString() : null,
    locked_until: a.locked_until ? a.locked_until.toISOString() : null,
    created_at: a.created_at.toISOString(),
  };
}

// ─── GET / 列表 ─────────────────────────────────────────────
app.get(
  "/",
  zValidator("query", adminTypes.AdminAccountsListQuery),
  async (c) => {
    const { page, page_size } = c.req.valid("query");
    const { items, total } = await listAccounts({ page, page_size });
    return ok(c, {
      items: items.map(summarize),
      total,
      page,
      page_size,
    });
  },
);

// ─── POST / 新建 ────────────────────────────────────────────
app.post(
  "/",
  zValidator("json", adminTypes.AdminCreateAccountRequest),
  async (c) => {
    const input = c.req.valid("json");
    const oneTime = generateOneTimePassword();
    const password_hash = await hashPassword(oneTime);
    let created: AdminRecord;
    try {
      created = await createAdmin({
        username: input.username,
        display_name: input.display_name,
        role: input.role,
        password_hash,
      });
    } catch (e) {
      if (e instanceof AdminRepoConflictError) {
        return fail(c, 40901, "用户名已存在", { sub_code: "username_conflict" });
      }
      throw e;
    }
    await recordPasswordHistory(created.id, password_hash);
    const operator = c.get("admin")!;
    await writeAudit({
      admin_id: operator.admin_id,
      action: "admin.account.created",
      target_type: "admin",
      target_id: String(created.id),
      // 只放非敏感元数据；one_time_password 不能落 audit
      payload: { username: created.username, role: created.role },
      ip: c.req.header("CF-Connecting-IP") ?? null,
      ua: c.req.header("User-Agent") ?? null,
    });
    return ok(c, {
      account: summarize(created),
      one_time_password: oneTime,
    });
  },
);

// ─── PATCH /:id 修改 profile ────────────────────────────────
app.patch(
  "/:id",
  zValidator("param", IdParam),
  zValidator("json", adminTypes.AdminUpdateAccountRequest),
  async (c) => {
    const { id } = c.req.valid("param");
    const patch = c.req.valid("json");
    const operator = c.get("admin")!;
    if (id === operator.admin_id) {
      // 防 owner 把"自己"降级或禁用 —— UI 上 ban，handler 兜底
      if (patch.role !== undefined || patch.status === "disabled") {
        return fail(c, 40001, "不能修改自己的角色或禁用自己", {
          sub_code: "self_lock",
        });
      }
    }
    const updated = await updateAdminProfile(id, patch);
    if (!updated) return fail(c, 40401, "账号不存在");
    await writeAudit({
      admin_id: operator.admin_id,
      action: "admin.account.updated",
      target_type: "admin",
      target_id: String(id),
      payload: { fields: Object.keys(patch) },
      ip: c.req.header("CF-Connecting-IP") ?? null,
      ua: c.req.header("User-Agent") ?? null,
    });
    return ok(c, summarize(updated));
  },
);

// ─── DELETE /:id disable ────────────────────────────────────
app.delete("/:id", zValidator("param", IdParam), async (c) => {
  const { id } = c.req.valid("param");
  const operator = c.get("admin")!;
  if (id === operator.admin_id) {
    return fail(c, 40001, "不能禁用自己", { sub_code: "self_lock" });
  }
  const updated = await disableAdmin(id);
  if (!updated) return fail(c, 40401, "账号不存在");
  await writeAudit({
    admin_id: operator.admin_id,
    action: "admin.account.disabled",
    target_type: "admin",
    target_id: String(id),
    payload: null,
    ip: c.req.header("CF-Connecting-IP") ?? null,
    ua: c.req.header("User-Agent") ?? null,
  });
  return ok(c, { disabled: true });
});

// ─── POST /:id/unlock ────────────────────────────────────────
app.post("/:id/unlock", zValidator("param", IdParam), async (c) => {
  const { id } = c.req.valid("param");
  const target = await findById(id);
  if (!target) return fail(c, 40401, "账号不存在");
  await unlockAccount(id);
  const operator = c.get("admin")!;
  await writeAudit({
    admin_id: operator.admin_id,
    action: "admin.account.unlocked",
    target_type: "admin",
    target_id: String(id),
    payload: null,
    ip: c.req.header("CF-Connecting-IP") ?? null,
    ua: c.req.header("User-Agent") ?? null,
  });
  return ok(c, { unlocked: true });
});

// ─── POST /:id/reset-password ───────────────────────────────
app.post("/:id/reset-password", zValidator("param", IdParam), async (c) => {
  const { id } = c.req.valid("param");
  const operator = c.get("admin")!;
  if (id === operator.admin_id) {
    // 自己改密走 /auth/change-password；此端点用于 owner 给别人重置
    return fail(c, 40001, "不能重置自己的密码", { sub_code: "self_reset" });
  }
  const target = await findById(id);
  if (!target) return fail(c, 40401, "账号不存在");
  const oneTime = generateOneTimePassword();
  const password_hash = await hashPassword(oneTime);
  await setMustChangePassword(id, password_hash);
  await recordPasswordHistory(id, password_hash);
  await writeAudit({
    admin_id: operator.admin_id,
    action: "admin.account.password_reset",
    target_type: "admin",
    target_id: String(id),
    payload: null,
    ip: c.req.header("CF-Connecting-IP") ?? null,
    ua: c.req.header("User-Agent") ?? null,
  });
  return ok(c, { one_time_password: oneTime });
});

// ─── POST /:id/reset-2fa ─────────────────────────────────────
app.post("/:id/reset-2fa", zValidator("param", IdParam), async (c) => {
  const { id } = c.req.valid("param");
  const target = await findById(id);
  if (!target) return fail(c, 40401, "账号不存在");
  await clearTotp(id);
  const operator = c.get("admin")!;
  await writeAudit({
    admin_id: operator.admin_id,
    action: "admin.account.totp_reset",
    target_type: "admin",
    target_id: String(id),
    payload: null,
    ip: c.req.header("CF-Connecting-IP") ?? null,
    ua: c.req.header("User-Agent") ?? null,
  });
  return ok(c, { totp_reset: true });
});

export default app;
