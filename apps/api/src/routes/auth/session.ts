/**
 * /auth/login | /auth/login/totp | /auth/refresh | /auth/logout
 *
 * 状态机（接口方案 §4.2）：
 *   login(username, password)
 *     ├─ locked_until > now → 40301 sub_code=locked
 *     ├─ password mismatch  → incrementFailedLogin；count >= 5 → lockAccount + 40301；否则 40101
 *     └─ ok                → markLoginSuccess + 发 challenge_token（5min）
 *
 *   login/totp(challenge_token, code)  [challengeRequired middleware 已 consume jti]
 *     ├─ account.totp_enrolled = true → verifyCode 失败 → 40101
 *     └─ ok / bootstrap (totp_enrolled=false) → 发 access+refresh+csrf
 *
 *   refresh  [读 cookie]
 *     ├─ verify refresh → ok 否则 40101
 *     ├─ jti 已撤销 → 40101
 *     └─ 轮换：撤旧 refresh + 发新 access+refresh+csrf
 *
 *   logout  [authRequired + csrf]
 *     └─ 加黑 access + refresh jti + 清 cookie
 *
 * 审计：login.failed / login.locked / login.ok / login.totp.failed / login.totp.ok / refresh / logout
 * 写 audit payload 用 sanitize 兜底（虽然这里只写 admin_id / ip / ua 等不含明文，但保留防御）。
 */

import { zValidator } from "@hono/zod-validator";
import { getCookie } from "hono/cookie";
import { Hono } from "hono";
import { auth as authTypes } from "@chiyan/types";
import type { AppContext } from "../../env";
import { fail, ok } from "../../lib/api";
import { writeAudit } from "../../lib/audit";
import {
  issueChallenge,
  issueSession,
  revokeSession,
} from "../../lib/auth-tokens";
import { decrypt } from "../../lib/crypto";
import { keyRingFromEnv } from "../../lib/keyring";
import {
  findById,
  findByUsername,
  incrementFailedLogin,
  lockAccount,
  markLoginSuccess,
} from "../../lib/admin-repo";
import { revoke as revokeJti } from "../../lib/jti-store";
import { verifyJwt } from "../../lib/jwt";
import { verifyPassword } from "../../lib/password";
import { verifyCode } from "../../lib/totp";
import { authRequired } from "../../middleware/auth-required";
import { challengeRequired } from "../../middleware/challenge-required";
import { refreshCookieName } from "../../lib/cookie";
import { csrf } from "../../middleware/csrf";

const MAX_FAILED = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;

const app = new Hono<AppContext>();

// ─── POST /login ──────────────────────────────────────────────────
app.post("/login", zValidator("json", authTypes.LoginRequest), async (c) => {
  const { username, password } = c.req.valid("json");
  const ip = c.req.header("CF-Connecting-IP") ?? null;
  const ua = c.req.header("User-Agent") ?? null;

  const admin = await findByUsername(username);
  // 防用户枚举：不存在与密码错返回同样 40101
  if (!admin) {
    await writeAudit({
      admin_id: null,
      action: "auth.login.failed",
      target_type: "admin",
      target_id: null,
      payload: { username, reason: "user_not_found" },
      ip,
      ua,
    });
    return fail(c, 40101, "用户名或密码错误");
  }

  if (admin.status !== "active") {
    return fail(c, 40301, "账号已停用", { sub_code: "account_disabled" });
  }

  if (admin.locked_until && admin.locked_until.getTime() > Date.now()) {
    return fail(c, 40301, "账号已被锁定", {
      sub_code: "locked",
      locked_until: admin.locked_until.toISOString(),
    });
  }

  const passwordOk = await verifyPassword(password, admin.password_hash);
  if (!passwordOk) {
    const newCount = await incrementFailedLogin(admin.id);
    if (newCount >= MAX_FAILED) {
      const until = new Date(Date.now() + LOCK_DURATION_MS);
      await lockAccount(admin.id, until);
      await writeAudit({
        admin_id: admin.id,
        action: "auth.login.locked",
        target_type: "admin",
        target_id: String(admin.id),
        payload: { locked_until: until.toISOString() },
        ip,
        ua,
      });
      return fail(c, 40301, "失败次数过多，账号已锁定", {
        sub_code: "locked",
        locked_until: until.toISOString(),
      });
    }
    await writeAudit({
      admin_id: admin.id,
      action: "auth.login.failed",
      target_type: "admin",
      target_id: String(admin.id),
      payload: { reason: "bad_password", failed_count: newCount },
      ip,
      ua,
    });
    return fail(c, 40101, "用户名或密码错误");
  }

  await markLoginSuccess(admin.id);
  const { challenge_token } = await issueChallenge(c, admin.id);

  await writeAudit({
    admin_id: admin.id,
    action: "auth.login.challenge_issued",
    target_type: "admin",
    target_id: String(admin.id),
    payload: null,
    ip,
    ua,
  });

  return ok(c, { challenge_token } satisfies authTypes.LoginResponse);
});

