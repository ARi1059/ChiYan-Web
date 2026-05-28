/**
 * Phase 2A 集成测试：5 个公开 endpoint。
 *
 * 覆盖：
 *  - today happy path + 未成年裁剪 + 工作室休息状态
 *  - models 列表 filter / 分页
 *  - models 详情三态（200 / 410 archived / 404 not_found）+ cropMinor
 *  - studio-info + Cache-Control
 *  - track waitUntil/同步 + ip_hash 64 字符 hex
 *  - 防护：响应 body 不含 real_name / original_url / real_name_enc
 *  - 限流（公共桶 60/min/IP）sanity check
 */
import { beforeEach, describe, expect, it } from "vitest";
import app from "../../index";
import {
  _insertMediaForTests,
  _insertModelForTests,
  _resetModelsRepoForTests,
  type ModelRecord,
} from "../../lib/models-repo";
import {
  _getVisitsForTests,
  _resetVisitsRepoForTests,
} from "../../lib/visits-repo";
import {
  _resetRostersRepoForTests,
  _upsertRosterForTests,
} from "../../lib/rosters-repo";
import {
  _resetStudioInfoRepoForTests,
  _setForTests,
} from "../../lib/studio-info-repo";
import { _resetRateLimitForTests } from "../../middleware/rate-limit";

const ENV = {
  ENV: "dev" as const,
  ALLOWED_ORIGINS: '["http://localhost:5173"]',
  DATABASE_URL: "postgres://test",
  UPSTASH_REDIS_REST_URL: "https://test.upstash",
  UPSTASH_REDIS_REST_TOKEN: "test-token",
  JWT_SECRET: "test-jwt-secret-at-least-32-bytes-long-padding-padding",
  ENC_KEY_V1: btoa(String.fromCharCode(...new Uint8Array(32).fill(7))),
};

function makeRequest(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("CF-Connecting-IP", "203.0.113.42");
  headers.set("User-Agent", "vitest");
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return app.request(path, { ...init, headers }, ENV);
}

type ModelInsert = Omit<ModelRecord, "id" | "created_at" | "updated_at">;

function makeModel(over: Partial<ModelInsert> = {}): ModelInsert {
  return {
    code: "M-2026-0001",
    nickname: "Aiko",
    status: "active",
    height_cm: 170,
    weight_kg: 52,
    bust: 84,
    waist: 60,
    hip: 88,
    shoe_size_eu: 38,
    age_range: "20-25",
    hometown: null,
    city: "Shanghai",
    style_tags: ["御姐"],
    available_types: ["写真"],
    can_remote: false,
    is_minor: false,
    cover_asset_id: null,
    gallery_asset_ids: [],
    portfolio: [],
    cooperation_history: [],
    ...over,
  };
}

async function seedModelWithCover(over: Partial<ModelInsert> = {}): Promise<ModelRecord> {
  // _insertModelForTests 按 code upsert：先种占位拿 id → 插 cover/gallery → 用 cover_asset_id 重新种
  const placeholder = await _insertModelForTests(makeModel(over));
  const cover = await _insertMediaForTests({
    model_id: placeholder.id,
    type: "image",
    url: `https://cdn.example/${placeholder.code}/cover.jpg`,
    thumb_url: `https://cdn.example/${placeholder.code}/cover_thumb.jpg`,
    width: 1200,
    height: 1600,
    has_watermark: true,
  });
  const g1 = await _insertMediaForTests({
    model_id: placeholder.id,
    type: "image",
    url: `https://cdn.example/${placeholder.code}/g1.jpg`,
    thumb_url: null,
    width: 800,
    height: 1200,
    has_watermark: true,
  });
  return _insertModelForTests(
    makeModel({ ...over, cover_asset_id: cover.id, gallery_asset_ids: [g1.id] }),
  );
}

beforeEach(() => {
  _resetModelsRepoForTests();
  _resetRostersRepoForTests();
  _resetStudioInfoRepoForTests();
  _resetVisitsRepoForTests();
  _resetRateLimitForTests();
});

