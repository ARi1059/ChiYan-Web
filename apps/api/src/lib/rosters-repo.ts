/**
 * Daily Roster 仓储 — drizzle/node-postgres 实现。公开读 + 管理写。
 *
 * 公开域：findByDate（GET /public/today 用）。
 * 管理域：upsertRoster / deleteByDate / findByDateRange（PUT/COPY/DELETE/history endpoint 用）。
 *
 * 设计点：
 *  - date 在 schema 上 uniqueIndex；upsert 用 onConflictDoUpdate 走 daily_rosters_date_uniq
 *  - model_ids 是 jsonb<number[]>；drizzle $type 自动序列化
 *  - findByDateRange 升序，与现有 history endpoint 契约一致
 */

import { and, asc, between, eq } from "drizzle-orm";
import { schema } from "@chiyan/db";
import { getDb } from "./db";

const { dailyRosters } = schema;

export interface RosterRecord {
  id: number;
  date: string;          // 'YYYY-MM-DD'
  model_ids: number[];
  note: string | null;
  created_by: number;
  created_at: Date;
  updated_at: Date;
}

type Row = typeof dailyRosters.$inferSelect;

function toDomain(r: Row): RosterRecord {
  return {
    id: r.id,
    date: r.date,
    model_ids: r.modelIds,
    note: r.note,
    created_by: r.createdBy,
    created_at: r.createdAt,
    updated_at: r.updatedAt,
  };
}

export async function findByDate(date: string): Promise<RosterRecord | undefined> {
  const db = getDb();
  const r = await db.query.dailyRosters.findFirst({
    where: eq(dailyRosters.date, date),
  });
  return r ? toDomain(r) : undefined;
}

export interface UpsertRosterInput {
  date: string;
  model_ids: number[];
  note?: string | null;
  created_by: number;
}

export async function upsertRoster(input: UpsertRosterInput): Promise<RosterRecord> {
  const db = getDb();
  const [row] = await db
    .insert(dailyRosters)
    .values({
      date: input.date,
      modelIds: input.model_ids,
      note: input.note ?? null,
      createdBy: input.created_by,
    })
    .onConflictDoUpdate({
      target: dailyRosters.date,
      set: {
        modelIds: input.model_ids,
        note: input.note ?? null,
        updatedAt: new Date(),
      },
    })
    .returning();
  return toDomain(row!);
}

/** @deprecated 测试历史用法保留；生产代码请用 upsertRoster。 */
export async function _upsertRosterForTests(input: UpsertRosterInput): Promise<RosterRecord> {
  return upsertRoster(input);
}

export async function deleteByDate(date: string): Promise<boolean> {
  const db = getDb();
  const out = await db.delete(dailyRosters).where(eq(dailyRosters.date, date)).returning({ id: dailyRosters.id });
  return out.length > 0;
}

/** history endpoint 用：返 [from, to] 内全部记录，按日期升序。 */
export async function findByDateRange(from: string, to: string): Promise<RosterRecord[]> {
  const db = getDb();
  const rows = await db.query.dailyRosters.findMany({
    where: and(between(dailyRosters.date, from, to)),
    orderBy: [asc(dailyRosters.date)],
  });
  return rows.map(toDomain);
}

export async function _resetRostersRepoForTests(): Promise<void> {
  // 注意：_resetModelsRepoForTests 已经 TRUNCATE daily_rosters（CASCADE），所以
  // 当两者按 beforeEach 顺序串行调用时这里是 no-op。单独跑也安全：再 TRUNCATE 一次。
  const db = getDb();
  await db.delete(dailyRosters);
}
