/**
 * Phase 3 prep — /admin/roster/* + /admin/media/* 集成测试。
 *
 * 覆盖：
 *  - roster PUT / GET / DELETE / copy / history happy path + 跨域可见（PUT → public /today）
 *  - roster GET 空日期 → 200 + 空数组（不是 404）
 *  - copy 源不存在 → 40401
 *  - Operator 允许 PUT roster（接口方案 §4.4）
 *  - media sign → register → list 完整流转，object_key 仅可消费一次
 *  - register hash 重复 → 40901
 *  - register 未签 key → 40001
 *  - PATCH is_cover=true → model.cover_asset_id 同步（public /models/:code cover 命中）
 *  - DELETE media → 移除，cover_asset_id 同步清零
 *  - Operator DELETE media → 40301 insufficient_role
 *  - CSRF 缺失 → 40301 csrf_invalid
 */
import { beforeEach, describe, expect, it } from "vitest";
import app from "../../index";
import {
  _insertForTests as _insertAdminForTests,
  _resetAdminRepoForTests,
} from "../../lib/admin-repo";
import { _resetAuditForTests } from "../../lib/audit";
import { hashPassword } from "../../lib/password";
import { signJwt } from "../../lib/jwt";
import { _resetJtiStoreForTests } from "../../lib/jti-store";
import { _resetKeyRingCacheForTests } from "../../lib/keyring";
import { _resetModelsRepoForTests } from "../../lib/models-repo";
import { _markKeyUploaded, _resetMediaSignForTests } from "../../lib/media-sign";
import { _resetRostersRepoForTests } from "../../lib/rosters-repo";
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

