/**
 * /api/v1/public/* 路由聚合。Phase 2 填充。
 *
 * 无鉴权但要限流（60/min/IP）+ CDN 缓存（缓存策略在 cloudflare 侧）。
 */
import { Hono } from "hono";
import type { AppContext } from "../../env";
import { keyFromIp, rateLimit } from "../../middleware/rate-limit";

const pub = new Hono<AppContext>();

pub.use(
  "*",
  rateLimit({ bucket: "public_ip", windowMs: 60_000, max: 60, key: keyFromIp }),
);

// TODO: Phase 2
// pub.get("/today", today);
// pub.get("/models", models);
// pub.get("/models/:code", modelDetail);
// pub.get("/studio-info", studioInfo);
// pub.post("/track", track);

export default pub;