describe("GET /public/today", () => {
  it("happy path：返回 is_studio_open + business_hours + 未成年裁剪", async () => {
    const adult = await seedModelWithCover({ code: "M-2026-0001", nickname: "A", is_minor: false });
    const minor = await seedModelWithCover({ code: "M-2026-0002", nickname: "M", is_minor: true });
    const other = await seedModelWithCover({ code: "M-2026-0003", nickname: "C", is_minor: false });
    await _upsertRosterForTests({
      date: "2026-05-29",
      model_ids: [adult.id, minor.id, other.id],
      note: "周末加班",
      created_by: 1,
    });

    const res = await makeRequest("/api/v1/public/today?date=2026-05-29");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe(
      "public, max-age=300, s-maxage=300, stale-while-revalidate=60",
    );

    const body = (await res.json()) as {
      code: number;
      data: {
        date: string;
        is_studio_open: boolean;
        business_hours: { weekdays: { open: string; close: string } };
        note?: string;
        models: { code: string; nickname: string; is_minor: boolean; weight_kg?: number }[];
      };
    };
    expect(body.code).toBe(0);
    expect(body.data.date).toBe("2026-05-29");
    expect(body.data.is_studio_open).toBe(true);
    expect(body.data.business_hours.weekdays.open).toBe("09:00");
    expect(body.data.note).toBe("周末加班");
    expect(body.data.models).toHaveLength(3);
    const minorCard = body.data.models.find((m) => m.code === "M-2026-0002")!;
    expect(minorCard.is_minor).toBe(true);
    expect(minorCard.weight_kg).toBeUndefined();
    const adultCard = body.data.models.find((m) => m.code === "M-2026-0001")!;
    expect(adultCard.weight_kg).toBe(52);
  });

  it("工作室休息：is_studio_open=false + resume_at；models 允许为空", async () => {
    _setForTests({
      is_studio_open: false,
      resume_at: new Date("2026-06-01T09:00:00Z"),
    });
    const res = await makeRequest("/api/v1/public/today?date=2026-05-29");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { is_studio_open: boolean; resume_at?: string; models: unknown[] };
    };
    expect(body.data.is_studio_open).toBe(false);
    expect(body.data.resume_at).toBe("2026-06-01T09:00:00.000Z");
    expect(body.data.models).toEqual([]);
  });
});

describe("GET /public/models（列表 + filter）", () => {
  beforeEach(async () => {
    await seedModelWithCover({ code: "M-2026-0001", nickname: "Aiko", style_tags: ["御姐"], available_types: ["写真"] });
    await seedModelWithCover({ code: "M-2026-0002", nickname: "Bei", style_tags: ["校园"], available_types: ["走秀"] });
    await seedModelWithCover({ code: "M-2026-0003", nickname: "Cici", style_tags: ["御姐"], available_types: ["写真"] });
    await seedModelWithCover({ code: "M-2026-0004", nickname: "Dora", status: "archived", style_tags: ["御姐"] });
  });

  it("style=御姐 + 分页 page_size=2", async () => {
    const res = await makeRequest("/api/v1/public/models?style=%E5%BE%A1%E5%A7%90&page=1&page_size=2");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe(
      "public, max-age=600, s-maxage=600, stale-while-revalidate=120",
    );
    const body = (await res.json()) as { data: { items: { code: string }[]; total: number; page: number } };
    expect(body.data.total).toBe(2); // archived M-2026-0004 不计
    expect(body.data.items).toHaveLength(2);
    expect(body.data.items.map((m) => m.code).sort()).toEqual(["M-2026-0001", "M-2026-0003"]);
  });

  it("无 filter → archived 不出现", async () => {
    const res = await makeRequest("/api/v1/public/models?page=1&page_size=50");
    const body = (await res.json()) as { data: { items: { code: string }[]; total: number } };
    expect(body.data.total).toBe(3);
    expect(body.data.items.map((m) => m.code)).not.toContain("M-2026-0004");
  });
});

describe("GET /public/models/:code（三态）", () => {
  it("active → 200 + gallery + cooperation_history 对象数组", async () => {
    await seedModelWithCover({
      code: "M-2026-0001",
      cooperation_history: [{ brand: "X", project: "P", year: 2025 }, { brand: "Y" }],
    });
    const res = await makeRequest("/api/v1/public/models/M-2026-0001");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe(
      "public, max-age=600, s-maxage=600, stale-while-revalidate=120",
    );
    const body = (await res.json()) as {
      data: {
        code: string;
        gallery: { src: string }[];
        cooperation_history: { brand: string; project?: string; year?: number }[];
      };
    };
    expect(body.data.code).toBe("M-2026-0001");
    expect(body.data.gallery.length).toBeGreaterThan(0);
    expect(body.data.cooperation_history[0]).toEqual({ brand: "X", project: "P", year: 2025 });
    expect(body.data.cooperation_history[1]).toEqual({ brand: "Y" });
  });

  it("archived → 410 + sub_code=archived + Cache-Control no-store", async () => {
    await seedModelWithCover({ code: "M-2026-0002", status: "archived" });
    const res = await makeRequest("/api/v1/public/models/M-2026-0002");
    expect(res.status).toBe(410);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = (await res.json()) as { code: number; data: { sub_code: string } };
    expect(body.code).toBe(41001);
    expect(body.data.sub_code).toBe("archived");
  });

  it("not_found → 404 + Cache-Control no-store", async () => {
    const res = await makeRequest("/api/v1/public/models/M-9999-9999");
    expect(res.status).toBe(404);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = (await res.json()) as { code: number };
    expect(body.code).toBe(40401);
  });

  it("未成年模特 → 5 字段不在 body，height_cm 在", async () => {
    await seedModelWithCover({ code: "M-2026-0010", is_minor: true });
    const res = await makeRequest("/api/v1/public/models/M-2026-0010");
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain("weight_kg");
    expect(text).not.toContain("\"bust\"");
    expect(text).not.toContain("\"waist\"");
    expect(text).not.toContain("\"hip\"");
    expect(text).not.toContain("shoe_size_eu");
    expect(text).toContain("\"height_cm\":170");
  });

  it("非法 code 格式 → 400 validation（zValidator 自有 400 响应，不走 envelope）", async () => {
    const res = await makeRequest("/api/v1/public/models/not-a-code");
    expect(res.status).toBe(400);
  });
});

