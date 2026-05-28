/**
 * 跨表共用的 enum 字面量。
 *
 * 当前阶段单表 enum 直接挂在主表文件里（admins.ts、models.ts 等），
 * 这里只放跨表共用的；现阶段没有，先占位。
 *
 * 同时这里集中导出**字面量数组**（字符串 union 的 source of truth）
 * 给 packages/types 做漂移校验：types 包从这里 import 数组，
 * 用 z.enum(...) 构造 zod schema，CI 跑 enums.test.ts deep-equal 锁住。
 */
export {};
