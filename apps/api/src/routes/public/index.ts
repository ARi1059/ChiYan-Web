/**
 * /api/v1/public/* 路由聚合。Phase 2 填充。
 *
 * 无鉴权但要限流 + CDN 缓存（缓存策略在 cloudflare 侧）。
 */
import { Hono } from "hono";
import type { AppContext } from "../../env";

const pub = new Hono<AppContext>();

// TODO: Phase 2
// pub.get("/today", today);
// pub.get("/models", models);
// pub.get("/models/:code", modelDetail);
// pub.get("/studio-info", studioInfo);
// pub.post("/track", track);

export default pub;
