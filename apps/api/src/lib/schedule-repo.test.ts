/**
 * schedule-repo 单元测：每条用例先 reset，再操作。
 * （models 表有 cascade onDelete，所以这里也清 models，免得跨用例污染）
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _insertModelForTests, _resetModelsRepoForTests } from "./models-repo";
import {
  _resetScheduleRepoForTests,
  deleteScheduleEntry,
  findScheduleInRange,
  upsertScheduleEntry,
} from "./schedule-repo";

const baseModel = {
  status: "active" as const,
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
};

let M1: number;
let M2: number;

beforeEach(async () => {
  await _resetModelsRepoForTests();
  await _resetScheduleRepoForTests();
  const m1 = await _insertModelForTests({ ...baseModel, code: "M-2099-0001", nickname: "A" });
  const m2 = await _insertModelForTests({ ...baseModel, code: "M-2099-0002", nickname: "B" });
  M1 = m1.id;
  M2 = m2.id;
});

describe("schedule-repo / upsert", () => {
  it("新增 → returning 完整记录", async () => {
    const r = await upsertScheduleEntry({
      model_id: M1,
      date: "2026-06-01",
      status: "available",
      note: "morning",
    });
    expect(r.model_id).toBe(M1);
    expect(r.status).toBe("available");
    expect(r.note).toBe("morning");
  });

  it("同 (model_id, date) 重 PUT → 更新而非新增", async () => {
    const a = await upsertScheduleEntry({
      model_id: M1,
      date: "2026-06-02",
      status: "available",
    });
    const b = await upsertScheduleEntry({
      model_id: M1,
      date: "2026-06-02",
      status: "booked",
      note: "客户 X",
    });
    expect(b.id).toBe(a.id);
    expect(b.status).toBe("booked");
    expect(b.note).toBe("客户 X");
  });

  it("note 缺省 → null", async () => {
    const r = await upsertScheduleEntry({ model_id: M1, date: "2026-06-03", status: "tentative" });
    expect(r.note).toBeNull();
  });
});

describe("schedule-repo / findInRange", () => {
  it("空 → 空数组", async () => {
    const r = await findScheduleInRange({ from: "2026-06-01", to: "2026-06-30" });
    expect(r).toEqual([]);
  });

  it("按 date 升序 + model_id 升序", async () => {
    await upsertScheduleEntry({ model_id: M2, date: "2026-06-05", status: "available" });
    await upsertScheduleEntry({ model_id: M1, date: "2026-06-05", status: "booked" });
    await upsertScheduleEntry({ model_id: M1, date: "2026-06-01", status: "available" });
    const r = await findScheduleInRange({ from: "2026-06-01", to: "2026-06-10" });
    expect(r.map((x) => [x.date, x.model_id])).toEqual([
      ["2026-06-01", M1],
      ["2026-06-05", M1],
      ["2026-06-05", M2],
    ]);
  });

  it("model_id filter", async () => {
    await upsertScheduleEntry({ model_id: M1, date: "2026-06-05", status: "available" });
    await upsertScheduleEntry({ model_id: M2, date: "2026-06-05", status: "booked" });
    const r = await findScheduleInRange({ from: "2026-06-01", to: "2026-06-10", model_id: M2 });
    expect(r.map((x) => x.model_id)).toEqual([M2]);
  });

  it("窗口外的不返", async () => {
    await upsertScheduleEntry({ model_id: M1, date: "2026-05-31", status: "booked" });
    await upsertScheduleEntry({ model_id: M1, date: "2026-07-01", status: "booked" });
    await upsertScheduleEntry({ model_id: M1, date: "2026-06-15", status: "available" });
    const r = await findScheduleInRange({ from: "2026-06-01", to: "2026-06-30" });
    expect(r).toHaveLength(1);
    expect(r[0]!.date).toBe("2026-06-15");
  });
});

describe("schedule-repo / delete", () => {
  it("hit → true，再 find → 空", async () => {
    await upsertScheduleEntry({ model_id: M1, date: "2026-06-10", status: "available" });
    expect(await deleteScheduleEntry(M1, "2026-06-10")).toBe(true);
    const r = await findScheduleInRange({ from: "2026-06-01", to: "2026-06-30", model_id: M1 });
    expect(r).toEqual([]);
  });

  it("miss → false", async () => {
    expect(await deleteScheduleEntry(M1, "2099-01-01")).toBe(false);
  });
});
