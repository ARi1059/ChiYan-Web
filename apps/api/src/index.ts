/**
 * Workers entrypoint。
 *
 * 中间件链顺序（影响行为，不要随便调）：
 *   1. request-id → 每个请求都要有 id，给后续 logger / 错误响应用
 *   2. logger      → finally 块发日志（异常也要发）
 *   3. security-headers → 响应阶段加 HSTS / CSP / 等
 *   4. cors         → preflight + 响应头；errored 响应由 onError 手动补
 *   5. 路由分组
 *
 * onError + notFound 统一走 lib/api.ts 包装。
 */
import { Hono } from "hono";
import { ZodError } from "zod";
import type { AppContext } from "./env";
import { fail, ok } from "./lib/api";
import { applyCorsToError, cors } from "./middleware/cors";
import { logger } from "./middleware/logger";
import { requestId } from "./middleware/request-id";
import { securityHeaders } from "./middleware/security-headers";
import adminRoutes from "./routes/admin";
import authRoutes from "./routes/auth";
import publicRoutes from "./routes/public";

const app = new Hono<AppContext>();

app.use("*", requestId);
app.use("*", logger);
app.use("*", securityHeaders);
app.use("*", cors);

app.get("/health", (c) =>
  ok(c, {
    service: "chiyan-api",
    env: c.env.ENV,
    ts: new Date().toISOString(),
  }),
);

app.route("/api/v1/auth", authRoutes);
app.route("/api/v1/admin", adminRoutes);
app.route("/api/v1/public", publicRoutes);

app.notFound((c) => {
  applyCorsToError(c);
  return fail(c, 40401, "route not found");
});

app.onError((err, c) => {
  applyCorsToError(c);

  if (err instanceof ZodError) {
    return fail(c, 40001, "参数错误", {
      sub_code: "validation",
      issues: err.issues.map((i) => ({ path: i.path, message: i.message })),
    });
  }

  console.error(
    JSON.stringify({
      ts: new Date().toISOString(),
      request_id: c.get("request_id"),
      level: "error",
      message: err.message,
      stack: err.stack,
    }),
  );
  return fail(c, 50001, "internal error");
});

export default app;
