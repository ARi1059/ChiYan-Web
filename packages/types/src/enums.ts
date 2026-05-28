/**
 * 业务 enum 字面量数组（zod 友好）。
 *
 * **source of truth 是 packages/db**：本文件从 @chiyan/db re-export 同一份字面量数组，
 * apps/api/src/lib/enum-drift.test.ts 做运行时 deep-equal 兜底，确保 db 加新 enum 值时
 * types 不会静默漂移。这里 re-export 的好处是 zod schema 写 `z.enum(adminRoleValues)`
 * 就拿到与数据库完全对齐的 union。
 */
export {
  adminRoleValues,
  adminStatusValues,
  modelStatusValues,
  scheduleStatusValues,
  mediaTypeValues,
} from "@chiyan/db";

import type {
  adminRoleValues,
  adminStatusValues,
  modelStatusValues,
  scheduleStatusValues,
  mediaTypeValues,
} from "@chiyan/db";

export type AdminRole = (typeof adminRoleValues)[number];
export type AdminStatus = (typeof adminStatusValues)[number];
export type ModelStatus = (typeof modelStatusValues)[number];
export type ScheduleStatus = (typeof scheduleStatusValues)[number];
export type MediaType = (typeof mediaTypeValues)[number];
