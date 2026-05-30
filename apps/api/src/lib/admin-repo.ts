/**
 * admins 仓储 — drizzle/node-postgres 实现。
 *
 * 字段：与 schema/admins.ts 一一对应。
 *   - password_hash：bcrypt（caller 算好传进来）
 *   - totp_secret_enc：AES-256-GCM 密文（Uint8Array <-> bytea；schema/_shared.ts 定义的 custom type）
 *   - must_change_password / totp_enrolled / failed_login_count / locked_until / status
 *
 * 密码历史：表 admin_password_history，每次改密 insert 一行；validate 时查 desc 最近 N 条。
 *
 * 错误：username 唯一冲突映射 AdminRepoConflictError（pg 23505 + 约束名 admins_username_uniq）。
 *
 * 重置：_resetAdminRepoForTests TRUNCATE 两张表 RESTART IDENTITY CASCADE + 重种 sentinel。
 * 与 _resetModelsRepoForTests 的 admins TRUNCATE 兼容；两个 reset 谁先谁后都不冲突。
 */

import { asc, desc, eq, sql } from "drizzle-orm";
import { schema } from "@chiyan/db";
import type { AdminRole, AdminStatus } from "@chiyan/types";
import { getDb } from "./db";

const { admins, adminPasswordHistory } = schema;

