/**
 * 后台接口 schema（接口方案 §4.3–4.8）。
 *
 * 鉴权字段：所有 /admin/* 都要求 access token + CSRF；schema 不带 token 字段。
 *
 * 文件聚合：models / roster / media / schedule / accounts / audit-logs 全部塞这一个文件，
 * 避免按 endpoint 拆零碎；通过 ─── 分隔。
 */
import { z } from "zod";
import {
  adminRoleValues,
  adminStatusValues,
  mediaTypeValues,
  modelStatusValues,
  scheduleStatusValues,
} from "./enums";

const ModelCode = z.string().regex(/^M-\d{4}-\d{4}$/);
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// ═══════════════════════════════════════════════════════════════
// §4.3 模特管理
// ═══════════════════════════════════════════════════════════════

export const AdminModelsQuery = z.object({
  status: z.enum(modelStatusValues).optional(),
  type: z.string().optional(),
  style: z.string().optional(),
  q: z.string().max(64).optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
});
export type AdminModelsQuery = z.infer<typeof AdminModelsQuery>;

const PortfolioItem = z.object({
  brand: z.string(),
  project: z.string().optional(),
  year: z.number().int().optional(),
  cover_asset_id: z.number().int().optional(),
});

export const AdminModelDetail = z.object({
  id: z.number().int(),
  code: ModelCode,
  nickname: z.string(),
  real_name: z.string().optional(),
  height_cm: z.number().int().optional(),
  weight_kg: z.number().int().optional(),
  bust: z.number().int().optional(),
  waist: z.number().int().optional(),
  hip: z.number().int().optional(),
  shoe_size_eu: z.number().int().optional(),
  age_range: z.string().optional(),
  hometown: z.string().optional(),
  city: z.string().optional(),
  style_tags: z.array(z.string()),
  available_types: z.array(z.string()),
  can_remote: z.boolean(),
  is_minor: z.boolean(),
  cover_asset_id: z.number().int().optional(),
  gallery_asset_ids: z.array(z.number().int()),
  portfolio: z.array(PortfolioItem),
  cooperation_history: z.array(z.string()),
  status: z.enum(modelStatusValues),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type AdminModelDetail = z.infer<typeof AdminModelDetail>;

export const AdminCreateModelRequest = AdminModelDetail.omit({
  id: true,
  status: true,
  created_at: true,
  updated_at: true,
}).partial({
  real_name: true,
  height_cm: true,
  weight_kg: true,
  bust: true,
  waist: true,
  hip: true,
  shoe_size_eu: true,
  age_range: true,
  hometown: true,
  city: true,
  cover_asset_id: true,
});
export type AdminCreateModelRequest = z.infer<typeof AdminCreateModelRequest>;

export const AdminUpdateModelRequest = AdminCreateModelRequest.partial();
export type AdminUpdateModelRequest = z.infer<typeof AdminUpdateModelRequest>;

export const AdminBatchImportRequest = z.object({
  rows: z.array(AdminCreateModelRequest).min(1).max(200),
});
export type AdminBatchImportRequest = z.infer<typeof AdminBatchImportRequest>;

// ═══════════════════════════════════════════════════════════════
// §4.4 当日名单
// ═══════════════════════════════════════════════════════════════

export const AdminRosterQuery = z.object({ date: IsoDate });
export type AdminRosterQuery = z.infer<typeof AdminRosterQuery>;

export const AdminRosterPutRequest = z.object({
  date: IsoDate,
  model_ids: z.array(z.number().int()),
  note: z.string().max(500).optional(),
});
export type AdminRosterPutRequest = z.infer<typeof AdminRosterPutRequest>;

export const AdminRosterCopyQuery = z.object({ from: IsoDate, to: IsoDate });
export type AdminRosterCopyQuery = z.infer<typeof AdminRosterCopyQuery>;

export const AdminRosterHistoryQuery = z.object({ from: IsoDate, to: IsoDate });
export type AdminRosterHistoryQuery = z.infer<typeof AdminRosterHistoryQuery>;

export const AdminRosterResponse = z.object({
  date: IsoDate,
  model_ids: z.array(z.number().int()),
  note: z.string().nullable(),
  created_by: z.number().int(),
  updated_at: z.string().datetime(),
});
export type AdminRosterResponse = z.infer<typeof AdminRosterResponse>;

// ═══════════════════════════════════════════════════════════════
// §4.5 媒体
// ═══════════════════════════════════════════════════════════════

export const AdminMediaSignRequest = z.object({
  type: z.enum(mediaTypeValues),
  filename: z.string().max(255),
  content_type: z.string().max(64),
  size: z
    .number()
    .int()
    .min(1)
    .max(100 * 1024 * 1024),
});
export type AdminMediaSignRequest = z.infer<typeof AdminMediaSignRequest>;

export const AdminMediaSignResponse = z.object({
  upload_url: z.string().url(),
  object_key: z.string(),
  expires_at: z.string().datetime(),
});
export type AdminMediaSignResponse = z.infer<typeof AdminMediaSignResponse>;

export const AdminMediaRegisterRequest = z.object({
  object_key: z.string(),
  type: z.enum(mediaTypeValues),
  model_id: z.number().int().optional(),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
  file_size: z.number().int(),
  hash: z.string().regex(/^[0-9a-f]{64}$/),
});
export type AdminMediaRegisterRequest = z.infer<typeof AdminMediaRegisterRequest>;

export const AdminMediaQuery = z.object({
  model_id: z.coerce.number().int().optional(),
  type: z.enum(mediaTypeValues).optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(40),
});
export type AdminMediaQuery = z.infer<typeof AdminMediaQuery>;

export const AdminMediaPatchRequest = z.object({
  is_cover: z.boolean().optional(),
  alt: z.string().max(255).optional(),
});
export type AdminMediaPatchRequest = z.infer<typeof AdminMediaPatchRequest>;

// ═══════════════════════════════════════════════════════════════
// §4.6 档期
// ═══════════════════════════════════════════════════════════════

export const AdminScheduleQuery = z.object({
  model_id: z.coerce.number().int(),
  from: IsoDate,
  to: IsoDate,
});
export type AdminScheduleQuery = z.infer<typeof AdminScheduleQuery>;

const ScheduleSlot = z.object({
  date: IsoDate,
  status: z.enum(scheduleStatusValues),
  note: z.string().max(200).optional(),
});

export const AdminSchedulePutRequest = z.object({
  model_id: z.number().int(),
  entries: z.array(ScheduleSlot).max(60),
});
export type AdminSchedulePutRequest = z.infer<typeof AdminSchedulePutRequest>;

export const AdminScheduleResponse = z.object({
  model_id: z.number().int(),
  entries: z.array(ScheduleSlot),
});
export type AdminScheduleResponse = z.infer<typeof AdminScheduleResponse>;

// ═══════════════════════════════════════════════════════════════
// §4.7 账号管理（Owner-only）
// ═══════════════════════════════════════════════════════════════

export const AdminAccountSummary = z.object({
  id: z.number().int(),
  username: z.string(),
  display_name: z.string(),
  role: z.enum(adminRoleValues),
  status: z.enum(adminStatusValues),
  totp_enrolled: z.boolean(),
  must_change_password: z.boolean(),
  last_login_at: z.string().datetime().nullable(),
  locked_until: z.string().datetime().nullable(),
  created_at: z.string().datetime(),
});
export type AdminAccountSummary = z.infer<typeof AdminAccountSummary>;

export const AdminCreateAccountRequest = z.object({
  username: z.string().min(3).max(64),
  display_name: z.string().min(1).max(64),
  role: z.enum(adminRoleValues),
});
export type AdminCreateAccountRequest = z.infer<typeof AdminCreateAccountRequest>;

/** 接口方案 §4.7 line 352：一次性密码明文仅返回一次。 */
export const AdminCreateAccountResponse = z.object({
  account: AdminAccountSummary,
  one_time_password: z.string(),
});
export type AdminCreateAccountResponse = z.infer<typeof AdminCreateAccountResponse>;

export const AdminUpdateAccountRequest = z.object({
  display_name: z.string().min(1).max(64).optional(),
  role: z.enum(adminRoleValues).optional(),
  status: z.enum(adminStatusValues).optional(),
});
export type AdminUpdateAccountRequest = z.infer<typeof AdminUpdateAccountRequest>;

export const AdminResetPasswordResponse = z.object({
  one_time_password: z.string(),
});
export type AdminResetPasswordResponse = z.infer<typeof AdminResetPasswordResponse>;

// ═══════════════════════════════════════════════════════════════
// §4.8 审计日志
// ═══════════════════════════════════════════════════════════════

export const AdminAuditQuery = z.object({
  admin_id: z.coerce.number().int().optional(),
  action: z.string().max(64).optional(),
  target_type: z.string().max(32).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(50),
});
export type AdminAuditQuery = z.infer<typeof AdminAuditQuery>;

export const AdminAuditLog = z.object({
  id: z.number().int(),
  admin_id: z.number().int().nullable(),
  admin_username: z.string().nullable(),
  action: z.string(),
  target_type: z.string().nullable(),
  target_id: z.number().int().nullable(),
  payload: z.record(z.unknown()).nullable(),
  ip: z.string().nullable(),
  user_agent: z.string().nullable(),
  created_at: z.string().datetime(),
});
export type AdminAuditLog = z.infer<typeof AdminAuditLog>;
