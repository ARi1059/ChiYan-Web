/**
 * 强制 onboarding 完成。
 *
 * 用在 /admin/* 全组 + 不允许半状态访问的接口。
 * 检查（基于 c.get('admin') — 必须先过 authRequired）：
 *   - must_change_password === false
 *   - totp_enrolled === true
 *   - status === 'active'
 *
 * 任一失败 → 40301 + sub_code，前端据 sub_code 路由到对应步骤。
 *   - must_change_password → sub_code='must_change_password'
 *   - !totp_enrolled       → sub_code='totp_enrollment_required'
 *   - status!=='active'    → sub_code='account_disabled'
 */
import { createMiddleware } from "hono/factory";
import type { AppContext } from "../env";
import { fail } from "../lib/api";
import { findById } from "../lib/admin-repo";

export const fullyOnboarded = createMiddleware<AppContext>(async (c, next) => {
  const admin = c.get("admin");
  if (!admin) return fail(c, 40101, "未授权");

  const record = await findById(admin.admin_id);
  if (!record) return fail(c, 40101, "未授权");

  if (record.status !== "active") {
    return fail(c, 40301, "账号已停用", { sub_code: "account_disabled" });
  }
  if (record.must_change_password) {
    return fail(c, 40301, "请先修改初始密码", { sub_code: "must_change_password" });
  }
  if (!record.totp_enrolled) {
    return fail(c, 40301, "请先绑定 TOTP", { sub_code: "totp_enrollment_required" });
  }

  await next();
});
