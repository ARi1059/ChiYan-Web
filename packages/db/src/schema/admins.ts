/**
 * Admin 后台账号 + 密码历史。
 *
 * 对应接口方案 §2.2 Admin + §3.1.1 密码 history（不复用最近 5 次）。
 *
 * 设计要点：
 * - username 唯一，业主决策：不存手机号/邮箱
 * - password_hash bcrypt cost 12
 * - totp_secret_enc AES-256-GCM 加密落库（bytea，version-prefix）
 * - failed_login_count + locked_until 实现登录锁定状态机
 * - 软删：status='disabled'，不物理删除
 */
import { sql } from "drizzle-orm";
import {
  bigserial,
  bigint,
  boolean,
  index,
  pgEnum,
  pgTable,
  smallint,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { bytea } from "./_shared";

export const adminRoleValues = ["owner", "admin", "operator"] as const;
export const adminStatusValues = ["active", "disabled"] as const;

export const adminRoleEnum = pgEnum("admin_role", adminRoleValues);
export const adminStatusEnum = pgEnum("admin_status", adminStatusValues);

export const admins = pgTable(
  "admins",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    username: varchar("username", { length: 64 }).notNull(),
    displayName: varchar("display_name", { length: 64 }).notNull(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    role: adminRoleEnum("role").notNull(),
    totpSecretEnc: bytea("totp_secret_enc"),
    totpEnrolled: boolean("totp_enrolled").notNull().default(false),
    mustChangePassword: boolean("must_change_password").notNull().default(true),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true, mode: "date" }),
    failedLoginCount: smallint("failed_login_count").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true, mode: "date" }),
    status: adminStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    uniqueIndex("admins_username_uniq").on(t.username),
    index("admins_status_idx").on(t.status),
  ],
);

/**
 * 密码历史：改密时插入旧 hash；验证新密码是否在最近 5 条内复用。
 * 仅查最近 N 条，不查询单条，所以 (admin_id, created_at desc) 复合索引足够。
 */
export const adminPasswordHistory = pgTable(
  "admin_password_history",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    adminId: bigint("admin_id", { mode: "number" })
      .notNull()
      .references(() => admins.id, { onDelete: "cascade" }),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [index("admin_password_history_admin_created_idx").on(t.adminId, t.createdAt.desc())],
);

export type Admin = typeof admins.$inferSelect;
export type NewAdmin = typeof admins.$inferInsert;
export type AdminPasswordHistory = typeof adminPasswordHistory.$inferSelect;
