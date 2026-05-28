/**
 * /api/v1/auth/* 路由聚合。
 *
 * Phase 1 Step 5b 填充：session / profile / totp 三个子模块。
 * 此处先占位，让 index.ts 能挂载且 404 走 hono 标准链路。
 */
import { Hono } from "hono";
import type { AppContext } from "../../env";

const auth = new Hono<AppContext>();

// TODO: Phase 1 Step 5b
// auth.route("/", session);
// auth.route("/", profile);
// auth.route("/totp", totp);

export default auth;
