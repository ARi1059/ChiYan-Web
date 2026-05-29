import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema/index";

const { Pool } = pg;

export function createDb(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl, max: 10 });
  return drizzle(pool, { schema });
}

export type Db = ReturnType<typeof createDb>;
