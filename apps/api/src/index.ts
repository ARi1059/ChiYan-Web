import { Hono } from "hono";
import type { Env } from "./env.js";

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) =>
  c.json({
    ok: true,
    service: "chiyan-api",
    ts: new Date().toISOString(),
  }),
);

app.notFound((c) => c.json({ code: "NOT_FOUND", message: "route not found" }, 404));

app.onError((err, c) => {
  console.error("unhandled", err);
  return c.json({ code: "INTERNAL", message: "internal error" }, 500);
});

export default app;
