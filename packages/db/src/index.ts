/**
 * @chiyan/db 公共导出。
 *
 * - `schema`：drizzle 表对象 + relations，apps/api 用 `db.query.<table>.findFirst()` 等
 * - `createDb`：传入 DATABASE_URL 后实例化（pg Pool + drizzle/node-postgres）
 * - 顶层 re-export enum 字面量数组：packages/types 直接 import 这些数组构造 zod enum
 */
export * as schema from "./schema/index";
export { createDb, type Db } from "./client";
export {
  adminRoleValues,
  adminStatusValues,
  modelStatusValues,
  scheduleStatusValues,
  mediaTypeValues,
} from "./schema/index";
