/**
 * /admin/roster/* — 当日名单（接口方案 §4.4）。
 *
 * 角色：owner + admin + operator（roster 所有动作均允许 Operator）。
 *
 * Endpoint：
 *   GET    /          → 查指定日期；不存在返 200 + 空 model_ids（UI 更顺，避免 404 状态机）
 *   PUT    /          → 整覆盖；upsert，触发 audit + purgeByTags(roster:date)
 *   POST   /copy      → from 不存在 → 40401；to 已存在 → 覆盖（与 PUT 一致）
 *   DELETE /          → deleteByDate；触发 audit + purgeByTags
 *   GET    /history   → 跨 from..to 升序日期
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { admin as adminTypes } from "@chiyan/types";
import type { AppContext } from "../../env";
import { fail, ok } from "../../lib/api";
import { writeAudit } from "../../lib/audit";
import { purgeByTags } from "../../lib/cf-cache";
import {
  deleteByDate,
  findByDate,
  findByDateRange,
  upsertRoster,
  type RosterRecord,
} from "../../lib/rosters-repo";
import { csrf } from "../../middleware/csrf";
import { fullyOnboarded } from "../../middleware/fully-onboarded";
import { roleRequired } from "../../middleware/role-required";

const app = new Hono<AppContext>();

app.use("*", fullyOnboarded, roleRequired("owner", "admin", "operator"));

function serialize(r: RosterRecord) {
  return {
    date: r.date,
    model_ids: r.model_ids,
    note: r.note,
    created_by: r.created_by,
    updated_at: r.updated_at.toISOString(),
  };
}

app.get("/", zValidator("query", adminTypes.AdminRosterQuery), async (c) => {
  const { date } = c.req.valid("query");
  const r = await findByDate(date);
  if (!r) {
    // 200 + 空数组：UI 渲染时不需要 404 状态分支
    return ok(c, {
      date,
      model_ids: [],
      note: null,
      created_by: 0,
      updated_at: new Date(0).toISOString(),
    });
  }
  return ok(c, serialize(r));
});

app.put("/", csrf, zValidator("json", adminTypes.AdminRosterPutRequest), async (c) => {
  const { date, model_ids, note } = c.req.valid("json");
  const operator = c.get("admin")!;
  const upserted = await upsertRoster({
    date,
    model_ids,
    note: note ?? null,
    created_by: operator.admin_id,
  });
  await writeAudit({
    admin_id: operator.admin_id,
    action: "admin.roster.upserted",
    target_type: "roster",
    target_id: date,
    payload: { date, count: model_ids.length },
    ip: c.req.header("CF-Connecting-IP") ?? null,
    ua: c.req.header("User-Agent") ?? null,
  });
  await purgeByTags(c.env, [`roster:${date}`]);
  return ok(c, serialize(upserted));
});

app.post("/copy", csrf, zValidator("query", adminTypes.AdminRosterCopyQuery), async (c) => {
  const { from, to } = c.req.valid("query");
  const src = await findByDate(from);
  if (!src) return fail(c, 40401, "源日期无排班");
  const operator = c.get("admin")!;
  const copied = await upsertRoster({
    date: to,
    model_ids: src.model_ids,
    note: src.note,
    created_by: operator.admin_id,
  });
  await writeAudit({
    admin_id: operator.admin_id,
    action: "admin.roster.copied",
    target_type: "roster",
    target_id: to,
    payload: { from, to, count: src.model_ids.length },
    ip: c.req.header("CF-Connecting-IP") ?? null,
    ua: c.req.header("User-Agent") ?? null,
  });
  await purgeByTags(c.env, [`roster:${to}`]);
  return ok(c, serialize(copied));
});

app.delete("/", csrf, zValidator("query", adminTypes.AdminRosterQuery), async (c) => {
  const { date } = c.req.valid("query");
  const deleted = await deleteByDate(date);
  if (!deleted) return fail(c, 40401, "该日期无排班");
  const operator = c.get("admin")!;
  await writeAudit({
    admin_id: operator.admin_id,
    action: "admin.roster.deleted",
    target_type: "roster",
    target_id: date,
    payload: { date },
    ip: c.req.header("CF-Connecting-IP") ?? null,
    ua: c.req.header("User-Agent") ?? null,
  });
  await purgeByTags(c.env, [`roster:${date}`]);
  return ok(c, { deleted: true });
});

app.get("/history", zValidator("query", adminTypes.AdminRosterHistoryQuery), async (c) => {
  const { from, to } = c.req.valid("query");
  const items = await findByDateRange(from, to);
  return ok(c, { items: items.map(serialize) });
});

export default app;
