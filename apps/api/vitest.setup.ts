/**
 * Vitest 全局 setup —— 进程级一次性接通测试 DB。
 *
 * 流程：
 *  1. 连 chiyan_test 数据库（默认 postgresql://chiyan:dev@127.0.0.1:5432/chiyan_test，
 *     可用 TEST_DATABASE_URL 覆盖）
 *  2. drizzle migrate 到最新版本（幂等，重复跑 no-op）
 *  3. setDb 让 repo 层 getDb() 拿到引用
 *  4. ensureStudioSettingsSeed 兜底（所有 _flow_*.test.ts 都直接消费 settings）
 *  5. seedSentinelAdmin —— rosters / media / 任何 created_by / uploaded_by = 1 的 FK target；
 *     _resetModelsRepoForTests 会 TRUNCATE admins 然后自己重种，其它 reset 不动 admins。
 *
 * 串行：vitest.config.ts 配 singleThread:true + isolate:false，避免多 worker 共用同一台 DB 写冲突。
 * 每个测试 beforeEach 调 _resetXxxForTests TRUNCATE，已存在的 hooks 自动适配新实现。
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import pg from "pg";
import * as schema from "@chiyan/db/schema";
import { setDb } from "./src/lib/db";
import { ensureStudioSettingsSeed } from "./src/lib/studio-info-repo";
import { ensureSentinelAdmin } from "./src/lib/sentinel-admin";

const { Pool } = pg;

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://chiyan:dev@127.0.0.1:5432/chiyan_test";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = resolve(here, "..", "..", "packages", "db", "drizzle");

const pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
const db = drizzle(pool, { schema });

await migrate(db, { migrationsFolder });
setDb(db);
await ensureStudioSettingsSeed();
await ensureSentinelAdmin();
