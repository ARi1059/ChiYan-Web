/**
 * /admin/stats — 数据看板聚合集成测试（接口方案 §4.10，owner + admin）。
 *
 * 覆盖：
 *  - 角色门：operator → 40301 insufficient_role；admin / owner → 200
 *  - PV/UV：今日访问总数 = pv；distinct ip_hash = uv（ip_hash 为空不计 uv）
 *  - 今日在班：daily_roster(今日).model_ids 数
 *  - 模特计数：active / archived / 待补资料（缺封面或画廊为空）
 *  - 热度榜：近 7 天按 model_id 聚合降序 + nickname 回填
 *
 * 口径与 routes/admin/stats.ts 一致：今日 = UTC 当天（recordVisit 默认 now() 落在窗口内）。
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
import {
  _insertModelForTests,
  _resetModelsRepoForTests,
  type ModelRecord,
} from "../../lib/models-repo";
import { _resetRateLimitForTests } from "../../middleware/rate-limit";
import { upsertRoster } from "../../lib/rosters-repo";
import { recordVisit, _resetVisitsRepoForTests } from "../../lib/visits-repo";
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

function getStats(token: string) {
  const headers = new Headers();
  headers.set("CF-Connecting-IP", "203.0.113.42");
  headers.set("User-Agent", "vitest");
  headers.set("Authorization", `Bearer ${token}`);
  return app.request("/api/v1/admin/stats", { headers }, ENV);
}

type ModelSeed = Omit<ModelRecord, "id" | "created_at" | "updated_at">;
function makeModel(code: string, nickname: string, over: Partial<ModelSeed> = {}): ModelSeed {
  return {
    code,
    nickname,
    status: "active",
    height_cm: null,
    weight_kg: null,
    bust: null,
    waist: null,
    hip: null,
    shoe_size_eu: null,
    age_range: null,
    age: null,
    hometown: null,
    city: null,
    district: null,
    qq: null,
    style_tags: [],
    available_types: [],
    can_remote: false,
    is_minor: false,
    cover_asset_id: null,
    gallery_asset_ids: [],
    portfolio: [],
    cooperation_history: [],
    ...over,
  };
}

const IP_A = "a".repeat(64);
const IP_B = "b".repeat(64);
const IP_C = "c".repeat(64);

beforeEach(async () => {
  await _resetAdminRepoForTests();
  await _resetModelsRepoForTests(); // 同时 CASCADE 清 public_visits / daily_rosters，并重种 sentinel
  await _resetVisitsRepoForTests();
  await _resetAuditForTests();
  _resetJtiStoreForTests();
  _resetKeyRingCacheForTests();
  _resetRateLimitForTests();
});

describe("GET /admin/stats 角色门", () => {
  it("operator → 40301 insufficient_role", async () => {
    const opId = await seedAdmin("operator", "op1");
    const res = await getStats(await tokenFor(opId));
    expect(res.status).toBe(403);
    const body = (await res.json()) as { data: { sub_code: string } };
    expect(body.data.sub_code).toBe("insufficient_role");
  });

  it("admin → 200", async () => {
    const adminId = await seedAdmin("admin", "admin1");
    const res = await getStats(await tokenFor(adminId));
    expect(res.status).toBe(200);
  });
});

describe("GET /admin/stats 聚合", () => {
  it("PV/UV + 在班 + 模特计数 + 热度榜", async () => {
    const ownerId = await seedAdmin("owner", "owner1");

    // 模特：m1 待补（无封面）、m2 完整（封面 + 画廊）、m3 已归档
    const m1 = await _insertModelForTests(makeModel("M-2024-0001", "小一"));
    const m2 = await _insertModelForTests(
      makeModel("M-2024-0002", "小二", { cover_asset_id: 999, gallery_asset_ids: [999] }),
    );
    await _insertModelForTests(makeModel("M-2024-0003", "小三", { status: "archived" }));

    // 今日名单：m1 + m2 在班
    await upsertRoster({ date: today(), model_ids: [m1.id, m2.id], created_by: ownerId });

    // 访问：m1 ×3（ipA ×2 + ipB ×1）、m2 ×1（ipA）、无 model ×1（ipC）
    await recordVisit({ path: `/m/${m1.code}`, model_id: m1.id, ip_hash: IP_A });
    await recordVisit({ path: `/m/${m1.code}`, model_id: m1.id, ip_hash: IP_A });
    await recordVisit({ path: `/m/${m1.code}`, model_id: m1.id, ip_hash: IP_B });
    await recordVisit({ path: `/m/${m2.code}`, model_id: m2.id, ip_hash: IP_A });
    await recordVisit({ path: "/", ip_hash: IP_C });

    const res = await getStats(await tokenFor(ownerId));
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as {
      data: {
        today: string;
        visits_today: { pv: number; uv: number };
        on_duty_today: number;
        models: { active: number; archived: number; incomplete: number };
        top_models: Array<{
          model_id: number;
          nickname: string;
          visits: number;
          code: string | null;
        }>;
        top_models_window_days: number;
      };
    };

    expect(data.visits_today.pv).toBe(5);
    expect(data.visits_today.uv).toBe(3); // ipA / ipB / ipC
    expect(data.on_duty_today).toBe(2);
    expect(data.models.active).toBe(2);
    expect(data.models.archived).toBe(1);
    expect(data.models.incomplete).toBe(1); // 仅 m1
    expect(data.top_models_window_days).toBe(7);

    expect(data.top_models[0]).toMatchObject({ model_id: m1.id, nickname: "小一", visits: 3 });
    expect(data.top_models[1]).toMatchObject({ model_id: m2.id, nickname: "小二", visits: 1 });
    expect(data.top_models[0]!.code).toBe("M-2024-0001");
  });

  it("无数据：pv/uv/在班 = 0，热度榜空", async () => {
    const ownerId = await seedAdmin("owner", "owner1");
    const res = await getStats(await tokenFor(ownerId));
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as {
      data: {
        visits_today: { pv: number; uv: number };
        on_duty_today: number;
        top_models: unknown[];
      };
    };
    expect(data.visits_today).toEqual({ pv: 0, uv: 0 });
    expect(data.on_duty_today).toBe(0);
    expect(data.top_models).toHaveLength(0);
  });
});

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
