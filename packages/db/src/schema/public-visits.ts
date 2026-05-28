/**
 * PublicVisit H5 访问埋点。
 *
 * 对应接口方案 §2.2 PublicVisit + §4.9 POST /public/track。
 *
 * 隐私约束：
 * - ip_hash 存 SHA-256（不存原文）
 * - country/city 是 Cloudflare 自带的粗粒度 geo（不依赖第三方 IP 库）
 */
import { sql } from "drizzle-orm";
import { bigint, bigserial, index, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { models } from "./models";

export const publicVisits = pgTable(
  "public_visits",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    modelId: bigint("model_id", { mode: "number" }).references(() => models.id, {
      onDelete: "set null",
    }),
    path: text("path").notNull(),
    referrer: text("referrer"),
    ipHash: varchar("ip_hash", { length: 64 }),
    ua: text("ua"),
    country: varchar("country", { length: 8 }),
    city: varchar("city", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    index("public_visits_created_idx").on(t.createdAt.desc()),
    index("public_visits_model_created_idx").on(t.modelId, t.createdAt.desc()),
  ],
);

export type PublicVisit = typeof publicVisits.$inferSelect;
export type NewPublicVisit = typeof publicVisits.$inferInsert;
