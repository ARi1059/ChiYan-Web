/**
 * Phase 3 prep — /admin/accounts/* 集成测试（Owner-only 全 CRUD）。
 *
 * 覆盖：
 *  - POST 新建：响应含 one_time_password（20 字符）+ account.must_change_password=true
 *  - 同 username 重复 → 40901 username_conflict
 *  - audit payload 不含 one_time_password 明文（sanitize 兜底）
 *  - Admin 角色调 POST → 40301 insufficient_role（owner-only）
 *  - PATCH /:id：display_name 改成功；尝试改自己 role/status=disabled → 40001 self_lock
 *  - DELETE /:id：disable 成功；尝试 disable 自己 → 40001 self_lock
 *  - POST /:id/reset-password：新 oneTime ≠ 老 oneTime；密码 history 有两条
 *  - POST 自己 reset-password → 40001 self_reset
 *  - POST /:id/reset-2fa：totp_enrolled=false + totp_secret_enc=null
 *  - POST /:id/unlock 仍工作（regression 保护 Phase 1）
 *  - GET / 列表不含 password_hash / totp_secret_enc 字段名
 */
import { beforeEach, describe, expect, it } from "vitest";
import app from "../../index";
import {
  _insertForTests as _insertAdminForTests,
  _resetAdminRepoForTests,
  findById,
  getPasswordHistory,
  lockAccount,
} from "../../lib/admin-repo";
import { _getAuditEntriesForTests, _resetAuditForTests } from "../../lib/audit";
import { hashPassword } from "../../lib/password";
import { signJwt } from "../../lib/jwt";
import { _resetJtiStoreForTests } from "../../lib/jti-store";
import { _resetKeyRingCacheForTests } from "../../lib/keyring";
import { _resetModelsRepoForTests } from "../../lib/models-repo";
import { _resetRateLimitForTests } from "../../middleware/rate-limit";
import type { AdminRole } from "@chiyan/types";

const ENV = {
  ENV: "dev" as const,
  ALLOWED_ORIGINS: '["http://localhost:5173"]',
  DATABASE_URL: "postgres://test",
  REDIS_URL: "redis://127.0.0.1:6379/0",
  MEDIA_ROOT: "/tmp/chiyan-test-media",
  API_PUBLIC_URL: "http://localhost:3000",
  JWT_SECRET: "test-jwt-secret-at-least-32-bytes-long-padding-padding",
  ENC_KEY_V1: btoa(String.fromCharCode(...new Uint8Array(32).fill(7))),
};

const CSRF = "test-csrf-token-fixed";

async function seedAdmin(role: AdminRole, username: string): Promise<number> {
  const rec = await _insertAdminForTests({
    username,
    display_name: `${role}-${username}`,
    role,
    status: "active",
    password_hash: await hashPassword("Whatever-1!"),
    totp_secret_enc: new Uint8Array([1, 1, 1]),
    totp_enrolled: true,
    must_change_password: false,
    failed_login_count: 0,
    locked_until: null,
    last_login_at: null,
  });
  return rec.id;
}

async function tokenFor(adminId: number): Promise<string> {
  return signJwt(
    { sub: String(adminId), jti: `jti-${adminId}-${Date.now()}`, kind: "access", ttlSec: 3600 },
    ENV.JWT_SECRET,
  );
}

function makeRequest(path: string, init: RequestInit & { token?: string; csrf?: boolean } = {}) {
  const headers = new Headers(init.headers);
  headers.set("CF-Connecting-IP", "203.0.113.42");
  headers.set("User-Agent", "vitest");
  if (init.token) headers.set("Authorization", `Bearer ${init.token}`);
  if (init.csrf) {
    headers.set("X-CSRF-Token", CSRF);
    headers.set("Cookie", `chiyan_csrf=${CSRF}`);
  }
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return app.request(path, { ...init, headers }, ENV);
}

beforeEach(async () => {
  await _resetAdminRepoForTests();
  await _resetModelsRepoForTests();
  await _resetAuditForTests();
  _resetJtiStoreForTests();
  _resetKeyRingCacheForTests();
  _resetRateLimitForTests();
});

