/**
 * /admin/audit-logs/* — 审计日志读路径（接口方案 §4.8）。
 *
 * 角色：owner + admin（operator 不见）。
 * 数据源：lib/audit ring（mock）。Step 7 切 Drizzle audit_logs 表。
 *
 * 响应 payload 已在 writeAudit 落库时经 sanitize() 兜底，理论上不含 password / one_time_password /
 * real_name 等敏感字段；此处直接返。
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { admin as adminTypes } from "@chiyan/types";
import { z } from "zod";
import type { AppContext } from "../../env";
import { fail, ok } from "../../lib/api";
import { findAuditById, findAuditLogs, type AuditRow } from "../../lib/audit";
import { csrf } from "../../middleware/csrf";
import { fullyOnboarded } from "../../middleware/fully-onboarded";
import { roleRequired } from "../../middleware/role-required";

const app = new Hono<AppContext>();

app.use("*", fullyOnboarded, csrf, roleRequired("owner", "admin"));

const IdParam = z.object({ id: z.coerce.number().int().positive() });

function serialize(row: AuditRow): Record<string, unknown> {
  // 接口 schema：target_id 是 number | null。ring 存的是 string；
  // 数字可转就转，否则 null（避免破坏前端类型）。
  let target_id: number | null = null;
  if (row.target_id != null) {
    const n = Number(row.target_id);
    target_id = Number.isInteger(n) ? n : null;
  }
  return {
    id: row.id,
    admin_id: row.admin_id,
    admin_username: null, // mock 阶段不 join admins；Step 7 真 DB 再 join
    action: row.action,
    target_type: row.target_type,
    target_id,
    payload: row.payload,
    ip: row.ip,
    user_agent: row.ua,
    created_at: row.created_at.toISOString(),
  };
}

app.get("/", zValidator("query", adminTypes.AdminAuditQuery), async (c) => {
  const q = c.req.valid("query");
  const { items, total } = await findAuditLogs({
    admin_id: q.admin_id,
    action: q.action,
    target_type: q.target_type,
    from: q.from ? new Date(q.from) : undefined,
    to: q.to ? new Date(q.to) : undefined,
    page: q.page,
    page_size: q.page_size,
  });
  return ok(c, {
    items: items.map(serialize),
    total,
    page: q.page,
    page_size: q.page_size,
  });
});

app.get("/:id", zValidator("param", IdParam), async (c) => {
  const { id } = c.req.valid("param");
  const row = await findAuditById(id);
  if (!row) return fail(c, 40401, "审计记录不存在");
  return ok(c, serialize(row));
});

export default app;
