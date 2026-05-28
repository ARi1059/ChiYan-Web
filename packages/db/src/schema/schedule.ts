/**
 * ScheduleEntry 模特档期。
 *
 * 对应接口方案 §2.2 ScheduleEntry。
 * - (model_id, date) 唯一
 * - status：available / booked / tentative
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  date,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { models } from "./models";

export const scheduleStatusValues = ["available", "booked", "tentative"] as const;
export const scheduleStatusEnum = pgEnum("schedule_status", scheduleStatusValues);

export const scheduleEntries = pgTable(
  "schedule_entries",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    modelId: bigint("model_id", { mode: "number" })
      .notNull()
      .references(() => models.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    status: scheduleStatusEnum("status").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    uniqueIndex("schedule_entries_model_date_uniq").on(t.modelId, t.date),
    index("schedule_entries_date_idx").on(t.date),
  ],
);

export type ScheduleEntry = typeof scheduleEntries.$inferSelect;
export type NewScheduleEntry = typeof scheduleEntries.$inferInsert;