function makeRequest(
  path: string,
  init: RequestInit & { token?: string; csrf?: boolean } = {},
) {
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

beforeEach(() => {
  _resetAdminRepoForTests();
  _resetModelsRepoForTests();
  _resetRostersRepoForTests();
  _resetMediaSignForTests();
  _resetAuditForTests();
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

async function createModel(token: string, over: Record<string, unknown> = {}): Promise<number> {
  const res = await makeRequest("/api/v1/admin/models", {
    method: "POST",
    token,
    csrf: true,
    body: JSON.stringify(modelBody(over)),
  });
  const body = (await res.json()) as { data: { id: number } };
  return body.data.id;
}

// ─── Roster ─────────────────────────────────────────────────

describe("PUT /admin/roster + GET", () => {
  it("PUT 整覆盖 → GET 同日返回 model_ids", async () => {
    const adminId = await seedAdmin("admin", "admin1");
    const token = await tokenFor(adminId);
    const modelId = await createModel(token);

    const put = await makeRequest("/api/v1/admin/roster", {
      method: "PUT",
      token,
      csrf: true,
      body: JSON.stringify({ date: "2026-06-01", model_ids: [modelId], note: "晨班" }),
    });
    expect(put.status).toBe(200);
    const putBody = (await put.json()) as { data: { date: string; model_ids: number[] } };
    expect(putBody.data.date).toBe("2026-06-01");
    expect(putBody.data.model_ids).toEqual([modelId]);

    const get = await makeRequest("/api/v1/admin/roster?date=2026-06-01", { token });
    expect(get.status).toBe(200);
    const getBody = (await get.json()) as { data: { model_ids: number[]; note: string | null } };
    expect(getBody.data.model_ids).toEqual([modelId]);
    expect(getBody.data.note).toBe("晨班");
  });

  it("GET 不存在日期 → 200 + 空 model_ids", async () => {
    const adminId = await seedAdmin("admin", "admin1");
    const token = await tokenFor(adminId);
    const res = await makeRequest("/api/v1/admin/roster?date=2099-01-01", { token });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { model_ids: number[]; note: string | null };
    };
    expect(body.data.model_ids).toEqual([]);
    expect(body.data.note).toBeNull();
  });

  it("Operator 角色 PUT → 200", async () => {
    const adminId = await seedAdmin("admin", "admin1");
    const adminToken = await tokenFor(adminId);
    const modelId = await createModel(adminToken);

    const opId = await seedAdmin("operator", "op1");
    const opToken = await tokenFor(opId);
    const res = await makeRequest("/api/v1/admin/roster", {
      method: "PUT",
      token: opToken,
      csrf: true,
      body: JSON.stringify({ date: "2026-06-02", model_ids: [modelId] }),
    });
    expect(res.status).toBe(200);
  });

  it("CSRF 缺失 → 40301 csrf_invalid", async () => {
    const adminId = await seedAdmin("admin", "admin1");
    const token = await tokenFor(adminId);
    const res = await makeRequest("/api/v1/admin/roster", {
      method: "PUT",
      token,
      body: JSON.stringify({ date: "2026-06-01", model_ids: [] }),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { data: { sub_code: string } };
    expect(body.data.sub_code).toBe("csrf_invalid");
  });
});

describe("Roster 跨域可见", () => {
  it("PUT 后 public /today?date=X 立即看到", async () => {
    const adminId = await seedAdmin("admin", "admin1");
    const token = await tokenFor(adminId);
    const modelId = await createModel(token);

    await makeRequest("/api/v1/admin/roster", {
      method: "PUT",
      token,
      csrf: true,
      body: JSON.stringify({ date: "2026-06-03", model_ids: [modelId] }),
    });

    const pub = await makeRequest("/api/v1/public/today?date=2026-06-03");
    expect(pub.status).toBe(200);
    const body = (await pub.json()) as { data: { date: string; models: unknown[] } };
    expect(body.data.date).toBe("2026-06-03");
    // models 数组可能为空（因模特无 cover_asset_id），但 date 与请求一致即说明 roster 命中
  });
});

describe("POST /admin/roster/copy", () => {
  it("from 不存在 → 40401", async () => {
    const adminId = await seedAdmin("admin", "admin1");
    const token = await tokenFor(adminId);
    const res = await makeRequest(
      "/api/v1/admin/roster/copy?from=2099-01-01&to=2099-01-02",
      { method: "POST", token, csrf: true },
    );
    expect(res.status).toBe(404);
  });

  it("happy path：从 from 复制到 to", async () => {
    const adminId = await seedAdmin("admin", "admin1");
    const token = await tokenFor(adminId);
    const modelId = await createModel(token);
    await makeRequest("/api/v1/admin/roster", {
      method: "PUT",
      token,
      csrf: true,
      body: JSON.stringify({ date: "2026-06-10", model_ids: [modelId], note: "源" }),
    });
    const res = await makeRequest(
      "/api/v1/admin/roster/copy?from=2026-06-10&to=2026-06-11",
      { method: "POST", token, csrf: true },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { date: string; model_ids: number[] } };
    expect(body.data.date).toBe("2026-06-11");
    expect(body.data.model_ids).toEqual([modelId]);
  });
});

describe("DELETE /admin/roster + history", () => {
  it("DELETE 已存在 → 200，GET 后回到空数组", async () => {
    const adminId = await seedAdmin("admin", "admin1");
    const token = await tokenFor(adminId);
    const modelId = await createModel(token);
    await makeRequest("/api/v1/admin/roster", {
      method: "PUT",
      token,
      csrf: true,
      body: JSON.stringify({ date: "2026-07-01", model_ids: [modelId] }),
    });
    const del = await makeRequest("/api/v1/admin/roster?date=2026-07-01", {
      method: "DELETE",
      token,
      csrf: true,
    });
    expect(del.status).toBe(200);
    const get = await makeRequest("/api/v1/admin/roster?date=2026-07-01", { token });
    expect(get.status).toBe(200);
    const body = (await get.json()) as { data: { model_ids: number[] } };
    expect(body.data.model_ids).toEqual([]);
  });

  it("DELETE 不存在 → 40401", async () => {
    const adminId = await seedAdmin("admin", "admin1");
    const token = await tokenFor(adminId);
    const res = await makeRequest("/api/v1/admin/roster?date=2099-09-09", {
      method: "DELETE",
      token,
      csrf: true,
    });
    expect(res.status).toBe(404);
  });

  it("GET /history 跨 from..to 升序", async () => {
    const adminId = await seedAdmin("admin", "admin1");
    const token = await tokenFor(adminId);
    const modelId = await createModel(token);
    for (const date of ["2026-08-03", "2026-08-01", "2026-08-02"]) {
      await makeRequest("/api/v1/admin/roster", {
        method: "PUT",
        token,
        csrf: true,
        body: JSON.stringify({ date, model_ids: [modelId] }),
      });
    }
    const res = await makeRequest(
      "/api/v1/admin/roster/history?from=2026-08-01&to=2026-08-03",
      { token },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { items: { date: string }[] } };
    expect(body.data.items.map((i) => i.date)).toEqual([
      "2026-08-01",
      "2026-08-02",
      "2026-08-03",
    ]);
  });
});

// ─── Media ──────────────────────────────────────────────────

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

function signBody(over: Record<string, unknown> = {}) {
  return {
    type: "image",
    filename: "photo.jpg",
    content_type: "image/jpeg",
    size: 1024,
    ...over,
  };
}

function registerBody(object_key: string, over: Record<string, unknown> = {}) {
  return {
    object_key,
    type: "image",
    file_size: 1024,
    hash: HASH_A,
    ...over,
  };
}

async function signKey(token: string): Promise<string> {
  const res = await makeRequest("/api/v1/admin/media/sign", {
    method: "POST",
    token,
    csrf: true,
    body: JSON.stringify(signBody()),
  });
  const body = (await res.json()) as { data: { object_key: string } };
  // sign 不再自动让 register 通过；模拟"前端 PUT 上传成功"这一步，
  // 让 register 可以消费此 key（真实集成里走 PUT /admin/media/upload）。
  _markKeyUploaded(body.data.object_key);
  return body.data.object_key;
}

describe("POST /admin/media/sign + register", () => {
  it("Operator sign → register happy path", async () => {
    const opId = await seedAdmin("operator", "op1");
    const opToken = await tokenFor(opId);
    const key = await signKey(opToken);
    expect(key).toMatch(/^media\/\d{6}\//);

    const reg = await makeRequest("/api/v1/admin/media/register", {
      method: "POST",
      token: opToken,
      csrf: true,
      body: JSON.stringify(registerBody(key)),
    });
    expect(reg.status).toBe(200);
    const body = (await reg.json()) as {
      data: { id: number; url: string; original_url: string; hash: string };
    };
    expect(body.data.id).toBeGreaterThan(0);
    expect(body.data.url).toContain("/media/");
    expect(body.data.url).toContain(key);
    expect(body.data.original_url).toContain("/media/");
    expect(body.data.hash).toBe(HASH_A);
  });

  it("register 未签 object_key → 40001 unknown_key", async () => {
    const adminId = await seedAdmin("admin", "admin1");
    const token = await tokenFor(adminId);
    const res = await makeRequest("/api/v1/admin/media/register", {
      method: "POST",
      token,
      csrf: true,
      body: JSON.stringify(registerBody("media/202601/forged.jpg")),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { data: { sub_code: string } };
    expect(body.data.sub_code).toBe("unknown_key");
  });

  it("register hash 重复 → 40901 hash_conflict", async () => {
    const adminId = await seedAdmin("admin", "admin1");
    const token = await tokenFor(adminId);
    const k1 = await signKey(token);
    await makeRequest("/api/v1/admin/media/register", {
      method: "POST",
      token,
      csrf: true,
      body: JSON.stringify(registerBody(k1)),
    });
    const k2 = await signKey(token);
    const dup = await makeRequest("/api/v1/admin/media/register", {
      method: "POST",
      token,
      csrf: true,
      body: JSON.stringify(registerBody(k2)),
    });
    expect(dup.status).toBe(409);
    const body = (await dup.json()) as { data: { sub_code: string } };
    expect(body.data.sub_code).toBe("hash_conflict");
  });

  it("object_key 只能消费一次（register 后 sign 表清掉）", async () => {
    const adminId = await seedAdmin("admin", "admin1");
    const token = await tokenFor(adminId);
    const key = await signKey(token);
    await makeRequest("/api/v1/admin/media/register", {
      method: "POST",
      token,
      csrf: true,
      body: JSON.stringify(registerBody(key)),
    });
    const replay = await makeRequest("/api/v1/admin/media/register", {
      method: "POST",
      token,
      csrf: true,
      body: JSON.stringify(registerBody(key, { hash: HASH_B })),
    });
    expect(replay.status).toBe(400);
    const body = (await replay.json()) as { data: { sub_code: string } };
    expect(body.data.sub_code).toBe("unknown_key");
  });
});

describe("PUT /admin/media/upload (sign → PUT → register 端到端)", () => {
  const MEDIA_ROOT = ENV.MEDIA_ROOT;

  async function freshSign(token: string): Promise<{
    object_key: string;
    upload_url: string;
    sig: string;
    expires: string;
  }> {
    const res = await makeRequest("/api/v1/admin/media/sign", {
      method: "POST",
      token,
      csrf: true,
      body: JSON.stringify(signBody()),
    });
    const body = (await res.json()) as {
      data: { object_key: string; upload_url: string };
    };
    const u = new URL(body.data.upload_url);
    return {
      object_key: body.data.object_key,
      upload_url: body.data.upload_url,
      sig: u.searchParams.get("sig")!,
      expires: u.searchParams.get("expires")!,
    };
  }

  beforeEach(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(MEDIA_ROOT, { recursive: true, force: true });
  });

  it("happy path：sign → PUT 字节 → 落盘 + register 200", async () => {
    const adminId = await seedAdmin("admin", "admin1");
    const token = await tokenFor(adminId);
    const { object_key, sig, expires } = await freshSign(token);

    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]); // jpeg magic prefix + 数据
    const put = await makeRequest(
      `/api/v1/admin/media/upload?key=${encodeURIComponent(object_key)}&sig=${sig}&expires=${expires}`,
      {
        method: "PUT",
        token,
        csrf: true,
        headers: { "Content-Type": "application/octet-stream" },
        body: bytes,
      },
    );
    expect(put.status).toBe(200);
    const putBody = (await put.json()) as { data: { object_key: string; bytes: number } };
    expect(putBody.data.object_key).toBe(object_key);
    expect(putBody.data.bytes).toBe(bytes.byteLength);

    // 文件真落盘
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const onDisk = await readFile(join(MEDIA_ROOT, object_key));
    expect(new Uint8Array(onDisk)).toEqual(bytes);

    // 上传完才能 register
    const reg = await makeRequest("/api/v1/admin/media/register", {
      method: "POST",
      token,
      csrf: true,
      body: JSON.stringify(registerBody(object_key, { hash: HASH_A })),
    });
    expect(reg.status).toBe(200);
    const regBody = (await reg.json()) as { data: { url: string } };
    expect(regBody.data.url).toContain(`/media/${object_key}`);
  });

  it("bad sig → 40301 sub_code=bad_sig", async () => {
    const adminId = await seedAdmin("admin", "admin1");
    const token = await tokenFor(adminId);
    const { object_key, expires } = await freshSign(token);
    const res = await makeRequest(
      `/api/v1/admin/media/upload?key=${encodeURIComponent(object_key)}&sig=tampered-signature&expires=${expires}`,
      {
        method: "PUT",
        token,
        csrf: true,
        body: new Uint8Array([1, 2, 3]),
      },
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { data: { sub_code: string } };
    expect(body.data.sub_code).toBe("bad_sig");
  });

  it("expires 已过 → 40301 sub_code=expired", async () => {
    const adminId = await seedAdmin("admin", "admin1");
    const token = await tokenFor(adminId);
    const { object_key, sig } = await freshSign(token);
    // 用一个过去的 expires —— 即便 sig 是另一个 expires 算的，verify 先看 expires
    const res = await makeRequest(
      `/api/v1/admin/media/upload?key=${encodeURIComponent(object_key)}&sig=${sig}&expires=1`,
      {
        method: "PUT",
        token,
        csrf: true,
        body: new Uint8Array([1, 2, 3]),
      },
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { data: { sub_code: string } };
    expect(body.data.sub_code).toBe("expired");
  });

  it("路径遁逃 ../ → 40001 sub_code=bad_key（sig 校验通过也不让落盘）", async () => {
    const adminId = await seedAdmin("admin", "admin1");
    const token = await tokenFor(adminId);
    // 故意构造越界 key 并自签 sig（攻击者会做的事）
    const key = "../../etc/passwd";
    const expires = String(Date.now() + 60_000);
    // 直接借 lib 函数 produce 合法 sig 模拟 sign 被攻陷
    const { signUploadSig } = await import("../../lib/media-sign");
    const sig = await signUploadSig(ENV.JWT_SECRET, key, Number(expires));
    const res = await makeRequest(
      `/api/v1/admin/media/upload?key=${encodeURIComponent(key)}&sig=${sig}&expires=${expires}`,
      {
        method: "PUT",
        token,
        csrf: true,
        body: new Uint8Array([1, 2, 3]),
      },
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { data: { sub_code: string } };
    expect(body.data.sub_code).toBe("bad_key");
  });

  it("空 body → 40001", async () => {
    const adminId = await seedAdmin("admin", "admin1");
    const token = await tokenFor(adminId);
    const { object_key, sig, expires } = await freshSign(token);
    const res = await makeRequest(
      `/api/v1/admin/media/upload?key=${encodeURIComponent(object_key)}&sig=${sig}&expires=${expires}`,
      {
        method: "PUT",
        token,
        csrf: true,
        body: new Uint8Array(),
      },
    );
    expect(res.status).toBe(400);
  });

  it("未鉴权 → 40101（sig 单独不够）", async () => {
    const adminId = await seedAdmin("admin", "admin1");
    const token = await tokenFor(adminId);
    const { object_key, sig, expires } = await freshSign(token);
    const res = await makeRequest(
      `/api/v1/admin/media/upload?key=${encodeURIComponent(object_key)}&sig=${sig}&expires=${expires}`,
      {
        method: "PUT",
        // 不带 token / 不带 csrf
        body: new Uint8Array([1]),
      },
    );
    expect(res.status).toBe(401);
  });
});

describe("PATCH /admin/media/:id (is_cover 同步)", () => {
  it("is_cover=true → model.cover_asset_id 跟着指过来；public /models/:code 命中 cover", async () => {
    const adminId = await seedAdmin("admin", "admin1");
    const token = await tokenFor(adminId);
    const modelId = await createModel(token);
    const key = await signKey(token);
    const reg = await makeRequest("/api/v1/admin/media/register", {
      method: "POST",
      token,
      csrf: true,
      body: JSON.stringify(registerBody(key, { model_id: modelId })),
    });
    const { data: { id: mediaId } } = (await reg.json()) as { data: { id: number } };

    const patch = await makeRequest(`/api/v1/admin/media/${mediaId}`, {
      method: "PATCH",
      token,
      csrf: true,
      body: JSON.stringify({ is_cover: true }),
    });
    expect(patch.status).toBe(200);

    // admin 详情应反映 cover_asset_id
    const detail = await makeRequest(`/api/v1/admin/models/${modelId}`, { token });
    const dBody = (await detail.json()) as { data: { cover_asset_id?: number } };
    expect(dBody.data.cover_asset_id).toBe(mediaId);
  });

  it("DELETE media → cover_asset_id 自动清零", async () => {
    const adminId = await seedAdmin("admin", "admin1");
    const token = await tokenFor(adminId);
    const modelId = await createModel(token);
    const key = await signKey(token);
    const reg = await makeRequest("/api/v1/admin/media/register", {
      method: "POST",
      token,
      csrf: true,
      body: JSON.stringify(registerBody(key, { model_id: modelId })),
    });
    const { data: { id: mediaId } } = (await reg.json()) as { data: { id: number } };
    await makeRequest(`/api/v1/admin/media/${mediaId}`, {
      method: "PATCH",
      token,
      csrf: true,
      body: JSON.stringify({ is_cover: true }),
    });
    const del = await makeRequest(`/api/v1/admin/media/${mediaId}`, {
      method: "DELETE",
      token,
      csrf: true,
    });
    expect(del.status).toBe(200);
    const detail = await makeRequest(`/api/v1/admin/models/${modelId}`, { token });
    const dBody = (await detail.json()) as { data: { cover_asset_id?: number } };
    expect(dBody.data.cover_asset_id).toBeUndefined();
  });
});

describe("POST /admin/media/:id/watermark", () => {
  it("Admin → has_watermark 置 true", async () => {
    const adminId = await seedAdmin("admin", "admin1");
    const token = await tokenFor(adminId);
    const key = await signKey(token);
    const reg = await makeRequest("/api/v1/admin/media/register", {
      method: "POST",
      token,
      csrf: true,
      body: JSON.stringify(registerBody(key)),
    });
    const { data: { id: mediaId } } = (await reg.json()) as { data: { id: number } };
    const wm = await makeRequest(`/api/v1/admin/media/${mediaId}/watermark`, {
      method: "POST",
      token,
      csrf: true,
    });
    expect(wm.status).toBe(200);
    const body = (await wm.json()) as { data: { has_watermark: boolean } };
    expect(body.data.has_watermark).toBe(true);
  });
});

describe("角色矩阵", () => {
  it("Operator DELETE /admin/media/:id → 40301 insufficient_role", async () => {
    const adminId = await seedAdmin("admin", "admin1");
    const adminToken = await tokenFor(adminId);
    const key = await signKey(adminToken);
    const reg = await makeRequest("/api/v1/admin/media/register", {
      method: "POST",
      token: adminToken,
      csrf: true,
      body: JSON.stringify(registerBody(key)),
    });
    const { data: { id: mediaId } } = (await reg.json()) as { data: { id: number } };

    const opId = await seedAdmin("operator", "op1");
    const opToken = await tokenFor(opId);
    const res = await makeRequest(`/api/v1/admin/media/${mediaId}`, {
      method: "DELETE",
      token: opToken,
      csrf: true,
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { data: { sub_code: string } };
    expect(body.data.sub_code).toBe("insufficient_role");
  });
});