describe("POST /admin/accounts 新建", () => {
  it("Owner 新建 happy path：响应含 one_time_password + must_change_password=true", async () => {
    const ownerId = await seedAdmin("owner", "owner1");
    const token = await tokenFor(ownerId);
    const res = await makeRequest("/api/v1/admin/accounts", {
      method: "POST",
      token,
      csrf: true,
      body: JSON.stringify({ username: "newop", display_name: "新员工", role: "operator" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: {
        account: { id: number; username: string; must_change_password: boolean; role: string };
        one_time_password: string;
      };
    };
    expect(body.data.account.username).toBe("newop");
    expect(body.data.account.role).toBe("operator");
    expect(body.data.account.must_change_password).toBe(true);
    expect(body.data.one_time_password).toMatch(/^[A-Za-z0-9_-]{20}$/);
  });

  it("audit payload 不含 one_time_password 明文（sanitize 兜底）", async () => {
    const ownerId = await seedAdmin("owner", "owner1");
    const token = await tokenFor(ownerId);
    const res = await makeRequest("/api/v1/admin/accounts", {
      method: "POST",
      token,
      csrf: true,
      body: JSON.stringify({ username: "newop", display_name: "新员工", role: "admin" }),
    });
    const body = (await res.json()) as { data: { one_time_password: string } };
    const oneTime = body.data.one_time_password;
    const audits = await _getAuditEntriesForTests();
    const created = audits.find((a) => a.action === "admin.account.created");
    expect(created).toBeDefined();
    expect(JSON.stringify(created!.payload)).not.toContain(oneTime);
  });

  it("username 重复 → 40901 username_conflict", async () => {
    const ownerId = await seedAdmin("owner", "owner1");
    const token = await tokenFor(ownerId);
    await makeRequest("/api/v1/admin/accounts", {
      method: "POST",
      token,
      csrf: true,
      body: JSON.stringify({ username: "dup", display_name: "X", role: "operator" }),
    });
    const dup = await makeRequest("/api/v1/admin/accounts", {
      method: "POST",
      token,
      csrf: true,
      body: JSON.stringify({ username: "dup", display_name: "Y", role: "operator" }),
    });
    expect(dup.status).toBe(409);
    const body = (await dup.json()) as { data: { sub_code: string } };
    expect(body.data.sub_code).toBe("username_conflict");
  });

  it("Admin 角色 → 40301 insufficient_role（owner-only）", async () => {
    const adminId = await seedAdmin("admin", "admin1");
    const token = await tokenFor(adminId);
    const res = await makeRequest("/api/v1/admin/accounts", {
      method: "POST",
      token,
      csrf: true,
      body: JSON.stringify({ username: "newop", display_name: "X", role: "operator" }),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { data: { sub_code: string } };
    expect(body.data.sub_code).toBe("insufficient_role");
  });
});

describe("GET /admin/accounts 列表", () => {
  it("不含 password_hash / totp_secret_enc 字段", async () => {
    const ownerId = await seedAdmin("owner", "owner1");
    const token = await tokenFor(ownerId);
    const res = await makeRequest("/api/v1/admin/accounts?page=1&page_size=10", {
      token,
      csrf: true,
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain("password_hash");
    expect(text).not.toContain("totp_secret_enc");
  });
});

describe("PATCH /admin/accounts/:id", () => {
  it("改 display_name 成功 + audit", async () => {
    const ownerId = await seedAdmin("owner", "owner1");
    const targetId = await seedAdmin("operator", "op1");
    const token = await tokenFor(ownerId);
    const res = await makeRequest(`/api/v1/admin/accounts/${targetId}`, {
      method: "PATCH",
      token,
      csrf: true,
      body: JSON.stringify({ display_name: "改名了" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { display_name: string } };
    expect(body.data.display_name).toBe("改名了");
    const audits = await _getAuditEntriesForTests();
    expect(audits.some((a) => a.action === "admin.account.updated")).toBe(true);
  });

  it("尝试改自己 role → 40001 self_lock", async () => {
    const ownerId = await seedAdmin("owner", "owner1");
    const token = await tokenFor(ownerId);
    const res = await makeRequest(`/api/v1/admin/accounts/${ownerId}`, {
      method: "PATCH",
      token,
      csrf: true,
      body: JSON.stringify({ role: "operator" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { data: { sub_code: string } };
    expect(body.data.sub_code).toBe("self_lock");
  });

  it("尝试禁用自己 → 40001 self_lock", async () => {
    const ownerId = await seedAdmin("owner", "owner1");
    const token = await tokenFor(ownerId);
    const res = await makeRequest(`/api/v1/admin/accounts/${ownerId}`, {
      method: "PATCH",
      token,
      csrf: true,
      body: JSON.stringify({ status: "disabled" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { data: { sub_code: string } };
    expect(body.data.sub_code).toBe("self_lock");
  });
});

describe("DELETE /admin/accounts/:id", () => {
  it("disable 成功 + 防自禁", async () => {
    const ownerId = await seedAdmin("owner", "owner1");
    const targetId = await seedAdmin("operator", "op1");
    const token = await tokenFor(ownerId);

    const self = await makeRequest(`/api/v1/admin/accounts/${ownerId}`, {
      method: "DELETE",
      token,
      csrf: true,
    });
    expect(self.status).toBe(400);

    const ok = await makeRequest(`/api/v1/admin/accounts/${targetId}`, {
      method: "DELETE",
      token,
      csrf: true,
    });
    expect(ok.status).toBe(200);
    const after = await findById(targetId);
    expect(after?.status).toBe("disabled");
  });
});

describe("POST /admin/accounts/:id/reset-password", () => {
  it("新 oneTime 与历史不同 + history 至少 2 条", async () => {
    const ownerId = await seedAdmin("owner", "owner1");
    const token = await tokenFor(ownerId);
    const create = await makeRequest("/api/v1/admin/accounts", {
      method: "POST",
      token,
      csrf: true,
      body: JSON.stringify({ username: "newop", display_name: "X", role: "operator" }),
    });
    const cBody = (await create.json()) as {
      data: { account: { id: number }; one_time_password: string };
    };
    const targetId = cBody.data.account.id;
    const firstOneTime = cBody.data.one_time_password;

    const reset = await makeRequest(`/api/v1/admin/accounts/${targetId}/reset-password`, {
      method: "POST",
      token,
      csrf: true,
    });
    expect(reset.status).toBe(200);
    const rBody = (await reset.json()) as { data: { one_time_password: string } };
    expect(rBody.data.one_time_password).not.toBe(firstOneTime);
    const hist = await getPasswordHistory(targetId, 5);
    expect(hist.length).toBeGreaterThanOrEqual(2);
  });

  it("重置自己 → 40001 self_reset", async () => {
    const ownerId = await seedAdmin("owner", "owner1");
    const token = await tokenFor(ownerId);
    const res = await makeRequest(`/api/v1/admin/accounts/${ownerId}/reset-password`, {
      method: "POST",
      token,
      csrf: true,
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { data: { sub_code: string } };
    expect(body.data.sub_code).toBe("self_reset");
  });
});

describe("POST /admin/accounts/:id/reset-2fa", () => {
  it("totp_enrolled=false + totp_secret_enc=null", async () => {
    const ownerId = await seedAdmin("owner", "owner1");
    const targetId = await seedAdmin("operator", "op1");
    const token = await tokenFor(ownerId);
    const res = await makeRequest(`/api/v1/admin/accounts/${targetId}/reset-2fa`, {
      method: "POST",
      token,
      csrf: true,
    });
    expect(res.status).toBe(200);
    const after = await findById(targetId);
    expect(after?.totp_enrolled).toBe(false);
    expect(after?.totp_secret_enc).toBeNull();
  });
});

describe("POST /admin/accounts/:id/unlock (Phase 1 regression)", () => {
  it("已锁账号 → unlock 后 locked_until=null + failed_login_count=0", async () => {
    const ownerId = await seedAdmin("owner", "owner1");
    const targetId = await seedAdmin("operator", "op1");
    await lockAccount(targetId, new Date(Date.now() + 60_000));
    const token = await tokenFor(ownerId);
    const res = await makeRequest(`/api/v1/admin/accounts/${targetId}/unlock`, {
      method: "POST",
      token,
      csrf: true,
    });
    expect(res.status).toBe(200);
    const after = await findById(targetId);
    expect(after?.locked_until).toBeNull();
    expect(after?.failed_login_count).toBe(0);
  });
});