export interface AdminRecord {
  id: number;
  username: string;
  display_name: string;
  role: AdminRole;
  status: AdminStatus;
  password_hash: string;
  totp_secret_enc: Uint8Array | null;
  totp_enrolled: boolean;
  must_change_password: boolean;
  failed_login_count: number;
  locked_until: Date | null;
  last_login_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface PasswordHistoryRecord {
  id: number;
  admin_id: number;
  password_hash: string;
  created_at: Date;
}

type AdminRow = typeof admins.$inferSelect;
type HistoryRow = typeof adminPasswordHistory.$inferSelect;

function toDomain(r: AdminRow): AdminRecord {
  return {
    id: r.id,
    username: r.username,
    display_name: r.displayName,
    role: r.role,
    status: r.status,
    password_hash: r.passwordHash,
    totp_secret_enc: r.totpSecretEnc,
    totp_enrolled: r.totpEnrolled,
    must_change_password: r.mustChangePassword,
    failed_login_count: r.failedLoginCount,
    locked_until: r.lockedUntil,
    last_login_at: r.lastLoginAt,
    created_at: r.createdAt,
    updated_at: r.updatedAt,
  };
}

function historyToDomain(r: HistoryRow): PasswordHistoryRecord {
  return {
    id: r.id,
    admin_id: r.adminId,
    password_hash: r.passwordHash,
    created_at: r.createdAt,
  };
}

export async function findByUsername(username: string): Promise<AdminRecord | undefined> {
  const db = getDb();
  const r = await db.query.admins.findFirst({ where: eq(admins.username, username) });
  return r ? toDomain(r) : undefined;
}

export async function findById(id: number): Promise<AdminRecord | undefined> {
  const db = getDb();
  const r = await db.query.admins.findFirst({ where: eq(admins.id, id) });
  return r ? toDomain(r) : undefined;
}

/**
 * 测试 / seed 用：插入一个 admin。
 * handler 不该直接调它（管理员创建走 /admin/accounts 流程，那里会调 createAdmin）。
 */
export async function _insertForTests(record: Omit<AdminRecord, "id" | "created_at" | "updated_at">): Promise<AdminRecord> {
  const db = getDb();
  const [row] = await db
    .insert(admins)
    .values({
      username: record.username,
      displayName: record.display_name,
      role: record.role,
      status: record.status,
      passwordHash: record.password_hash,
      totpSecretEnc: record.totp_secret_enc,
      totpEnrolled: record.totp_enrolled,
      mustChangePassword: record.must_change_password,
      failedLoginCount: record.failed_login_count,
      lockedUntil: record.locked_until,
      lastLoginAt: record.last_login_at,
    })
    .returning();
  return toDomain(row!);
}

export async function incrementFailedLogin(id: number): Promise<number> {
  const db = getDb();
  const [row] = await db
    .update(admins)
    .set({
      failedLoginCount: sql`${admins.failedLoginCount} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(admins.id, id))
    .returning({ failedLoginCount: admins.failedLoginCount });
  if (!row) throw new Error(`admin ${id} not found`);
  return row.failedLoginCount;
}

export async function lockAccount(id: number, until: Date): Promise<void> {
  const db = getDb();
  const out = await db
    .update(admins)
    .set({ lockedUntil: until, failedLoginCount: 0, updatedAt: new Date() })
    .where(eq(admins.id, id))
    .returning({ id: admins.id });
  if (out.length === 0) throw new Error(`admin ${id} not found`);
}

export async function unlockAccount(id: number): Promise<void> {
  const db = getDb();
  const out = await db
    .update(admins)
    .set({ lockedUntil: null, failedLoginCount: 0, updatedAt: new Date() })
    .where(eq(admins.id, id))
    .returning({ id: admins.id });
  if (out.length === 0) throw new Error(`admin ${id} not found`);
}

export async function markLoginSuccess(id: number): Promise<void> {
  const db = getDb();
  const now = new Date();
  const out = await db
    .update(admins)
    .set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: now, updatedAt: now })
    .where(eq(admins.id, id))
    .returning({ id: admins.id });
  if (out.length === 0) throw new Error(`admin ${id} not found`);
}

export async function updatePassword(id: number, passwordHash: string): Promise<void> {
  const db = getDb();
  const out = await db
    .update(admins)
    .set({ passwordHash, mustChangePassword: false, updatedAt: new Date() })
    .where(eq(admins.id, id))
    .returning({ id: admins.id });
  if (out.length === 0) throw new Error(`admin ${id} not found`);
}

export async function recordPasswordHistory(adminId: number, passwordHash: string): Promise<void> {
  const db = getDb();
  await db.insert(adminPasswordHistory).values({ adminId, passwordHash });
}

export async function getPasswordHistory(adminId: number, limit: number): Promise<PasswordHistoryRecord[]> {
  const db = getDb();
  const rows = await db.query.adminPasswordHistory.findMany({
    where: eq(adminPasswordHistory.adminId, adminId),
    orderBy: [desc(adminPasswordHistory.createdAt), desc(adminPasswordHistory.id)],
    limit,
  });
  return rows.map(historyToDomain);
}

export async function enrollTotp(id: number, secretEnc: Uint8Array): Promise<void> {
  const db = getDb();
  const out = await db
    .update(admins)
    .set({ totpSecretEnc: secretEnc, totpEnrolled: true, updatedAt: new Date() })
    .where(eq(admins.id, id))
    .returning({ id: admins.id });
  if (out.length === 0) throw new Error(`admin ${id} not found`);
}

export async function _resetAdminRepoForTests(): Promise<void> {
  const db = getDb();
  // CASCADE：清 admins 时会一并清掉引用它的 password_history / media_assets 等。
  // 不在此处 ensureSentinelAdmin：admin-repo 单元测试要从空表起算总数。
  // 同时调 _resetModelsRepoForTests / _resetRostersRepoForTests 的用例会拿到 sentinel。
  await db.execute(
    sql`TRUNCATE TABLE admins, admin_password_history RESTART IDENTITY CASCADE`,
  );
}

// ─── 账号管理（§4.7 Owner-only） ──────────────────────────────────────────────

export interface ListAccountsOpts {
  page: number;
  page_size: number;
}

export async function listAccounts(
  opts: ListAccountsOpts,
): Promise<{ items: AdminRecord[]; total: number }> {
  const db = getDb();
  const offset = (opts.page - 1) * opts.page_size;
  const [items, totalRow] = await Promise.all([
    db.query.admins.findMany({
      orderBy: [asc(admins.id)],
      limit: opts.page_size,
      offset,
    }),
    db.execute<{ count: string }>(sql`SELECT COUNT(*)::text AS count FROM admins`),
  ]);
  const total = Number((totalRow.rows[0] as { count: string }).count);
  return { items: items.map(toDomain), total };
}

export class AdminRepoConflictError extends Error {
  constructor(field: string) {
    super(`conflict on ${field}`);
    this.name = "AdminRepoConflictError";
  }
}

export interface CreateAdminInput {
  username: string;
  display_name: string;
  role: AdminRole;
  password_hash: string;
}

/** 新建账号；username 冲突 throw AdminRepoConflictError。 */
export async function createAdmin(input: CreateAdminInput): Promise<AdminRecord> {
  const db = getDb();
  try {
    const [row] = await db
      .insert(admins)
      .values({
        username: input.username,
        displayName: input.display_name,
        role: input.role,
        passwordHash: input.password_hash,
        status: "active",
        totpEnrolled: false,
        mustChangePassword: true,
        failedLoginCount: 0,
      })
      .returning();
    return toDomain(row!);
  } catch (e) {
    if (isUniqueViolation(e, "admins_username_uniq")) {
      throw new AdminRepoConflictError("username");
    }
    throw e;
  }
}

export interface UpdateAdminProfilePatch {
  display_name?: string;
  role?: AdminRole;
  status?: AdminStatus;
}

export async function updateAdminProfile(
  id: number,
  patch: UpdateAdminProfilePatch,
): Promise<AdminRecord | undefined> {
  const db = getDb();
  const set: Partial<typeof admins.$inferInsert> = { updatedAt: new Date() };
  if (patch.display_name !== undefined) set.displayName = patch.display_name;
  if (patch.role !== undefined) set.role = patch.role;
  if (patch.status !== undefined) set.status = patch.status;
  const [row] = await db
    .update(admins)
    .set(set)
    .where(eq(admins.id, id))
    .returning();
  return row ? toDomain(row) : undefined;
}

export async function disableAdmin(id: number): Promise<AdminRecord | undefined> {
  return updateAdminProfile(id, { status: "disabled" });
}

/** 重置 2FA：清空 totp_secret_enc + totp_enrolled=false（密码状态不动）。 */
export async function clearTotp(id: number): Promise<void> {
  const db = getDb();
  const out = await db
    .update(admins)
    .set({ totpSecretEnc: null, totpEnrolled: false, updatedAt: new Date() })
    .where(eq(admins.id, id))
    .returning({ id: admins.id });
  if (out.length === 0) throw new Error(`admin ${id} not found`);
}

/** 重置密码：替换 password_hash 且置 must_change_password=true。 */
export async function setMustChangePassword(id: number, passwordHash: string): Promise<void> {
  const db = getDb();
  const out = await db
    .update(admins)
    .set({ passwordHash, mustChangePassword: true, updatedAt: new Date() })
    .where(eq(admins.id, id))
    .returning({ id: admins.id });
  if (out.length === 0) throw new Error(`admin ${id} not found`);
}

/**
 * pg 23505 + 约束名匹配：用于将 INSERT/UPDATE 冲突映射回领域错误，避免把整个
 * driver error 透传到 handler。
 */
function isUniqueViolation(e: unknown, constraintName: string): boolean {
  if (!e || typeof e !== "object") return false;
  const obj = e as { code?: string; constraint?: string };
  return obj.code === "23505" && obj.constraint === constraintName;
}

