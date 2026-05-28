/**
 * 审计日志写入。
 *
 * 接口方案 §3.3 line 286：admin 写操作必须落 audit_logs。
 *
 * Phase 1 mock：in-memory 数组 + 同步打印（结构化 JSON）。
 * Step 7 切 Drizzle insert audit_logs。
 *
 * **极重要**：payload 落库 / 打印前必须先 sanitize，否则明文密码 / TOTP secret / 一次性密码
 * 会随审计日志泄露。见 lib/sanitize.ts。
 */

import { sanitize } from "./sanitize";

export interface AuditEntry {
  admin_id: number | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  payload: Record<string, unknown> | null;
  ip: string | null;
  ua: string | null;
}

const ring: (AuditEntry & { id: number; created_at: Date })[] = [];
let nextId = 1;

export async function writeAudit(entry: AuditEntry): Promise<void> {
  const safePayload = entry.payload == null ? null : sanitize(entry.payload);
  const row = {
    id: nextId++,
    ...entry,
    payload: safePayload,
    created_at: new Date(),
  };
  ring.push(row);
  console.log(
    JSON.stringify({
      level: "audit",
      ts: row.created_at.toISOString(),
      admin_id: row.admin_id,
      action: row.action,
      target_type: row.target_type,
      target_id: row.target_id,
      payload: row.payload,
      ip: row.ip,
      ua: row.ua,
    }),
  );
}

export function _getAuditEntriesForTests(): readonly (AuditEntry & { id: number; created_at: Date })[] {
  return ring;
}

export function _resetAuditForTests(): void {
  ring.length = 0;
  nextId = 1;
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

export type AuditRow = AuditEntry & { id: number; created_at: Date };

function cloneAuditRow(row: AuditRow): AuditRow {
  return {
    ...row,
    payload: row.payload == null ? null : { ...row.payload },
  };
}

export async function findAuditLogs(
  opts: FindAuditLogsOpts,
): Promise<{ items: AuditRow[]; total: number }> {
  const filtered: AuditRow[] = [];
  for (const r of ring) {
    if (opts.admin_id !== undefined && r.admin_id !== opts.admin_id) continue;
    if (opts.action !== undefined && r.action !== opts.action) continue;
    if (opts.target_type !== undefined && r.target_type !== opts.target_type) continue;
    if (opts.from && r.created_at < opts.from) continue;
    if (opts.to && r.created_at > opts.to) continue;
    filtered.push(r);
  }
  // 最新优先
  filtered.sort((a, b) => b.id - a.id);
  const total = filtered.length;
  const start = (opts.page - 1) * opts.page_size;
  const items = filtered.slice(start, start + opts.page_size).map(cloneAuditRow);
  return { items, total };
}

export async function findAuditById(id: number): Promise<AuditRow | undefined> {
  const r = ring.find((e) => e.id === id);
  return r ? cloneAuditRow(r) : undefined;
}
