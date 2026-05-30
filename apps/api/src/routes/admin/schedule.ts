/**
 * /admin/schedule —— 模特档期 CRUD（接口方案 §4.10）。
 *
 * - GET    /          范围查询，可按 model_id 过滤；返扁平 entries 数组
 * - PUT    /          upsert 一条（model_id + date 是唯一键）
 * - DELETE /:model_id/:date    取消一天的状态
 *
 * 角色：owner / admin（operator 读得到，写禁）。csrf 仅挂写路径。
 * 审计：PUT + DELETE 都写一条；payload 包 model_id / date / status / note 摘要。
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { admin as adminTypes } from "@chiyan/types";
import { z } from "zod";
import type { AppContext } from "../../env";
import { fail, ok } from "../../lib/api";
import { writeAudit } from "../../lib/audit";
import {
  deleteScheduleEntry,
  findScheduleInRange,
  upsertScheduleEntry,
  type ScheduleEntryRecord,
} from "../../lib/schedule-repo";
import { csrf } from "../../middleware/csrf";
import { fullyOnboarded } from "../../middleware/fully-onboarded";
import { roleRequired } from "../../middleware/role-required";

const app = new Hono<AppContext>();

// onboard 兜底；读路径不挂 csrf，写路径单独挂
app.use("*", fullyOnboarded);

const KeyParam = z.object({
  model_id: z.coerce.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD"),
});

function serialize(r: ScheduleEntryRecord): adminTypes.AdminScheduleEntry {
  return {
    id: r.id,
    model_id: r.model_id,
    date: r.date,
    status: r.status,
    note: r.note,
    created_at: r.created_at.toISOString(),
    updated_at: r.updated_at.toISOString(),
  };
}

// ─── GET / —— range query ─────────────────────────────────
app.get(
  "/",
  roleRequired("owner", "admin", "operator"),
  zValidator("query", adminTypes.AdminScheduleRangeQuery),
  async (c) => {
    const q = c.req.valid("query");
    const items = await findScheduleInRange({
      from: q.from,
      to: q.to,
      model_id: q.model_id,
    });
    return ok(c, {
      from: q.from,
      to: q.to,
      items: items.map(serialize),
    });
  },
);

// ─── PUT / —— upsert ──────────────────────────────────────
app.put(
  "/",
  roleRequired("owner", "admin"),
  csrf,
  zValidator("json", adminTypes.AdminScheduleUpsertRequest),
  async (c) => {
    const input = c.req.valid("json");
    const operator = c.get("admin")!;
    const created = await upsertScheduleEntry({
      model_id: input.model_id,
      date: input.date,
      status: input.status,
      note: input.note ?? null,
    });
    await writeAudit({
      admin_id: operator.admin_id,
      action: "admin.schedule.upserted",
      target_type: "schedule",
      target_id: String(created.id),
      payload: {
        model_id: created.model_id,
        date: created.date,
        status: created.status,
        has_note: created.note != null && created.note.length > 0,
      },
      ip: c.req.header("CF-Connecting-IP") ?? null,
      ua: c.req.header("User-Agent") ?? null,
    });
    return ok(c, serialize(created));
  },
);

// ─── DELETE /:model_id/:date ──────────────────────────────
app.delete(
  "/:model_id/:date",
  roleRequired("owner", "admin"),
  csrf,
  zValidator("param", KeyParam),
  async (c) => {
    const { model_id, date } = c.req.valid("param");
    const deleted = await deleteScheduleEntry(model_id, date);
    if (!deleted) return fail(c, 40401, "该档期不存在");
    const operator = c.get("admin")!;
    await writeAudit({
      admin_id: operator.admin_id,
      action: "admin.schedule.deleted",
      target_type: "schedule",
      target_id: null,
      payload: { model_id, date },
      ip: c.req.header("CF-Connecting-IP") ?? null,
      ua: c.req.header("User-Agent") ?? null,
    });
    return ok(c, { deleted: true });
  },
);

export default app;
