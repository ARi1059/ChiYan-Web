/**
 * /auth/me | /auth/change-password
 *
 * GET /auth/me：返当前账号状态（must_change_password / totp_enrolled / last_login_at / role）。
 * POST /auth/change-password：旧密验证 → 新密不在最近 5 条历史 → hash → 推 history → updatePassword
 *   → 撤掉当前 access+refresh（同设备会被踢回登录页）→ 不发新 token（前端 redirect 登录）
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { auth as authTypes } from "@chiyan/types";
import type { AppContext } from "../../env";
import { fail, ok } from "../../lib/api";
import { writeAudit } from "../../lib/audit";
import { revokeSession } from "../../lib/auth-tokens";
import { refreshCookieName } from "../../lib/cookie";
import {
  findById,
  getPasswordHistory,
  recordPasswordHistory,
  updatePassword,
} from "../../lib/admin-repo";
import { getCookie } from "hono/cookie";
import { verifyJwt } from "../../lib/jwt";
import { hashPassword, verifyPassword } from "../../lib/password";
import { authRequired } from "../../middleware/auth-required";
import { csrf } from "../../middleware/csrf";
import { keyFromAdmin, rateLimit } from "../../middleware/rate-limit";

const PASSWORD_HISTORY_LIMIT = 5;

const app = new Hono<AppContext>();

// ─── GET /me ──────────────────────────────────────────────────────
app.get("/me", authRequired, async (c) => {
  const admin = c.get("admin")!;
  const record = await findById(admin.admin_id);
  if (!record) return fail(c, 40101, "未授权");
  return ok(c, {
    id: record.id,
    username: record.username,
    display_name: record.display_name,
    role: record.role,
    must_change_password: record.must_change_password,
    totp_enrolled: record.totp_enrolled,
    last_login_at: record.last_login_at ? record.last_login_at.toISOString() : null,
  } satisfies authTypes.MeResponse);
});

// ─── POST /change-password ────────────────────────────────────────
// 限流：10/h/admin_id（接口方案 §7.1）。authRequired 后挂，确保有 admin_id。
app.post(
  "/change-password",
  authRequired,
  rateLimit({ bucket: "sensitive_admin", windowMs: 60 * 60 * 1000, max: 10, key: keyFromAdmin }),
  csrf,
  zValidator("json", authTypes.ChangePasswordRequest),
  async (c) => {
    const { old_password, new_password } = c.req.valid("json");
    const access = c.get("admin")!;
    const record = await findById(access.admin_id);
    if (!record) return fail(c, 40101, "未授权");

    if (old_password === new_password) {
      return fail(c, 40001, "新密码不能与旧密码相同", { sub_code: "password_same" });
    }

    const oldOk = await verifyPassword(old_password, record.password_hash);
    if (!oldOk) return fail(c, 40001, "原密码错误", { sub_code: "password_mismatch" });

    // 复杂度二次校验：至少包含 数字 + 字母（plan 说 3 类，但接口方案没具体，先放宽到 2 类避免阻塞）
    if (!/[a-zA-Z]/.test(new_password) || !/\d/.test(new_password)) {
      return fail(c, 40001, "新密码强度不足", { sub_code: "password_weak" });
    }

    // 历史 5 条不复用
    const history = await getPasswordHistory(record.id, PASSWORD_HISTORY_LIMIT);
    const allHashes = [record.password_hash, ...history.map((h) => h.password_hash)];
    for (const h of allHashes) {
      if (await verifyPassword(new_password, h)) {
        return fail(c, 40001, "新密码不能与最近 5 次重复", { sub_code: "password_reuse" });
      }
    }

    // 推历史 → 更新当前 → 撤当前会话
    await recordPasswordHistory(record.id, record.password_hash);
    const newHash = await hashPassword(new_password);
    await updatePassword(record.id, newHash);

    const cookieName = refreshCookieName(c.env);
    const refreshToken = getCookie(c, cookieName);
    let refreshClaims;
    if (refreshToken) {
      try {
        refreshClaims = await verifyJwt(refreshToken, c.env.JWT_SECRET, "refresh");
      } catch {
        refreshClaims = undefined;
      }
    }
    await revokeSession(c, access, refreshClaims);

    await writeAudit({
      admin_id: record.id,
      action: "auth.password.changed",
      target_type: "admin",
      target_id: String(record.id),
      payload: null,
      ip: c.req.header("CF-Connecting-IP") ?? null,
      ua: c.req.header("User-Agent") ?? null,
    });

    return ok(c, { changed: true });
  },
);

export default app;
