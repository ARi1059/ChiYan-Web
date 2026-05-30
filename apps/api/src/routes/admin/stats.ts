/**
 * /admin/stats — 数据看板聚合（接口方案 §4.10，owner + admin）。
 *
 * 单 GET，纯读，无 csrf（与 audit-logs 一致，只校 onboard + 角色）。
 * 口径：
 *  - 今日 = UTC 当天（new Date().toISOString().slice(0,10)），与 public/today 对齐
 *  - PV/UV 取 public_visits 当天（00:00 UTC 起）；UV = distinct ip_hash
 *  - 在班 = daily_roster(今日).model_ids 数
 *  - 待补资料 = active 且缺封面或画廊为空
 *  - 热度榜 = 近 7 天按 model_id 聚合访问量前 8，回填 code/nickname
 *
 * 所有子查询并行（互不依赖），名称回填依赖热度榜结果故串行第二跳。
 */
import { Hono } from "hono";
import type { admin as adminTypes } from "@chiyan/types";
import type { AppContext } from "../../env";
import { ok } from "../../lib/api";
import {
  adminCountIncompleteModels,
  adminCountModelsByStatus,
  adminFindModelsByIds,
} from "../../lib/models-repo";
import { findByDate } from "../../lib/rosters-repo";
import {
  countUniqueVisitorsSince,
  countVisitsSince,
  topModelsByVisitsSince,
} from "../../lib/visits-repo";
import { fullyOnboarded } from "../../middleware/fully-onboarded";
import { roleRequired } from "../../middleware/role-required";

const app = new Hono<AppContext>();

app.use("*", fullyOnboarded, roleRequired("owner", "admin"));

const TOP_WINDOW_DAYS = 7;
const TOP_LIMIT = 8;

app.get("/", async (c) => {
  const today = new Date().toISOString().slice(0, 10);
  const startOfToday = new Date(`${today}T00:00:00.000Z`);
  const windowStart = new Date(Date.now() - TOP_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [pv, uv, roster, counts, incomplete, top] = await Promise.all([
    countVisitsSince(startOfToday),
    countUniqueVisitorsSince(startOfToday),
    findByDate(today),
    adminCountModelsByStatus(),
    adminCountIncompleteModels(),
    topModelsByVisitsSince(windowStart, TOP_LIMIT),
  ]);

  const nameRows = await adminFindModelsByIds(top.map((t) => t.model_id));
  const byId = new Map(nameRows.map((r) => [r.id, r]));
  const top_models = top.map((t) => {
    const m = byId.get(t.model_id);
    return {
      model_id: t.model_id,
      code: m?.code ?? null,
      nickname: m?.nickname ?? `#${t.model_id}`,
      visits: t.visits,
    };
  });

  return ok(c, {
    today,
    visits_today: { pv, uv },
    on_duty_today: roster?.model_ids.length ?? 0,
    models: {
      active: counts.active,
      archived: counts.archived,
      incomplete,
    },
    top_models,
    top_models_window_days: TOP_WINDOW_DAYS,
  } satisfies adminTypes.AdminStatsResponse);
});

export default app;
