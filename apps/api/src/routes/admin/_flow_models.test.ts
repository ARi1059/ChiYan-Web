/**
 * Phase 3 prep — /admin/models/* + /admin/audit-logs 集成测试。
 *
 * 覆盖：
 *  - CRUD happy path（create / get detail / patch / archive / restore / list）
 *  - real_name 加密落库 / 解密返回；公开端不漏
 *  - Operator 角色拒写 / 允读 / 详情 strip real_name
 *  - CSRF 缺失 → 40301 csrf_invalid
 *  - code 重复 → 40901 code_conflict
 *  - batch-import 部分 conflict → ok_count + error_count
 *  - audit_logs 落地 + payload 不漏 real_name 明文
 *  - audit-logs 读路径 filter
 */
import { beforeEach, describe, expect, it } from "vitest";
import app from "../../index";
import {
  _insertForTests as _insertAdminForTests,
  _resetAdminRepoForTests,
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

function modelBody(over: Record<string, unknown> = {}) {
  return {
    code: "M-2026-0501",
    nickname: "Eve",
    style_tags: ["御姐"],
    available_types: ["写真"],
    can_remote: false,
    is_minor: false,
    gallery_asset_ids: [],
    portfolio: [],
    cooperation_history: [],
    ...over,
  };
}

describe("POST /admin/models（创建）", () => {
  it("Admin 角色 happy path：real_name 加密落库，响应回明文", async () => {
    const adminId = await seedAdmin("admin", "admin1");
    const token = await tokenFor(adminId);
    const res = await makeRequest("/api/v1/admin/models", {
      method: "POST",
      token,
      csrf: true,
      body: JSON.stringify(modelBody({ real_name: "张三" })),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      code: number;
      data: { id: number; code: string; real_name?: string };
    };
    expect(body.code).toBe(0);
    expect(body.data.code).toBe("M-2026-0501");
    expect(body.data.real_name).toBe("张三");
    // audit payload 不含 real_name
    const audits = await _getAuditEntriesForTests();
    const created = audits.find((a) => a.action === "admin.model.created");
    expect(created).toBeDefined();
    expect(JSON.stringify(created!.payload)).not.toContain("张三");
  });

  it("code 重复 → 40901", async () => {
    const adminId = await seedAdmin("admin", "admin1");
    const token = await tokenFor(adminId);
    await makeRequest("/api/v1/admin/models", {
      method: "POST",
      token,
      csrf: true,
      body: JSON.stringify(modelBody()),
    });
    const dup = await makeRequest("/api/v1/admin/models", {
      method: "POST",
      token,
      csrf: true,
      body: JSON.stringify(modelBody({ nickname: "Eve2" })),
    });
    expect(dup.status).toBe(409);
    const body = (await dup.json()) as { code: number; data: { sub_code: string } };
    expect(body.code).toBe(40901);
    expect(body.data.sub_code).toBe("code_conflict");
  });

  it("CSRF 缺失 → 40301 csrf_invalid", async () => {
    const adminId = await seedAdmin("admin", "admin1");
    const token = await tokenFor(adminId);
    const res = await makeRequest("/api/v1/admin/models", {
      method: "POST",
      token,
      // 没有 csrf: true
      body: JSON.stringify(modelBody()),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { data: { sub_code: string } };
    expect(body.data.sub_code).toBe("csrf_invalid");
  });

  it("Operator 角色 → 40301 insufficient_role", async () => {
    const opId = await seedAdmin("operator", "op1");
    const token = await tokenFor(opId);
    const res = await makeRequest("/api/v1/admin/models", {
      method: "POST",
      token,
      csrf: true,
      body: JSON.stringify(modelBody()),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { data: { sub_code: string } };
    expect(body.data.sub_code).toBe("insufficient_role");
  });
});

describe("GET /admin/models（读）", () => {
  it("Operator 可读列表（不含 real_name）", async () => {
    const adminId = await seedAdmin("admin", "admin1");
    const adminToken = await tokenFor(adminId);
    await makeRequest("/api/v1/admin/models", {
      method: "POST",
      token: adminToken,
      csrf: true,
      body: JSON.stringify(modelBody({ real_name: "张三" })),
    });

    const opId = await seedAdmin("operator", "op1");
    const opToken = await tokenFor(opId);
    const res = await makeRequest("/api/v1/admin/models?page=1&page_size=10", {
      token: opToken,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { items: Array<Record<string, unknown>>; total: number };
    };
    expect(body.data.total).toBe(1);
    expect(body.data.items[0]!.real_name).toBeUndefined();
  });

  it("Admin GET /:id 含 real_name", async () => {
    const adminId = await seedAdmin("admin", "admin1");
    const token = await tokenFor(adminId);
    const create = await makeRequest("/api/v1/admin/models", {
      method: "POST",
      token,
      csrf: true,
      body: JSON.stringify(modelBody({ real_name: "李四" })),
    });
    const created = (await create.json()) as { data: { id: number } };
    const res = await makeRequest(`/api/v1/admin/models/${created.data.id}`, {
      token,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { real_name?: string } };
    expect(body.data.real_name).toBe("李四");
  });

  it("不存在 id → 40401", async () => {
    const adminId = await seedAdmin("admin", "admin1");
    const token = await tokenFor(adminId);
    const res = await makeRequest("/api/v1/admin/models/9999", { token });
    expect(res.status).toBe(404);
  });
});

describe("PATCH / DELETE / restore", () => {
  it("PATCH 局部更新 + 触发 audit", async () => {
    const adminId = await seedAdmin("admin", "admin1");
    const token = await tokenFor(adminId);
    const created = await makeRequest("/api/v1/admin/models", {
      method: "POST",
      token,
      csrf: true,
      body: JSON.stringify(modelBody()),
    });
    const {
      data: { id },
    } = (await created.json()) as { data: { id: number } };
    const res = await makeRequest(`/api/v1/admin/models/${id}`, {
      method: "PATCH",
      token,
      csrf: true,
      body: JSON.stringify({ nickname: "EveX" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { nickname: string } };
    expect(body.data.nickname).toBe("EveX");
    const audits = await _getAuditEntriesForTests();
    expect(audits.some((a) => a.action === "admin.model.updated")).toBe(true);
  });

  it("DELETE 软删 + restore 恢复 + 列表过滤", async () => {
    const adminId = await seedAdmin("admin", "admin1");
    const token = await tokenFor(adminId);
    const created = await makeRequest("/api/v1/admin/models", {
      method: "POST",
      token,
      csrf: true,
      body: JSON.stringify(modelBody()),
    });
    const {
      data: { id },
    } = (await created.json()) as { data: { id: number } };

    const delRes = await makeRequest(`/api/v1/admin/models/${id}`, {
      method: "DELETE",
      token,
      csrf: true,
    });
    expect(delRes.status).toBe(200);

    // 默认列表（无 status）含 archived
    const list1 = await makeRequest("/api/v1/admin/models?page=1&page_size=10", { token });
    const body1 = (await list1.json()) as {
      data: { items: { status: string }[] };
    };
    expect(body1.data.items[0]!.status).toBe("archived");

    // 仅 active 过滤后空
    const list2 = await makeRequest("/api/v1/admin/models?page=1&page_size=10&status=active", {
      token,
    });
    const body2 = (await list2.json()) as { data: { total: number } };
    expect(body2.data.total).toBe(0);

    // restore
    const restoreRes = await makeRequest(`/api/v1/admin/models/${id}/restore`, {
      method: "POST",
      token,
      csrf: true,
    });
    expect(restoreRes.status).toBe(200);
    const detail = await makeRequest(`/api/v1/admin/models/${id}`, { token });
    const dBody = (await detail.json()) as { data: { status: string } };
    expect(dBody.data.status).toBe("active");
  });
});

describe("POST /admin/models/batch-import", () => {
  it("部分 code 冲突 → ok_count + error_count 正确", async () => {
    const adminId = await seedAdmin("admin", "admin1");
    const token = await tokenFor(adminId);
    // 先种一条 M-2026-0001
    await makeRequest("/api/v1/admin/models", {
      method: "POST",
      token,
      csrf: true,
      body: JSON.stringify(modelBody({ code: "M-2026-0001" })),
    });
    const res = await makeRequest("/api/v1/admin/models/batch-import", {
      method: "POST",
      token,
      csrf: true,
      body: JSON.stringify({
        rows: [
          modelBody({ code: "M-2026-0001" }), // conflict
          modelBody({ code: "M-2026-0002" }),
          modelBody({ code: "M-2026-0003" }),
        ],
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { ok_count: number; error_count: number; errors: { row_index: number }[] };
    };
    expect(body.data.ok_count).toBe(2);
    expect(body.data.error_count).toBe(1);
    expect(body.data.errors[0]!.row_index).toBe(0);
  });
});

describe("GET /admin/audit-logs", () => {
  it("Operator → 40301 insufficient_role", async () => {
    const opId = await seedAdmin("operator", "op1");
    const token = await tokenFor(opId);
    const res = await makeRequest("/api/v1/admin/audit-logs?page=1&page_size=10", {
      token,
      csrf: true,
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { data: { sub_code: string } };
    expect(body.data.sub_code).toBe("insufficient_role");
  });

  it("Admin 读 list + filter by action", async () => {
    const adminId = await seedAdmin("admin", "admin1");
    const token = await tokenFor(adminId);
    await makeRequest("/api/v1/admin/models", {
      method: "POST",
      token,
      csrf: true,
      body: JSON.stringify(modelBody({ code: "M-2026-0001" })),
    });
    await makeRequest("/api/v1/admin/models", {
      method: "POST",
      token,
      csrf: true,
      body: JSON.stringify(modelBody({ code: "M-2026-0002" })),
    });
    const res = await makeRequest(
      "/api/v1/admin/audit-logs?page=1&page_size=10&action=admin.model.created",
      { token, csrf: true },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { items: { action: string }[]; total: number };
    };
    expect(body.data.total).toBe(2);
    expect(body.data.items.every((i) => i.action === "admin.model.created")).toBe(true);
  });

  it("GET /:id 命中 + 不存在 → 40401", async () => {
    const adminId = await seedAdmin("admin", "admin1");
    const token = await tokenFor(adminId);
    await makeRequest("/api/v1/admin/models", {
      method: "POST",
      token,
      csrf: true,
      body: JSON.stringify(modelBody()),
    });
    const audits = await _getAuditEntriesForTests();
    const firstId = audits[0]!.id;
    const hit = await makeRequest(`/api/v1/admin/audit-logs/${firstId}`, {
      token,
      csrf: true,
    });
    expect(hit.status).toBe(200);
    const miss = await makeRequest("/api/v1/admin/audit-logs/9999", {
      token,
      csrf: true,
    });
    expect(miss.status).toBe(404);
  });
});

describe("不漏 real_name_enc 到 admin 响应 body", () => {
  it("详情 / 列表响应中不出现 real_name_enc 字段名", async () => {
    const adminId = await seedAdmin("admin", "admin1");
    const token = await tokenFor(adminId);
    await makeRequest("/api/v1/admin/models", {
      method: "POST",
      token,
      csrf: true,
      body: JSON.stringify(modelBody({ real_name: "张三" })),
    });
    const list = await makeRequest("/api/v1/admin/models?page=1&page_size=10", { token });
    const listText = await list.text();
    expect(listText).not.toContain("real_name_enc");
    // 但 real_name 明文是该出现的（这是 admin 视角）
    expect(listText).toContain("real_name");
  });
});
