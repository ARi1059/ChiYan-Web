/**
 * 审计日志 — drizzle/node-postgres 实现。
 *
 * 接口方案 §3.3 line 286：admin 写操作必须落 audit_logs。
 *
 * **极重要**：payload 落库前必须先 sanitize，否则明文密码 / TOTP secret / 一次性密码
 * 会随审计日志泄露。见 lib/sanitize.ts。每条写都额外结构化 stdout 打印一份给
 * journalctl / Sentry 用。
 *
 * target_id：domain 模型用 string（admin code、media object_key 等），schema 用 bigint。
 * 数字串可转就转；非数字串落 null + 把原值塞进 payload.target_ref 以便检索。
 */

import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { schema } from "@chiyan/db";
import { getDb } from "./db";
import { sanitize } from "./sanitize";

const { auditLogs, admins } = schema;

export interface AuditEntry {
  admin_id: number | null;
  action: string;
  target_type: string | null;
  /** 写入时用 string（很多 domain id 不是数字）；查询返回 number | null（schema 限制） */
  target_id: string | null;
  payload: Record<string, unknown> | null;
  ip: string | null;
  ua: string | null;
}

export type AuditRow = {
  id: number;
  admin_id: number | null;
  action: string;
  target_type: string | null;
  target_id: number | null;
  payload: Record<string, unknown> | null;
  ip: string | null;
  ua: string | null;
  created_at: Date;
};

type Row = typeof auditLogs.$inferSelect;

function toDomain(r: Row): AuditRow {
  return {
    id: r.id,
    admin_id: r.adminId,
    action: r.action,
    target_type: r.targetType,
    target_id: r.targetId,
    payload: r.payload,
    ip: r.ip,
    ua: r.userAgent,
    created_at: r.createdAt,
  };
}

function parseTargetId(s: string | null): number | null {
  if (s == null) return null;
  const n = Number(s);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

export async function writeAudit(entry: AuditEntry): Promise<void> {
  const safePayload = entry.payload == null ? null : sanitize(entry.payload);
  // target_id 是非数字字符串（如 model code "M-2026-0001"、object_key 等）→ 塞进 payload，
  // 别丢；同时把 target_id 列设 null（schema 是 bigint）。
  const targetIdNum = parseTargetId(entry.target_id);
  const payloadOut: Record<string, unknown> | null =
    targetIdNum == null && entry.target_id != null
      ? { ...(safePayload ?? {}), target_ref: entry.target_id }
      : safePayload;

  const db = getDb();
  await db.insert(auditLogs).values({
    adminId: entry.admin_id,
    action: entry.action,
    targetType: entry.target_type,
    targetId: targetIdNum,
    payload: payloadOut,
    ip: entry.ip,
    userAgent: entry.ua,
  });

  // 同时落一份 stdout（journalctl + Sentry breadcrumb 渗透用）
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({
      level: "audit",
      ts: new Date().toISOString(),
      admin_id: entry.admin_id,
      action: entry.action,
      target_type: entry.target_type,
      target_id: entry.target_id,
      payload: payloadOut,
      ip: entry.ip,
      ua: entry.ua,
    }),
  );
}

// ─── 测试 helpers ──────────────────────────────────────────

export async function _getAuditEntriesForTests(): Promise<AuditRow[]> {
  const db = getDb();
  const rows = await db.query.auditLogs.findMany({ orderBy: [asc(auditLogs.id)] });
  return rows.map(toDomain);
}

export async function _resetAuditForTests(): Promise<void> {
  const db = getDb();
  await db.execute(sql`TRUNCATE TABLE audit_logs RESTART IDENTITY`);
}

// ─── 读路径（§4.8 GET /admin/audit-logs） ──────────────────────────────────────────────

export interface FindAuditLogsOpts {
  admin_id?: number;
  action?: string;
  target_type?: string;
  from?: Date;
  to?: Date;
  page: number;
  page_size: number;
}

/** AuditRow + 关联 admin.username（LEFT JOIN，被删 admin 留 null）。 */
export interface AuditRowWithAdmin extends AuditRow {
  admin_username: string | null;
}

export async function findAuditLogs(
  opts: FindAuditLogsOpts,
): Promise<{ items: AuditRowWithAdmin[]; total: number }> {
  const db = getDb();
  const conds = [];
  if (opts.admin_id !== undefined) conds.push(eq(auditLogs.adminId, opts.admin_id));
  if (opts.action !== undefined) conds.push(eq(auditLogs.action, opts.action));
  if (opts.target_type !== undefined) conds.push(eq(auditLogs.targetType, opts.target_type));
  if (opts.from) conds.push(gte(auditLogs.createdAt, opts.from));
  if (opts.to) conds.push(lte(auditLogs.createdAt, opts.to));
  const whereExpr = conds.length > 0 ? and(...conds) : undefined;

  const offset = (opts.page - 1) * opts.page_size;
  const [rows, totalRow] = await Promise.all([
    db
      .select({
        id: auditLogs.id,
        adminId: auditLogs.adminId,
        action: auditLogs.action,
        targetType: auditLogs.targetType,
        targetId: auditLogs.targetId,
        payload: auditLogs.payload,
        ip: auditLogs.ip,
        userAgent: auditLogs.userAgent,
        createdAt: auditLogs.createdAt,
        adminUsername: admins.username,
      })
      .from(auditLogs)
      .leftJoin(admins, eq(auditLogs.adminId, admins.id))
      .where(whereExpr)
      .orderBy(desc(auditLogs.id))
      .limit(opts.page_size)
      .offset(offset),
    db.execute<{ count: string }>(
      whereExpr
        ? sql`SELECT COUNT(*)::text AS count FROM audit_logs WHERE ${whereExpr}`
        : sql`SELECT COUNT(*)::text AS count FROM audit_logs`,
    ),
  ]);

  const total = Number((totalRow.rows[0] as { count: string }).count);
  const items: AuditRowWithAdmin[] = rows.map((r) => ({
    id: r.id,
    admin_id: r.adminId,
    action: r.action,
    target_type: r.targetType,
    target_id: r.targetId,
    payload: r.payload,
    ip: r.ip,
    ua: r.userAgent,
    created_at: r.createdAt,
    admin_username: r.adminUsername,
  }));
  return { items, total };
}

export async function findAuditById(id: number): Promise<AuditRowWithAdmin | undefined> {
  const db = getDb();
  const [row] = await db
    .select({
      id: auditLogs.id,
      adminId: auditLogs.adminId,
      action: auditLogs.action,
      targetType: auditLogs.targetType,
      targetId: auditLogs.targetId,
      payload: auditLogs.payload,
      ip: auditLogs.ip,
      userAgent: auditLogs.userAgent,
      createdAt: auditLogs.createdAt,
      adminUsername: admins.username,
    })
    .from(auditLogs)
    .leftJoin(admins, eq(auditLogs.adminId, admins.id))
    .where(eq(auditLogs.id, id))
    .limit(1);
  if (!row) return undefined;
  return {
    id: row.id,
    admin_id: row.adminId,
    action: row.action,
    target_type: row.targetType,
    target_id: row.targetId,
    payload: row.payload,
    ip: row.ip,
    ua: row.userAgent,
    created_at: row.createdAt,
    admin_username: row.adminUsername,
  };
}
