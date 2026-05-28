/**
 * AuditLog 审计日志。
 *
 * 对应接口方案 §2.2 AuditLog（保留 1 年，超期归档）。
 *
 * 写入约定：所有写操作必须落审计；payload 走 sanitize 一遍再写入，
 * 不允许明文密码 / TOTP secret / 一次性密码进入 jsonb。
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  index,
  inet,
  jsonb,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { admins } from "./admins";

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    adminId: bigint("admin_id", { mode: "number" }).references(() => admins.id, {
      onDelete: "set null",
    }),
    action: varchar("action", { length: 64 }).notNull(),
    targetType: varchar("target_type", { length: 32 }),
    targetId: bigint("target_id", { mode: "number" }),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    ip: inet("ip"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    index("audit_logs_admin_created_idx").on(t.adminId, t.createdAt.desc()),
    index("audit_logs_action_idx").on(t.action),
    index("audit_logs_target_idx").on(t.targetType, t.targetId),
  ],
);

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
