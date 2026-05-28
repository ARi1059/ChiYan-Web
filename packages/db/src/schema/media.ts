/**
 * MediaAsset 媒体资源（图/视频）。
 *
 * 对应接口方案 §2.2 MediaAsset + §6.1 上传流程。
 * - model_id 可为 null（工作室通用素材）
 * - url 公开 CDN（带水印），original_url R2 私有桶
 * - hash sha256 防重
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { admins } from "./admins";
import { models } from "./models";

export const mediaTypeValues = ["image", "video"] as const;
export const mediaTypeEnum = pgEnum("media_type", mediaTypeValues);

export const mediaAssets = pgTable(
  "media_assets",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    modelId: bigint("model_id", { mode: "number" }).references(() => models.id, {
      onDelete: "set null",
    }),
    type: mediaTypeEnum("type").notNull(),
    url: text("url").notNull(),
    originalUrl: text("original_url").notNull(),
    thumbUrl: text("thumb_url"),
    width: integer("width"),
    height: integer("height"),
    fileSize: integer("file_size"),
    hash: varchar("hash", { length: 64 }).notNull(),
    hasWatermark: boolean("has_watermark").notNull().default(false),
    uploadedBy: bigint("uploaded_by", { mode: "number" })
      .notNull()
      .references(() => admins.id, { onDelete: "restrict" }),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    uniqueIndex("media_assets_hash_uniq").on(t.hash),
    index("media_assets_model_idx").on(t.modelId),
    index("media_assets_uploaded_by_idx").on(t.uploadedBy),
  ],
);

export type MediaAsset = typeof mediaAssets.$inferSelect;
export type NewMediaAsset = typeof mediaAssets.$inferInsert;
