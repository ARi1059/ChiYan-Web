/**
 * /api/v1/admin/* 路由聚合。Phase 2+ 主体填充；Phase 1 仅含 accounts/unlock。
 *
 * 子路由内自管中间件链：auth-required → fully-onboarded → csrf → role-required。
 * 限流挂载点在 apps/api/src/index.ts。
 */
import { Hono } from "hono";
import type { AppContext } from "../../env";
import accounts from "./accounts";

const admin = new Hono<AppContext>();

admin.route("/accounts", accounts);

// TODO: Phase 2/3
// admin.route("/models", models);
// admin.route("/roster", roster);
// admin.route("/media", media);
// admin.route("/schedule", schedule);
// admin.route("/audit-logs", auditLogs);

export default admin;
