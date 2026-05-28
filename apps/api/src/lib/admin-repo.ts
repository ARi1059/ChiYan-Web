/**
 * admins 仓储接口（async，对齐 Drizzle 用法）。
 *
 * Phase 1 mock：in-memory Map 模拟一张表。Step 7 切真 Drizzle 时只换实现，不动 handler。
 *
 * 字段保持与 schema/admins.ts 一致：
 *   - password_hash：bcrypt
 *   - totp_secret_enc：AES-256-GCM 加密的 base32 secret（落 bytea；mock 这里直接 Uint8Array）
 *   - must_change_password / totp_enrolled / failed_login_count / locked_until / status
 *
 * Phase 1 只用到 owner/admin 的字段子集；保留接口形态，Step 7 直接接 db.query.admins.findFirst 等。
 */

import type { AdminRole, AdminStatus } from "@chiyan/types";

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

const adminsById = new Map<number, AdminRecord>();
const adminsByUsername = new Map<string, number>();
const passwordHistory: PasswordHistoryRecord[] = [];
let nextAdminId = 1;
let nextHistoryId = 1;

function clone(a: AdminRecord): AdminRecord {
  return { ...a };
}

export async function findByUsername(username: string): Promise<AdminRecord | undefined> {
  const id = adminsByUsername.get(username);
  if (id == null) return undefined;
  const r = adminsById.get(id);
  return r ? clone(r) : undefined;
}

export async function findById(id: number): Promise<AdminRecord | undefined> {
  const r = adminsById.get(id);
  return r ? clone(r) : undefined;
}

/**
 * 测试 / seed 用：插入一个 admin。
 * handler 不该直接调它（管理员创建走 /admin/accounts 流程，那里会调 createAdmin）。
 */
export async function _insertForTests(record: Omit<AdminRecord, "id" | "created_at" | "updated_at">): Promise<AdminRecord> {
  const id = nextAdminId++;
  const now = new Date();
  const full: AdminRecord = { ...record, id, created_at: now, updated_at: now };
  adminsById.set(id, full);
  adminsByUsername.set(full.username, id);
  return clone(full);
}

export async function incrementFailedLogin(id: number): Promise<number> {
  const r = adminsById.get(id);
  if (!r) throw new Error(`admin ${id} not found`);
  r.failed_login_count += 1;
  r.updated_at = new Date();
  return r.failed_login_count;
}

export async function lockAccount(id: number, until: Date): Promise<void> {
  const r = adminsById.get(id);
  if (!r) throw new Error(`admin ${id} not found`);
  r.locked_until = until;
  r.failed_login_count = 0;
  r.updated_at = new Date();
}

export async function unlockAccount(id: number): Promise<void> {
  const r = adminsById.get(id);
  if (!r) throw new Error(`admin ${id} not found`);
  r.locked_until = null;
  r.failed_login_count = 0;
  r.updated_at = new Date();
}

export async function markLoginSuccess(id: number): Promise<void> {
  const r = adminsById.get(id);
  if (!r) throw new Error(`admin ${id} not found`);
  r.failed_login_count = 0;
  r.locked_until = null;
  r.last_login_at = new Date();
  r.updated_at = new Date();
}

export async function updatePassword(id: number, passwordHash: string): Promise<void> {
  const r = adminsById.get(id);
  if (!r) throw new Error(`admin ${id} not found`);
  r.password_hash = passwordHash;
  r.must_change_password = false;
  r.updated_at = new Date();
}

export async function recordPasswordHistory(adminId: number, passwordHash: string): Promise<void> {
  passwordHistory.push({
    id: nextHistoryId++,
    admin_id: adminId,
    password_hash: passwordHash,
    created_at: new Date(),
  });
}

export async function getPasswordHistory(adminId: number, limit: number): Promise<PasswordHistoryRecord[]> {
  return passwordHistory
    .filter((r) => r.admin_id === adminId)
    .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
    .slice(0, limit)
    .map((r) => ({ ...r }));
}

export async function enrollTotp(id: number, secretEnc: Uint8Array): Promise<void> {
  const r = adminsById.get(id);
  if (!r) throw new Error(`admin ${id} not found`);
  r.totp_secret_enc = secretEnc;
  r.totp_enrolled = true;
  r.updated_at = new Date();
}

export function _resetAdminRepoForTests(): void {
  adminsById.clear();
  adminsByUsername.clear();
  passwordHistory.length = 0;
  nextAdminId = 1;
  nextHistoryId = 1;
}
