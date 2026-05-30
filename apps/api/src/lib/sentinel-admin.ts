/**
 * Sentinel admin（id=1）—— 测试期所有 created_by / uploaded_by 默认值的 FK target。
 *
 * 为什么需要：
 *  - admin-repo 还是 in-memory mock，没真正写 drizzle admins 表
 *  - 但 daily_rosters.created_by / media_assets.uploaded_by 是 admins.id 的真 FK
 *  - 任何创建 roster / media 的测试都会撞 FK，除非有一个真实 admin 行
 *
 * vitest.setup.ts 进程级调一次；_resetModelsRepoForTests TRUNCATE 后也重种一次。
 * admin-repo 切 drizzle 后这个 helper 可以删，sentinel 通过普通 _insertForTests
 * 路径产生即可。
 */

import { sql } from "drizzle-orm";
import { schema } from "@chiyan/db";
import { getDb } from "./db";

const { admins } = schema;

export async function ensureSentinelAdmin(): Promise<void> {
  const db = getDb();
  await db
    .insert(admins)
    .values({
      id: 1,
      username: "__sentinel__",
      displayName: "sentinel",
      passwordHash: "$2a$12$" + "x".repeat(53), // 占位 bcrypt 长度，不被消费
      role: "owner",
      totpEnrolled: false,
      mustChangePassword: false,
      failedLoginCount: 0,
      status: "active",
    })
    .onConflictDoNothing({ target: admins.id });
  // 显式 id=1 不自动 bump bigserial 序列；下一次 RESTART IDENTITY 后没有这一步，
  // 之后的 createAdmin / _insertForTests 会再分配 id=1 撞 pkey。把序列推到 max(id)+1。
  await db.execute(
    sql`SELECT setval(pg_get_serial_sequence('admins','id'), GREATEST(1, (SELECT MAX(id) FROM admins)))`,
  );
}
