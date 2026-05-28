import { beforeEach, describe, expect, it } from "vitest";
import {
  _resetAuditForTests,
  findAuditById,
  findAuditLogs,
  writeAudit,
} from "./audit";

beforeEach(() => _resetAuditForTests());

async function seed(over: Partial<Parameters<typeof writeAudit>[0]> = {}) {
  await writeAudit({
    admin_id: 1,
    action: "admin.model.created",
    target_type: "model",
    target_id: "M-1",
    payload: { code: "M-1" },
    ip: "1.1.1.1",
    ua: "ua",
    ...over,
  });
}

describe("audit / findAuditLogs", () => {
  it("无 filter → 最新优先（desc by id）", async () => {
    await seed({ action: "a1" });
    await seed({ action: "a2" });
    await seed({ action: "a3" });
    const { items, total } = await findAuditLogs({ page: 1, page_size: 10 });
    expect(total).toBe(3);
    expect(items.map((r) => r.action)).toEqual(["a3", "a2", "a1"]);
  });

  it("admin_id filter", async () => {
    await seed({ admin_id: 1, action: "x" });
    await seed({ admin_id: 2, action: "y" });
    await seed({ admin_id: 1, action: "z" });
    const r = await findAuditLogs({ admin_id: 1, page: 1, page_size: 10 });
    expect(r.total).toBe(2);
    expect(r.items.map((i) => i.action)).toEqual(["z", "x"]);
  });

  it("action filter", async () => {
    await seed({ action: "admin.model.created" });
    await seed({ action: "admin.model.updated" });
    const r = await findAuditLogs({ action: "admin.model.created", page: 1, page_size: 10 });
    expect(r.total).toBe(1);
  });

  it("target_type filter", async () => {
    await seed({ target_type: "model" });
    await seed({ target_type: "roster" });
    const r = await findAuditLogs({ target_type: "roster", page: 1, page_size: 10 });
    expect(r.total).toBe(1);
    expect(r.items[0]!.target_type).toBe("roster");
  });

  it("page+page_size 切片", async () => {
    for (let i = 0; i < 5; i++) await seed({ action: `act-${i}` });
    const p2 = await findAuditLogs({ page: 2, page_size: 2 });
    expect(p2.total).toBe(5);
    expect(p2.items).toHaveLength(2);
    expect(p2.items.map((i) => i.action)).toEqual(["act-2", "act-1"]);
  });

  it("clone-on-return：mutate payload 不污染", async () => {
    await seed({ payload: { model_id: 42 } });
    const r1 = await findAuditLogs({ page: 1, page_size: 10 });
    (r1.items[0]!.payload as Record<string, unknown>).model_id = 999;
    const r2 = await findAuditLogs({ page: 1, page_size: 10 });
    expect((r2.items[0]!.payload as Record<string, unknown>).model_id).toBe(42);
  });
});

describe("audit / findAuditById", () => {
  it("hit → 返记录", async () => {
    await seed({ action: "a1" });
    const r = await findAuditById(1);
    expect(r).toBeDefined();
    expect(r!.action).toBe("a1");
  });

  it("miss → undefined", async () => {
    expect(await findAuditById(9999)).toBeUndefined();
  });
});

describe("audit / writeAudit sanitize", () => {
  it("password / one_time_password / real_name 落库前被 mask", async () => {
    await writeAudit({
      admin_id: 1,
      action: "x",
      target_type: null,
      target_id: null,
      payload: {
        username: "alice",
        password: "secret",
        one_time_password: "PLAINTEXT123",
        real_name: "张三",
      },
      ip: null,
      ua: null,
    });
    const r = await findAuditById(1);
    expect(r!.payload).toBeDefined();
    const json = JSON.stringify(r!.payload);
    expect(json).not.toContain("secret");
    expect(json).not.toContain("PLAINTEXT123");
    expect(json).not.toContain("张三");
    expect(json).toContain("alice");
  });
});
