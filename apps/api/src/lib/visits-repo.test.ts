import { beforeEach, describe, expect, it } from "vitest";
import { _insertModelForTests, _resetModelsRepoForTests } from "./models-repo";
import { _getVisitsForTests, _resetVisitsRepoForTests, recordVisit } from "./visits-repo";

beforeEach(async () => {
  // models 也 TRUNCATE —— recordVisit 第一条用例传 model_id=1，需要那个 FK target 存在。
  await _resetModelsRepoForTests();
  await _resetVisitsRepoForTests();
});

describe("visits-repo", () => {
  it("recordVisit 返回 id 并落 store", async () => {
    const m = await _insertModelForTests({
      code: "M-2026-0001",
      nickname: "A",
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
    });
    const { id } = await recordVisit({
      path: "/m/M-2026-0001",
      ip_hash: "a".repeat(64),
      model_id: m.id,
    });
    expect(id).toBe(1);
    const all = await _getVisitsForTests();
    expect(all).toHaveLength(1);
    expect(all[0]!.path).toBe("/m/M-2026-0001");
    expect(all[0]!.ip_hash).toBe("a".repeat(64));
    expect(all[0]!.model_id).toBe(m.id);
  });

  it("缺省字段 → null（不是 undefined）", async () => {
    await recordVisit({ path: "/" });
    const v = (await _getVisitsForTests())[0]!;
    expect(v.referrer).toBeNull();
    expect(v.model_id).toBeNull();
    expect(v.ip_hash).toBeNull();
    expect(v.ua).toBeNull();
    expect(v.country).toBeNull();
    expect(v.city).toBeNull();
  });

  it("自增 id", async () => {
    const a = await recordVisit({ path: "/" });
    const b = await recordVisit({ path: "/models" });
    expect(b.id).toBe(a.id + 1);
  });

  it("created_at 自动落", async () => {
    const t0 = Date.now();
    await recordVisit({ path: "/" });
    const v = (await _getVisitsForTests())[0]!;
    expect(v.created_at.getTime()).toBeGreaterThanOrEqual(t0);
  });

  it("_getVisitsForTests 返回 clone", async () => {
    await recordVisit({ path: "/" });
    const arr = await _getVisitsForTests();
    arr[0]!.path = "hacked";
    arr.push({
      id: 999,
      path: "fake",
      referrer: null,
      model_id: null,
      ip_hash: null,
      ua: null,
      country: null,
      city: null,
      created_at: new Date(),
    });
    const after = await _getVisitsForTests();
    expect(after).toHaveLength(1);
    expect(after[0]!.path).toBe("/");
  });

  it("_resetVisitsRepoForTests 清空 + 重置 id", async () => {
    await recordVisit({ path: "/" });
    await _resetVisitsRepoForTests();
    const { id } = await recordVisit({ path: "/" });
    expect(id).toBe(1);
  });
});
