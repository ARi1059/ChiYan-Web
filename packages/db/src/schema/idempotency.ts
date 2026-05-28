/**
 * Idempotency-Key 缓存（接口方案 §5.4）。
 *
 * 写接口（POST/PUT/PATCH）支持 `Idempotency-Key` Header，
 * 服务端缓存响应 24 小时；同 key 重放直接返回缓存。
 *
 * 实现策略：
 * - key 由客户端生成，建议 UUID v4
 * - request_hash 防止同 key 携带不同 body（按规范应当返 4xx）
 * - response_payload + response_status 缓存
 * - expires_at = created_at + 24h；过期清理走定时任务（Phase 4）
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  index,
  integer,
  jsonb,
  pgTable,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { admins } from "./admins";

export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    key: varchar("key", { length: 128 }).notNull(),
    adminId: bigint("admin_id", { mode: "number" })
      .notNull()
      .references(() => admins.id, { onDelete: "cascade" }),
    method: varchar("method", { length: 8 }).notNull(),
    path: varchar("path", { length: 512 }).notNull(),
    requestHash: varchar("request_hash", { length: 64 }).notNull(),
    responseStatus: integer("response_status").notNull(),
    responsePayload: jsonb("response_payload").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (t) => [
    uniqueIndex("idempotency_keys_admin_key_uniq").on(t.adminId, t.key),
    index("idempotency_keys_expires_idx").on(t.expiresAt),
  ],
);

export type IdempotencyKey = typeof idempotencyKeys.$inferSelect;
export type NewIdempotencyKey = typeof idempotencyKeys.$inferInsert;
