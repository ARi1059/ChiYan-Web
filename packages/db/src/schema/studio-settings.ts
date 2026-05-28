/**
 * 工作室全局设置（单行表）。
 *
 * 一条记录 id=1，CHECK 约束强制唯一性（避免应用层重复写入）。
 * 字段直接对应 PublicTodayResponse + PublicStudioInfoResponse 中
 * "全局可配置"的部分（H5 §四 + 接口方案 §4.9）。
 *
 * 业务读路径：
 * - GET /public/today 取 is_studio_open / business_hours / resume_at
 * - GET /public/studio-info 取 name / tagline / address / qq / phone / about / business_hours
 *
 * Phase 3 业主在 Admin 后台改这些字段；Phase 4 接审计 / Phase 5 接 cache purge。
 */
import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  jsonb,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

export interface BusinessHoursValue {
  weekdays: { open: string; close: string };
  weekends?: { open: string; close: string };
}

export const studioSettings = pgTable(
  "studio_settings",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    name: varchar("name", { length: 64 }).notNull(),
    tagline: varchar("tagline", { length: 128 }),
    address: varchar("address", { length: 255 }),
    qq: varchar("qq", { length: 32 }).notNull(),
    phone: varchar("phone", { length: 32 }),
    about: text("about"),
    businessHours: jsonb("business_hours").$type<BusinessHoursValue>().notNull(),
    isStudioOpen: boolean("is_studio_open").notNull().default(true),
    resumeAt: timestamp("resume_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [check("studio_settings_singleton", sql`${t.id} = 1`)],
);

export type StudioSettings = typeof studioSettings.$inferSelect;
export type NewStudioSettings = typeof studioSettings.$inferInsert;
