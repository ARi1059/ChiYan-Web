/**
 * DailyRoster 当日名单（最高频写）。
 *
 * 对应接口方案 §2.2 DailyRoster + §6.2。
 * - date 唯一 → 每天只有一条
 * - model_ids jsonb 数组（GIN 索引便于查"某模特是否在某天名单上"）
 * - PUT /admin/roster 整覆盖语义，不做 diff merge
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  date,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { admins } from "./admins";

export const dailyRosters = pgTable(
  "daily_rosters",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    date: date("date", { mode: "string" }).notNull(),
    modelIds: jsonb("model_ids")
      .$type<number[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    note: text("note"),
    createdBy: bigint("created_by", { mode: "number" })
      .notNull()
      .references(() => admins.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    uniqueIndex("daily_rosters_date_uniq").on(t.date),
    index("daily_rosters_model_ids_gin_idx").using("gin", t.modelIds),
  ],
);

export type DailyRoster = typeof dailyRosters.$inferSelect;
export type NewDailyRoster = typeof dailyRosters.$inferInsert;
