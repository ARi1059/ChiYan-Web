import { beforeEach, describe, expect, it } from "vitest";
import { _getVisitsForTests, _resetVisitsRepoForTests, recordVisit } from "./visits-repo";

beforeEach(() => _resetVisitsRepoForTests());

describe("visits-repo", () => {
  it("recordVisit 返回 id 并落 store", async () => {
    const { id } = await recordVisit({
      path: "/m/M-2026-0001",
      ip_hash: "a".repeat(64),
      model_id: 1,
    });
    expect(id).toBe(1);
    const all = _getVisitsForTests();
    expect(all).toHaveLength(1);
    expect(all[0]!.path).toBe("/m/M-2026-0001");
    expect(all[0]!.ip_hash).toBe("a".repeat(64));
    expect(all[0]!.model_id).toBe(1);
  });

  it("缺省字段 → null（不是 undefined）", async () => {
    await recordVisit({ path: "/" });
    const v = _getVisitsForTests()[0]!;
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
    const v = _getVisitsForTests()[0]!;
    expect(v.created_at.getTime()).toBeGreaterThanOrEqual(t0);
  });

  it("_getVisitsForTests 返回 clone", async () => {
    await recordVisit({ path: "/" });
    const arr = _getVisitsForTests();
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
    const after = _getVisitsForTests();
    expect(after).toHaveLength(1);
    expect(after[0]!.path).toBe("/");
  });

  it("_resetVisitsRepoForTests 清空 + 重置 id", async () => {
    await recordVisit({ path: "/" });
    _resetVisitsRepoForTests();
    const { id } = await recordVisit({ path: "/" });
    expect(id).toBe(1);
  });
});
