/**
 * /api/v1/auth/* 路由聚合。
 *
 * 子路由按职责拆：
 *   session.ts  → /login, /login/totp, /refresh, /logout
 *   profile.ts  → /me, /change-password
 *   totp.ts     → /totp/setup, /totp/verify
 *
 * 限流挂载点在 apps/api/src/index.ts，避免子路由耦合限流配置（Step 6 接 Upstash）。
 */
import { Hono } from "hono";
import type { AppContext } from "../../env";
import profile from "./profile";
import session from "./session";
import totp from "./totp";

const auth = new Hono<AppContext>();

auth.route("/", session);
auth.route("/", profile);
auth.route("/totp", totp);

export default auth;
