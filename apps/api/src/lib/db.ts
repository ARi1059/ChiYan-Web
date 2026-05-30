/**
 * 进程级 Drizzle DB 单例。
 *
 * 注入方式：server.ts / dev-with-seed.ts / vitest.setup.ts 在进程启动时调 setDb(createDb(url))。
 * 业务侧（repo 层）只调 getDb() 拿引用；无需把 db 实例作为参数传递，也不需要 Hono Bindings。
 *
 * 这样选择的理由：
 *  - Node 单进程单事件循环，没有 race；vitest 配 singleThread 也避免测试并发
 *  - repo 函数签名零改动：所有 (input) → Promise<record> 不带 db 参数的接口完整保留
 *  - 测试 ENV.DATABASE_URL 仍是 zod schema 占位（"postgres://test"），不再被消费
 *
 * 调试：getDb() 抛错时打印 "did you forget to call setDb()?"，方便定位 setup 顺序问题。
 */
import type { Db } from "@chiyan/db";

let _db: Db | undefined;

export function setDb(d: Db): void {
  _db = d;
}

export function getDb(): Db {
  if (!_db) {
    throw new Error(
      "[db] getDb() called before setDb() — check server.ts / vitest.setup.ts / dev-with-seed.ts initialization order",
    );
  }
  return _db;
}

export function hasDb(): boolean {
  return _db !== undefined;
}
