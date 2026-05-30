/**
 * /api/v1/public/* 路由聚合。
 *
 * 无鉴权但要限流（60/min/IP）+ CDN 缓存（Cache-Control 由各 handler 设置；
 * Cloudflare 按 s-maxage 边缘缓存，Cache-Tag header 配合 cf-cache.purgeByTags 失效）。
 */
import { Hono } from "hono";
import type { AppContext } from "../../env";
import { keyFromIp, rateLimit } from "../../middleware/rate-limit";
import models from "./models";
import studio from "./studio";
import today from "./today";
import track from "./track";

const pub = new Hono<AppContext>();

pub.use("*", rateLimit({ bucket: "public_ip", windowMs: 60_000, max: 60, key: keyFromIp }));

pub.route("/today", today);
pub.route("/models", models);
pub.route("/studio-info", studio);
pub.route("/track", track);

export default pub;