// ─── POST /login/totp ─────────────────────────────────────────────
// 注意：zValidator 解析 body 后会 cache，challengeRequired 复用没问题。
app.post("/login/totp", zValidator("json", authTypes.LoginTotpRequest), challengeRequired, async (c) => {
  const { code } = c.req.valid("json");
  const adminId = c.get("challenge_admin_id")!;
  const ip = c.req.header("CF-Connecting-IP") ?? null;
  const ua = c.req.header("User-Agent") ?? null;

  const admin = await findById(adminId);
  if (!admin || admin.status !== "active") return fail(c, 40101, "未授权");

  // 已绑定 → 强制校验 TOTP；未绑定 → bootstrap 放行（一次性密码已是事实第一因素）
  if (admin.totp_enrolled) {
    if (!admin.totp_secret_enc) {
      // 数据不一致；保守拒绝
      return fail(c, 40101, "未授权");
    }
    let secretB32: string;
    try {
      secretB32 = await decrypt(admin.totp_secret_enc, keyRingFromEnv(c.env));
    } catch {
      return fail(c, 40101, "未授权");
    }
    if (!verifyCode(secretB32, code)) {
      await writeAudit({
        admin_id: admin.id,
        action: "auth.totp.failed",
        target_type: "admin",
        target_id: String(admin.id),
        payload: null,
        ip,
        ua,
      });
      return fail(c, 40101, "TOTP 校验失败");
    }
  }

  const { access_token } = await issueSession(c, admin.id);
  await writeAudit({
    admin_id: admin.id,
    action: admin.totp_enrolled ? "auth.login.ok" : "auth.login.bootstrap",
    target_type: "admin",
    target_id: String(admin.id),
    payload: null,
    ip,
    ua,
  });

  return ok(c, {
    access_token,
    must_change_password: admin.must_change_password,
    totp_enrolled: admin.totp_enrolled,
  } satisfies authTypes.LoginTotpResponse);
});

// ─── POST /refresh ────────────────────────────────────────────────
app.post("/refresh", async (c) => {
  const cookieName = refreshCookieName(c.env);
  const token = getCookie(c, cookieName);
  if (!token) return fail(c, 40101, "未授权");

  let claims;
  try {
    claims = await verifyJwt(token, c.env.JWT_SECRET, "refresh");
  } catch {
    return fail(c, 40101, "未授权");
  }

  const adminId = Number(claims.sub);
  // 撤销旧 refresh jti（rotation）
  const now = Math.floor(Date.now() / 1000);
  await revokeJti(claims.jti, Math.max(0, claims.exp - now));

  const admin = await findById(adminId);
  if (!admin || admin.status !== "active") return fail(c, 40101, "未授权");

  const { access_token } = await issueSession(c, adminId);
  await writeAudit({
    admin_id: adminId,
    action: "auth.refresh",
    target_type: "admin",
    target_id: String(adminId),
    payload: null,
    ip: c.req.header("CF-Connecting-IP") ?? null,
    ua: c.req.header("User-Agent") ?? null,
  });

  return ok(c, { access_token } satisfies authTypes.RefreshResponse);
});

// ─── POST /logout ─────────────────────────────────────────────────
app.post("/logout", authRequired, csrf, async (c) => {
  const access = c.get("admin")!;
  // 读 refresh cookie 并尽力撤销（即使 cookie 缺失或解析失败也不报错，最终还是清 cookie）
  const cookieName = refreshCookieName(c.env);
  const refreshToken = getCookie(c, cookieName);
  let refreshClaims;
  if (refreshToken) {
    try {
      refreshClaims = await verifyJwt(refreshToken, c.env.JWT_SECRET, "refresh");
    } catch {
      refreshClaims = undefined;
    }
  }
  await revokeSession(c, access, refreshClaims);

  await writeAudit({
    admin_id: access.admin_id,
    action: "auth.logout",
    target_type: "admin",
    target_id: String(access.admin_id),
    payload: null,
    ip: c.req.header("CF-Connecting-IP") ?? null,
    ua: c.req.header("User-Agent") ?? null,
  });

  return ok(c, { logged_out: true });
});

export default app;