describe("GET /public/studio-info", () => {
  it("默认数据 + Cache-Control 1h", async () => {
    const res = await makeRequest("/api/v1/public/studio-info");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe(
      "public, max-age=3600, s-maxage=3600, stale-while-revalidate=300",
    );
    const body = (await res.json()) as {
      data: {
        name: string;
        qq: string;
        business_hours: { weekdays: { open: string } };
        is_studio_open?: unknown;
        resume_at?: unknown;
      };
    };
    expect(body.data.name).toBe("ChiYan Studio");
    expect(body.data.qq).toBe("88888888");
    expect(body.data.business_hours.weekdays.open).toBe("09:00");
    // is_studio_open / resume_at 是 today 的状态字段，不在 studio-info
    expect(body.data.is_studio_open).toBeUndefined();
    expect(body.data.resume_at).toBeUndefined();
  });
});

describe("POST /public/track", () => {
  it("写入 ip_hash + Cache-Control no-store + 返回 recorded:true", async () => {
    await seedModelWithCover({ code: "M-2026-0001" });
    const res = await makeRequest("/api/v1/public/track", {
      method: "POST",
      body: JSON.stringify({ path: "/m/M-2026-0001", model_code: "M-2026-0001" }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = (await res.json()) as { data: { recorded: boolean } };
    expect(body.data.recorded).toBe(true);
    const visits = _getVisitsForTests();
    expect(visits).toHaveLength(1);
    expect(visits[0]!.path).toBe("/m/M-2026-0001");
    expect(visits[0]!.ip_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(visits[0]!.model_id).toBeTruthy();
  });

  it("无 model_code → model_id=null，仍然落访问记录", async () => {
    const res = await makeRequest("/api/v1/public/track", {
      method: "POST",
      body: JSON.stringify({ path: "/about" }),
    });
    expect(res.status).toBe(200);
    const v = _getVisitsForTests()[0]!;
    expect(v.model_id).toBeNull();
    expect(v.path).toBe("/about");
  });

  it("非法 model_code → 40001", async () => {
    const res = await makeRequest("/api/v1/public/track", {
      method: "POST",
      body: JSON.stringify({ path: "/x", model_code: "junk" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("公开端不漏 real_name / original_url / real_name_enc", () => {
  it("today / models / detail 响应 body 都不含敏感字段名", async () => {
    const m = await seedModelWithCover({ code: "M-2026-0001" });
    await _upsertRosterForTests({
      date: "2026-05-29",
      model_ids: [m.id],
      created_by: 1,
    });

    const paths = [
      "/api/v1/public/today?date=2026-05-29",
      "/api/v1/public/models?page=1&page_size=10",
      "/api/v1/public/models/M-2026-0001",
    ];
    for (const p of paths) {
      const res = await makeRequest(p);
      const text = await res.text();
      expect(text).not.toContain("real_name");
      expect(text).not.toContain("real_name_enc");
      expect(text).not.toContain("original_url");
    }
  });
});

describe("公开端限流（60/min/IP）", () => {
  it("60 次内 OK，第 61 次 429", async () => {
    // 60 次连续 200
    for (let i = 0; i < 60; i++) {
      const r = await makeRequest("/api/v1/public/studio-info");
      expect(r.status).toBe(200);
    }
    const over = await makeRequest("/api/v1/public/studio-info");
    expect(over.status).toBe(429);
  }, 30_000);
});
