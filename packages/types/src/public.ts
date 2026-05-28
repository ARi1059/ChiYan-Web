/**
 * H5 公开接口（无鉴权）schema（接口方案 §4.9 + H5 方案 §四）。
 *
 * 设计要点：
 * - 未成年模特：handler 按 `is_minor=true` 时删除身体数据字段（weight_kg/bust/waist/hip/shoe_size_eu）
 *   → 用 z.optional 表达可省，不在 schema 强行 omit
 * - 模特编号正则 M-YYYY-NNNN
 * - ImageAsset 出三档 srcset（H5 §八.2）
 * - today 接口需要 is_studio_open + business_hours + resume_at 应对"今日工作室休息"状态
 */
import { z } from "zod";

const ModelCode = z.string().regex(/^M-\d{4}-\d{4}$/);

const ImageAsset = z.object({
  src: z.string().url(),
  srcset: z.object({
    "1x": z.string().url(),
    "2x": z.string().url(),
    "3x": z.string().url(),
  }),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  blurhash: z.string().optional(),
  lqip: z.string().optional(),
});
export type ImageAsset = z.infer<typeof ImageAsset>;

/** 公开卡片字段（首页 + 全部模特库共用，详情见 H5 §四.三.4）。 */
export const PublicModelCard = z.object({
  code: ModelCode,
  nickname: z.string(),
  cover: ImageAsset,
  height_cm: z.number().int().optional(),
  weight_kg: z.number().int().optional(),
  bust: z.number().int().optional(),
  waist: z.number().int().optional(),
  hip: z.number().int().optional(),
  shoe_size_eu: z.number().int().optional(),
  age_range: z.string().optional(),
  city: z.string().optional(),
  style_tags: z.array(z.string()),
  available_types: z.array(z.string()),
  can_remote: z.boolean(),
  is_minor: z.boolean(),
});
export type PublicModelCard = z.infer<typeof PublicModelCard>;

/** 详情页：白名单 pick，公开字段完整。 */
export const PublicModelDetail = PublicModelCard.extend({
  hometown: z.string().optional(),
  gallery: z.array(ImageAsset),
  portfolio: z.array(
    z.object({
      brand: z.string(),
      project: z.string().optional(),
      year: z.number().int().optional(),
      cover: ImageAsset.optional(),
    }),
  ),
  // 与 DB schema 对齐（jsonb<Record<string, unknown>[]>），
  // H5 §四（五）.2 需 brand/project/year 分别呈现
  cooperation_history: z.array(
    z.object({
      brand: z.string(),
      project: z.string().optional(),
      year: z.number().int().optional(),
    }),
  ),
});
export type PublicModelDetail = z.infer<typeof PublicModelDetail>;

// ─── GET /public/today ─────────────────────────────────────────
export const PublicTodayQuery = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
export type PublicTodayQuery = z.infer<typeof PublicTodayQuery>;

export const BusinessHours = z.object({
  weekdays: z.object({ open: z.string(), close: z.string() }),
  weekends: z.object({ open: z.string(), close: z.string() }).optional(),
});
export type BusinessHours = z.infer<typeof BusinessHours>;

export const PublicTodayResponse = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  is_studio_open: z.boolean(),
  business_hours: BusinessHours,
  resume_at: z.string().datetime().optional(),
  note: z.string().optional(),
  models: z.array(PublicModelCard),
});
export type PublicTodayResponse = z.infer<typeof PublicTodayResponse>;

// ─── GET /public/models ────────────────────────────────────────
export const PublicModelsQuery = z.object({
  type: z.string().optional(),
  style: z.string().optional(),
  q: z.string().max(64).optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(50).default(20),
});
export type PublicModelsQuery = z.infer<typeof PublicModelsQuery>;

export const PublicModelsResponse = z.object({
  items: z.array(PublicModelCard),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  page_size: z.number().int().min(1),
});
export type PublicModelsResponse = z.infer<typeof PublicModelsResponse>;

// ─── GET /public/studio-info ───────────────────────────────────
export const PublicStudioInfoResponse = z.object({
  name: z.string(),
  tagline: z.string().optional(),
  address: z.string().optional(),
  qq: z.string(),
  phone: z.string().optional(),
  business_hours: BusinessHours,
  about: z.string().optional(),
});
export type PublicStudioInfoResponse = z.infer<typeof PublicStudioInfoResponse>;

// ─── POST /public/track ────────────────────────────────────────
export const PublicTrackRequest = z.object({
  path: z.string().max(512),
  referrer: z.string().max(512).optional(),
  model_code: ModelCode.optional(),
});
export type PublicTrackRequest = z.infer<typeof PublicTrackRequest>;
