import { beforeEach, describe, expect, it } from "vitest";
import {
  _insertForTests,
  _resetAdminRepoForTests,
  AdminRepoConflictError,
  clearTotp,
  createAdmin,
  disableAdmin,
  findById,
  listAccounts,
  setMustChangePassword,
  updateAdminProfile,
} from "./admin-repo";
import type { AdminRecord } from "./admin-repo";

function seedRecord(over: Partial<AdminRecord> = {}): Omit<AdminRecord, "id" | "created_at" | "updated_at"> {
  return {
    username: "owner",
    display_name: "Owner",
    role: "owner",
    status: "active",
    password_hash: "bcrypt$placeholder",
    totp_secret_enc: null,
    totp_enrolled: false,
    must_change_password: false,
    failed_login_count: 0,
    locked_until: null,
    last_login_at: null,
    ...over,
  };
}

beforeEach(() => _resetAdminRepoForTests());

describe("admin-repo / listAccounts", () => {
  it("空 → total 0", async () => {
    const r = await listAccounts({ page: 1, page_size: 10 });
    expect(r.total).toBe(0);
    expect(r.items).toEqual([]);
  });

  it("分页 + 升序 by id", async () => {
    await _insertForTests(seedRecord({ username: "u1" }));
    await _insertForTests(seedRecord({ username: "u2" }));
    await _insertForTests(seedRecord({ username: "u3" }));
    const p1 = await listAccounts({ page: 1, page_size: 2 });
    expect(p1.total).toBe(3);
    expect(p1.items.map((a) => a.username)).toEqual(["u1", "u2"]);
    const p2 = await listAccounts({ page: 2, page_size: 2 });
    expect(p2.items.map((a) => a.username)).toEqual(["u3"]);
  });

  it("clone-on-return：mutate caller 不污染 store", async () => {
    await _insertForTests(seedRecord({ username: "alice" }));
    const r1 = await listAccounts({ page: 1, page_size: 10 });
    r1.items[0]!.display_name = "Hacked";
    const r2 = await listAccounts({ page: 1, page_size: 10 });
    expect(r2.items[0]!.display_name).toBe("Owner");
  });
});

describe("admin-repo / createAdmin", () => {
  it("happy path：must_change_password=true / totp_enrolled=false / status=active", async () => {
    const a = await createAdmin({
      username: "new1",
      display_name: "New",
      role: "admin",
      password_hash: "hashed",
    });
    expect(a.must_change_password).toBe(true);
    expect(a.totp_enrolled).toBe(false);
    expect(a.totp_secret_enc).toBeNull();
    expect(a.status).toBe("active");
    expect(a.role).toBe("admin");
  });

  it("username 冲突 → AdminRepoConflictError", async () => {
    await createAdmin({ username: "dup", display_name: "D", role: "operator", password_hash: "h" });
    await expect(
      createAdmin({ username: "dup", display_name: "D2", role: "operator", password_hash: "h2" }),
    ).rejects.toBeInstanceOf(AdminRepoConflictError);
  });
});

describe("admin-repo / updateAdminProfile", () => {
  it("part patch 不动其他字段", async () => {
    const seeded = await _insertForTests(
      seedRecord({ username: "u", display_name: "A", role: "admin" }),
    );
    const patched = await updateAdminProfile(seeded.id, { display_name: "B" });
    expect(patched!.display_name).toBe("B");
    expect(patched!.role).toBe("admin");
  });

  it("不存在 id → undefined", async () => {
    expect(await updateAdminProfile(9999, { display_name: "x" })).toBeUndefined();
  });
});

describe("admin-repo / disableAdmin", () => {
  it("status → disabled", async () => {
    const s = await _insertForTests(seedRecord({ username: "u" }));
    const r = await disableAdmin(s.id);
    expect(r!.status).toBe("disabled");
  });
});

describe("admin-repo / clearTotp", () => {
  it("清空 totp_secret_enc + totp_enrolled=false，不动密码状态", async () => {
    const s = await _insertForTests(
      seedRecord({
        username: "u",
        totp_secret_enc: new Uint8Array([1, 2, 3]),
        totp_enrolled: true,
        must_change_password: false,
      }),
    );
    await clearTotp(s.id);
    const r = await findById(s.id);
    expect(r!.totp_secret_enc).toBeNull();
    expect(r!.totp_enrolled).toBe(false);
    expect(r!.must_change_password).toBe(false);
  });
});

describe("admin-repo / setMustChangePassword", () => {
  it("替换 password_hash + must_change_password=true", async () => {
    const s = await _insertForTests(
      seedRecord({ username: "u", password_hash: "old", must_change_password: false }),
    );
    await setMustChangePassword(s.id, "new-hash");
    const r = await findById(s.id);
    expect(r!.password_hash).toBe("new-hash");
    expect(r!.must_change_password).toBe(true);
  });
});
