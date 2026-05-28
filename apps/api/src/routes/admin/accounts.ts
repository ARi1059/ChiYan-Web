/**
 * /admin/accounts/* — Owner-only。
 *
 * Phase 1 仅 unlock 一个端点（Phase 1 退出标准：Owner 可 /admin/accounts/:id/unlock 解锁）。
 * 完整的 CRUD（创建账号 + 一次性密码下发 / 重置密码 / 角色管理）Phase 2/3 再补。
 */
import { Hono } from "hono";
import type { AppContext } from "../../env";
import { fail, ok } from "../../lib/api";
import { writeAudit } from "../../lib/audit";
import { findById, unlockAccount } from "../../lib/admin-repo";
import { authRequired } from "../../middleware/auth-required";
import { csrf } from "../../middleware/csrf";
import { fullyOnboarded } from "../../middleware/fully-onboarded";
import { roleRequired } from "../../middleware/role-required";

const app = new Hono<AppContext>();

app.use("*", authRequired, fullyOnboarded, csrf, roleRequired("owner"));

app.post("/:id/unlock", async (c) => {
  const idParam = c.req.param("id");
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) {
    return fail(c, 40001, "id 非法", { sub_code: "bad_id" });
  }

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

export default app;
