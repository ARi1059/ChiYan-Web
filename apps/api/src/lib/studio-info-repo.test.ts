import { beforeEach, describe, expect, it } from "vitest";
import {
  _resetStudioInfoRepoForTests,
  _setForTests,
  getSettings,
} from "./studio-info-repo";

beforeEach(() => _resetStudioInfoRepoForTests());

describe("studio-info-repo", () => {
  it("默认返回 ChiYan Studio + qq + 工作日营业时间", async () => {
    const s = await getSettings();
    expect(s.name).toBe("ChiYan Studio");
    expect(s.qq).toBe("88888888");
    expect(s.is_studio_open).toBe(true);
    expect(s.business_hours.weekdays).toEqual({ open: "09:00", close: "22:00" });
    expect(s.resume_at).toBeNull();
  });

  it("_setForTests 覆盖 is_studio_open + resume_at（工作室休息场景）", async () => {
    const resumeAt = new Date("2026-06-01T09:00:00Z");
    _setForTests({ is_studio_open: false, resume_at: resumeAt });
    const s = await getSettings();
    expect(s.is_studio_open).toBe(false);
    expect(s.resume_at?.toISOString()).toBe(resumeAt.toISOString());
  });

  it("clone-on-return：mutate 不污染 store", async () => {
    const s1 = await getSettings();
    s1.name = "Hacked";
    s1.business_hours.weekdays.open = "00:00";
    const s2 = await getSettings();
    expect(s2.name).toBe("ChiYan Studio");
    expect(s2.business_hours.weekdays.open).toBe("09:00");
  });

  it("_resetStudioInfoRepoForTests 恢复默认", async () => {
    _setForTests({ name: "Custom", qq: "11111111" });
    _resetStudioInfoRepoForTests();
    const s = await getSettings();
    expect(s.name).toBe("ChiYan Studio");
    expect(s.qq).toBe("88888888");
  });

  it("business_hours 部分覆盖 + weekends", async () => {
    _setForTests({
      business_hours: {
        weekdays: { open: "10:00", close: "20:00" },
        weekends: { open: "12:00", close: "18:00" },
      },
    });
    const s = await getSettings();
    expect(s.business_hours.weekends?.open).toBe("12:00");
  });
});
