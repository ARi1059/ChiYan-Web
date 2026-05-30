/**
 * Drizzle 迁移 runner（dev / staging / prod 共用）。
 *
 * 用法：
 *   DATABASE_URL='postgresql://...' tsx scripts/migrate.ts
 *   pnpm db:migrate
 *
 * 部署架构：CI 在 deploy 前跑这个；本机开发首次创建 chiyan_dev / chiyan_test 后跑一次。
 * 幂等：drizzle-orm 用 __drizzle_migrations 表记录已 apply 的 hash，重复跑 no-op。
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import pg from "pg";

const { Pool } = pg;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }
  const here = dirname(fileURLToPath(import.meta.url));
  const migrationsFolder = resolve(here, "..", "drizzle");
  // eslint-disable-next-line no-console
  console.log(`[migrate] target: ${url.replace(/\/\/[^@]+@/, "//***@")}`);
  // eslint-disable-next-line no-console
  console.log(`[migrate] folder: ${migrationsFolder}`);

  const pool = new Pool({ connectionString: url, max: 2 });
  const db = drizzle(pool);
  try {
    await migrate(db, { migrationsFolder });
    // eslint-disable-next-line no-console
    console.log("[migrate] done");
  } finally {
    await pool.end();
  }
}

await main();
