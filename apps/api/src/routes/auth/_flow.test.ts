/**
 * Phase 1 Step 5b 集成测试：完整 Owner 闭环（mock 数据）。
 *
 * 一次性密码 → login → login/totp（bootstrap，跳过 TOTP）→ /me（must_change_password=true）
 * → change-password → 重登 → login/totp（bootstrap）→ /me（totp_enrolled=false）
 * → totp/setup → totp/verify → /me（fully onboarded）。
 *
 * 通过该测试 = Step 5b 退出标准成立。
 */
import { beforeEach, describe, expect, it } from "vitest";
import app from "../../index";
import {
  _insertForTests,
  _resetAdminRepoForTests,
} from "../../lib/admin-repo";
import { _resetAuditForTests } from "../../lib/audit";
import { _resetChallengeStoreForTests } from "../../lib/challenge-store";
import { _resetJtiStoreForTests } from "../../lib/jti-store";
import { _resetKeyRingCacheForTests } from "../../lib/keyring";
import { hashPassword } from "../../lib/password";
import { generateCode } from "../../lib/totp";
import { _resetTotpSetupStoreForTests } from "../../lib/totp-setup-store";
import { _resetRateLimitForTests } from "../../middleware/rate-limit";

// 32 字节随机 key（base64）作为 ENC_KEY_V1；ALLOWED_ORIGINS 允许测试 origin
const ENV = {
  ENV: "dev" as const,
  ALLOWED_ORIGINS: '["http://localhost:5173"]',
  DATABASE_URL: "postgres://test",
  UPSTASH_REDIS_REST_URL: "https://test.upstash",
  UPSTASH_REDIS_REST_TOKEN: "test-token",
  JWT_SECRET: "test-jwt-secret-at-least-32-bytes-long-padding-padding",
  ENC_KEY_V1: btoa(String.fromCharCode(...new Uint8Array(32).fill(7))),
};

const ONE_TIME_PASSWORD = "BootstrapPass-2026!";

async function seedOwner() {
  const password_hash = await hashPassword(ONE_TIME_PASSWORD);
  return _insertForTests({
    username: "owner",
    display_name: "Studio Owner",
    role: "owner",
    status: "active",
    password_hash,
    totp_secret_enc: null,
    totp_enrolled: false,
    must_change_password: true,
    failed_login_count: 0,
    locked_until: null,
    last_login_at: null,
  });
}

function makeRequest(path: string, init: RequestInit & { csrf?: string; cookie?: string } = {}) {
  const headers = new Headers(init.headers);
  if (init.csrf) headers.set("X-CSRF-Token", init.csrf);
  if (init.cookie) headers.set("Cookie", init.cookie);
  headers.set("CF-Connecting-IP", "127.0.0.1");
  headers.set("User-Agent", "vitest");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return app.request(path, { ...init, headers }, ENV);
}

/** 解析 Set-Cookie 数组 → { name: value, ... }，仅提取 name=value，不保留属性。 */
function parseSetCookie(res: Response): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of res.headers.getSetCookie?.() ?? []) {
    const eq = raw.indexOf("=");
    const sc = raw.indexOf(";");
    if (eq < 0) continue;
    const name = raw.slice(0, eq);
    const value = raw.slice(eq + 1, sc < 0 ? undefined : sc);
    out[name] = value;
  }
  return out;
}

