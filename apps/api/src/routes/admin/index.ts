/**
 * /api/v1/admin/* 路由聚合。Phase 2+ 填充。
 *
 * 挂载时整组 chain：auth-required → fully-onboarded → csrf → rate-limit。
 */
import { Hono } from "hono";
import type { AppContext } from "../../env";

const admin = new Hono<AppContext>();

// TODO: Phase 2/3
// admin.route("/models", models);
// admin.route("/roster", roster);
// admin.route("/media", media);
// admin.route("/schedule", schedule);
// admin.route("/accounts", accounts);
// admin.route("/audit-logs", auditLogs);

export default admin;
