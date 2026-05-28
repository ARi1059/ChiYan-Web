import { beforeEach, describe, expect, it } from "vitest";
import { _resetRostersRepoForTests, _upsertRosterForTests, findByDate } from "./rosters-repo";

beforeEach(() => _resetRostersRepoForTests());

describe("rosters-repo", () => {
  it("未排班 → undefined", async () => {
    expect(await findByDate("2026-05-29")).toBeUndefined();
  });

  it("upsert 后 findByDate 返回 clone", async () => {
    await _upsertRosterForTests({
      date: "2026-05-29",
      model_ids: [1, 2, 3],
      note: "周末加班",
      created_by: 1,
    });
    const r = await findByDate("2026-05-29");
    expect(r).toBeDefined();
    expect(r!.model_ids).toEqual([1, 2, 3]);
    expect(r!.note).toBe("周末加班");
    // mutate 不污染
    r!.model_ids.push(999);
    const r2 = await findByDate("2026-05-29");
    expect(r2!.model_ids).toEqual([1, 2, 3]);
  });

  it("二次 upsert 覆盖 model_ids + note", async () => {
    await _upsertRosterForTests({ date: "2026-05-29", model_ids: [1], created_by: 1 });
    await _upsertRosterForTests({ date: "2026-05-29", model_ids: [2, 3], note: "替换", created_by: 1 });
    const r = await findByDate("2026-05-29");
    expect(r!.model_ids).toEqual([2, 3]);
    expect(r!.note).toBe("替换");
  });

  it("note 缺省 → null", async () => {
    await _upsertRosterForTests({ date: "2026-05-29", model_ids: [], created_by: 1 });
    const r = await findByDate("2026-05-29");
    expect(r!.note).toBeNull();
  });
});
