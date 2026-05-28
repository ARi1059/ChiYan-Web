/**
 * 角色守卫工厂。挂在 authRequired 之后。
 *
 * 用法：app.use("/admin/accounts/*", roleRequired("owner"))
 *
 * 失败：40301 + sub_code=insufficient_role。
 */
import { createMiddleware } from "hono/factory";
import type { AppContext } from "../env";
import { fail } from "../lib/api";
import { findById } from "../lib/admin-repo";
import type { AdminRole } from "@chiyan/types";

export function roleRequired(...allowed: AdminRole[]) {
  return createMiddleware<AppContext>(async (c, next) => {
    const a = c.get("admin");
    if (!a) return fail(c, 40101, "未授权");
    const record = await findById(a.admin_id);
    if (!record) return fail(c, 40101, "未授权");
    if (!allowed.includes(record.role)) {
      return fail(c, 40301, "权限不足", { sub_code: "insufficient_role" });
    }
    await next();
  });
}
