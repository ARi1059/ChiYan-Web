/**
 * Model 模特表。
 *
 * 对应接口方案 §2.2 Model：
 * - code 业务编号 M-YYYY-NNNN，唯一
 * - nickname 公开化名
 * - real_name_enc 真名 AES-256-GCM 加密落库（bytea）
 * - 软删：status='archived'，不物理删除
 * - 不存：手机号/邮箱/身份证号（接口方案 §10.2 line 667）
 *
 * 索引：
 * - code 唯一
 * - GIN style_tags / available_types（jsonb 数组查询）
 * - trgm nickname（ILIKE 模糊匹配；CREATE EXTENSION 在 migration 里加）
 *
 * cover_asset_id / gallery_asset_ids 引用 media_assets，
 * 但 media_assets 也反引用 model_id —— 为避免 schema 循环引用，
 * cover_asset_id 用 bigint 不加 FK，应用层保证一致性。
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  index,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { bytea } from "./_shared";

export const modelStatusValues = ["active", "archived"] as const;
export const modelStatusEnum = pgEnum("model_status", modelStatusValues);

export const models = pgTable(
  "models",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    code: varchar("code", { length: 32 }).notNull(),
    nickname: varchar("nickname", { length: 64 }).notNull(),
    realNameEnc: bytea("real_name_enc"),
    heightCm: smallint("height_cm"),
    weightKg: smallint("weight_kg"),
    bust: smallint("bust"),
    waist: smallint("waist"),
    hip: smallint("hip"),
    shoeSizeEu: smallint("shoe_size_eu"),
    ageRange: varchar("age_range", { length: 16 }),
    hometown: varchar("hometown", { length: 32 }),
    city: varchar("city", { length: 32 }),
    styleTags: jsonb("style_tags")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    availableTypes: jsonb("available_types")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    canRemote: boolean("can_remote").notNull().default(false),
    isMinor: boolean("is_minor").notNull().default(false),
    coverAssetId: bigint("cover_asset_id", { mode: "number" }),
    galleryAssetIds: jsonb("gallery_asset_ids")
      .$type<number[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    portfolio: jsonb("portfolio")
      .$type<Record<string, unknown>[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    cooperationHistory: jsonb("cooperation_history")
      .$type<Record<string, unknown>[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    status: modelStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    uniqueIndex("models_code_uniq").on(t.code),
    index("models_status_idx").on(t.status),
    index("models_city_idx").on(t.city),
    // GIN indexes for jsonb array containment queries (?, ?|, ?&)
    index("models_style_tags_gin_idx").using("gin", t.styleTags),
    index("models_available_types_gin_idx").using("gin", t.availableTypes),
    // trgm index for ILIKE nickname search (extension created in migration)
    index("models_nickname_trgm_idx").using("gin", sql`${t.nickname} gin_trgm_ops`),
  ],
);

export type Model = typeof models.$inferSelect;
export type NewModel = typeof models.$inferInsert;