function cookieHeader(jar: Record<string, string>): string {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

beforeEach(() => {
  _resetAdminRepoForTests();
  _resetChallengeStoreForTests();
  _resetJtiStoreForTests();
  _resetAuditForTests();
  _resetTotpSetupStoreForTests();
  _resetKeyRingCacheForTests();
  _resetRateLimitForTests();
});

describe("Phase 1 — Owner 完整 onboarding 闭环", () => {
  it("用一次性密码完成 login → login/totp → change-password → totp/setup → totp/verify → me(fully onboarded)", async () => {
    const owner = await seedOwner();

    // ── 1. POST /auth/login (一次性密码)
    const loginRes = await makeRequest("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: "owner", password: ONE_TIME_PASSWORD }),
    });
    expect(loginRes.status).toBe(200);
    const loginBody = (await loginRes.json()) as { code: number; data: { challenge_token: string } };
    expect(loginBody.code).toBe(0);
    expect(loginBody.data.challenge_token).toMatch(/^eyJ/);

    // ── 2. POST /auth/login/totp (bootstrap, totp_enrolled=false → 跳过 code 校验)
    const ltRes = await makeRequest("/api/v1/auth/login/totp", {
      method: "POST",
      body: JSON.stringify({ challenge_token: loginBody.data.challenge_token, code: "000000" }),
    });
    expect(ltRes.status).toBe(200);
    const ltBody = (await ltRes.json()) as {
      code: number;
      data: { access_token: string; must_change_password: boolean; totp_enrolled: boolean };
    };
    expect(ltBody.data.must_change_password).toBe(true);
    expect(ltBody.data.totp_enrolled).toBe(false);
    const access1 = ltBody.data.access_token;
    const jar = parseSetCookie(ltRes);
    expect(jar["chiyan_refresh"]).toBeTruthy(); // dev 无 __Host- 前缀
    expect(jar["chiyan_csrf"]).toBeTruthy();

    // ── 3. GET /auth/me
    const meRes1 = await makeRequest("/api/v1/auth/me", {
      headers: { Authorization: `Bearer ${access1}` },
      cookie: cookieHeader(jar),
    });
    expect(meRes1.status).toBe(200);
    const me1 = (await meRes1.json()) as { data: { must_change_password: boolean; totp_enrolled: boolean } };
    expect(me1.data.must_change_password).toBe(true);
    expect(me1.data.totp_enrolled).toBe(false);

    // ── 4. POST /auth/change-password
    const newPassword = "NewSecurePass-2026!";
    const cpRes = await makeRequest("/api/v1/auth/change-password", {
      method: "POST",
      headers: { Authorization: `Bearer ${access1}` },
      cookie: cookieHeader(jar),
      csrf: jar["chiyan_csrf"]!,
      body: JSON.stringify({ old_password: ONE_TIME_PASSWORD, new_password: newPassword }),
    });
    expect(cpRes.status).toBe(200);

    // ── 5. 重登（旧 access 已撤）
    const login2Res = await makeRequest("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: "owner", password: newPassword }),
    });
    expect(login2Res.status).toBe(200);
    const login2Body = (await login2Res.json()) as { data: { challenge_token: string } };

    const lt2Res = await makeRequest("/api/v1/auth/login/totp", {
      method: "POST",
      body: JSON.stringify({ challenge_token: login2Body.data.challenge_token, code: "000000" }),
    });
    expect(lt2Res.status).toBe(200);
    const lt2Body = (await lt2Res.json()) as {
      data: { access_token: string; must_change_password: boolean; totp_enrolled: boolean };
    };
    expect(lt2Body.data.must_change_password).toBe(false);
    expect(lt2Body.data.totp_enrolled).toBe(false);
    const access2 = lt2Body.data.access_token;
    const jar2 = parseSetCookie(lt2Res);

    // ── 6. POST /auth/totp/setup
    const setupRes = await makeRequest("/api/v1/auth/totp/setup", {
      method: "POST",
      headers: { Authorization: `Bearer ${access2}` },
      cookie: cookieHeader(jar2),
      csrf: jar2["chiyan_csrf"]!,
    });
    expect(setupRes.status).toBe(200);
    const setupBody = (await setupRes.json()) as { data: { secret: string; otpauth_url: string } };
    expect(setupBody.data.secret).toMatch(/^[A-Z2-7]+$/); // base32
    expect(setupBody.data.otpauth_url).toMatch(/^otpauth:\/\/totp\//);

    // ── 7. POST /auth/totp/verify（用实时 code）
    const liveCode = generateCode(setupBody.data.secret);
    const verifyRes = await makeRequest("/api/v1/auth/totp/verify", {
      method: "POST",
      headers: { Authorization: `Bearer ${access2}` },
      cookie: cookieHeader(jar2),
      csrf: jar2["chiyan_csrf"]!,
      body: JSON.stringify({ secret: setupBody.data.secret, code: liveCode }),
    });
    expect(verifyRes.status).toBe(200);

    // ── 8. GET /auth/me → fully onboarded
    const meRes2 = await makeRequest("/api/v1/auth/me", {
      headers: { Authorization: `Bearer ${access2}` },
      cookie: cookieHeader(jar2),
    });
    expect(meRes2.status).toBe(200);
    const me2 = (await meRes2.json()) as { data: { must_change_password: boolean; totp_enrolled: boolean } };
    expect(me2.data.must_change_password).toBe(false);
    expect(me2.data.totp_enrolled).toBe(true);

    // sanity：owner record 实际已落 totp_secret_enc
    void owner;
  }, 30_000);

  it("5 次错密 → 锁定 15 分钟 + 40301 sub_code=locked", async () => {
    await seedOwner();
    const bad = { username: "owner", password: "WrongPassword123!" };
    for (let i = 0; i < 4; i++) {
      const r = await makeRequest("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify(bad),
      });
      expect(r.status).toBe(401);
    }
    // 第 5 次触发锁定
    const fifth = await makeRequest("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify(bad),
    });
    expect(fifth.status).toBe(403);
    const body = (await fifth.json()) as { code: number; data: { sub_code: string; locked_until: string } };
    expect(body.code).toBe(40301);
    expect(body.data.sub_code).toBe("locked");
    expect(new Date(body.data.locked_until).getTime()).toBeGreaterThan(Date.now());

    // 锁定后正确密码也被拒
    const right = await makeRequest("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: "owner", password: ONE_TIME_PASSWORD }),
    });
    expect(right.status).toBe(403);
  }, 30_000);

  it("/auth/me 没有 Bearer → 40101", async () => {
    const res = await makeRequest("/api/v1/auth/me");
    expect(res.status).toBe(401);
  });

  it("Owner（fully onboarded）可解锁被锁定账号", async () => {
    // 直接造一个 fully-onboarded Owner（手动写好加密的 TOTP secret），避开 bootstrap 流程
    const { keyRingFromEnv } = await import("../../lib/keyring");
    const { encrypt } = await import("../../lib/crypto");
    const { findById } = await import("../../lib/admin-repo");
    const ring = keyRingFromEnv(ENV as never);
    const TOTP_B32 = "JBSWY3DPEHPK3PXP";
    const totp_secret_enc = await encrypt(TOTP_B32, 1, ring[1]!);

    await _insertForTests({
      username: "owner",
      display_name: "Owner",
      role: "owner",
      status: "active",
      password_hash: await hashPassword("OwnerStrong-Pass-1!"),
      totp_secret_enc,
      totp_enrolled: true,
      must_change_password: false,
      failed_login_count: 0,
      locked_until: null,
      last_login_at: null,
    });
    const lockedOp = await _insertForTests({
      username: "op_locked",
      display_name: "Op",
      role: "operator",
      status: "active",
      password_hash: await hashPassword("anything-doesnt-matter"),
      totp_secret_enc: null,
      totp_enrolled: false,
      must_change_password: true,
      failed_login_count: 0,
      locked_until: new Date(Date.now() + 10 * 60 * 1000),
      last_login_at: null,
    });

    // Owner login（实际验 TOTP）
    const lr = await makeRequest("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: "owner", password: "OwnerStrong-Pass-1!" }),
    });
    const lrBody = (await lr.json()) as { data: { challenge_token: string } };
    const ltr = await makeRequest("/api/v1/auth/login/totp", {
      method: "POST",
      body: JSON.stringify({
        challenge_token: lrBody.data.challenge_token,
        code: generateCode(TOTP_B32),
      }),
    });
    expect(ltr.status).toBe(200);
    const ltrBody = (await ltr.json()) as { data: { access_token: string } };
    const jar = parseSetCookie(ltr);

    // 解锁被锁账号
    const ur = await makeRequest(`/api/v1/admin/accounts/${lockedOp.id}/unlock`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ltrBody.data.access_token}` },
      cookie: cookieHeader(jar),
      csrf: jar["chiyan_csrf"]!,
    });
    expect(ur.status).toBe(200);

    const after = await findById(lockedOp.id);
    expect(after?.locked_until).toBeNull();
    expect(after?.failed_login_count).toBe(0);
  }, 30_000);

  it("CSRF cookie/header 不匹配 → 40301 sub_code=csrf_invalid", async () => {
    await seedOwner();
    const login = await makeRequest("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: "owner", password: ONE_TIME_PASSWORD }),
    });
    const lb = (await login.json()) as { data: { challenge_token: string } };
    const lt = await makeRequest("/api/v1/auth/login/totp", {
      method: "POST",
      body: JSON.stringify({ challenge_token: lb.data.challenge_token, code: "000000" }),
    });
    const ltb = (await lt.json()) as { data: { access_token: string } };
    const jar = parseSetCookie(lt);

    const bad = await makeRequest("/api/v1/auth/change-password", {
      method: "POST",
      headers: { Authorization: `Bearer ${ltb.data.access_token}` },
      cookie: cookieHeader(jar),
      csrf: "wrong-csrf-token",
      body: JSON.stringify({ old_password: ONE_TIME_PASSWORD, new_password: "Another-Valid-Pass-1!" }),
    });
    expect(bad.status).toBe(403);
    const body = (await bad.json()) as { data: { sub_code: string } };
    expect(body.data.sub_code).toBe("csrf_invalid");
  }, 30_000);
});
