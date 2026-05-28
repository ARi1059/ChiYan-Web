/**
 * /api/v1/admin/* 路由聚合。Phase 2+ 主体填充；Phase 1 仅含 accounts/unlock。
 *
 * 全局：authRequired（要 admin_id）→ rateLimit(120/min/admin_id)。
 * 子路由再叠加 fullyOnboarded / csrf / roleRequired 等。
 */
import { Hono } from "hono";
import type { AppContext } from "../../env";
import { authRequired } from "../../middleware/auth-required";
import { keyFromAdmin, rateLimit } from "../../middleware/rate-limit";
import accounts from "./accounts";
import auditLogs from "./audit-logs";
import models from "./models";

const admin = new Hono<AppContext>();

admin.use(
  "*",
  authRequired,
  rateLimit({ bucket: "admin_id", windowMs: 60_000, max: 120, key: keyFromAdmin }),
);

admin.route("/accounts", accounts);
admin.route("/models", models);
admin.route("/audit-logs", auditLogs);

// TODO: Phase 3
// admin.route("/roster", roster);
// admin.route("/media", media);
// admin.route("/schedule", schedule);

export default admin;
