/**
 * 模特档期 schedule_entries 仓储 — drizzle/node-postgres。
 *
 * 接口方案 §4.10：
 *  - GET  /admin/schedule?from=...&to=...&model_id=?    范围查询
 *  - PUT  /admin/schedule { model_id, date, status, note? }  upsert
 *  - DELETE /admin/schedule/{model_id}/{date}           取消该天该模特状态
 *
 * 唯一约束 (model_id, date)；upsert 走 onConflictDoUpdate。
 * status 三态：available / booked / tentative；用 enum 兜底 zod 校验。
 */

import { and, asc, between, eq } from "drizzle-orm";
import { schema } from "@chiyan/db";
import { getDb } from "./db";

const { scheduleEntries } = schema;

export type ScheduleStatus = "available" | "booked" | "tentative";

export interface ScheduleEntryRecord {
  id: number;
  model_id: number;
  date: string;
  status: ScheduleStatus;
  note: string | null;
  created_at: Date;
  updated_at: Date;
}

type Row = typeof scheduleEntries.$inferSelect;

function toDomain(r: Row): ScheduleEntryRecord {
  return {
    id: r.id,
    model_id: r.modelId,
    date: r.date,
    status: r.status,
    note: r.note,
    created_at: r.createdAt,
    updated_at: r.updatedAt,
  };
}

export interface FindScheduleOpts {
  from: string;
  to: string;
  model_id?: number;
}

/** 范围查询：日期升序 + model_id 升序，前端按 (date, model) 分组好用。 */
export async function findScheduleInRange(opts: FindScheduleOpts): Promise<ScheduleEntryRecord[]> {
  const db = getDb();
  const conds = [between(scheduleEntries.date, opts.from, opts.to)];
  if (opts.model_id !== undefined) conds.push(eq(scheduleEntries.modelId, opts.model_id));
  const rows = await db.query.scheduleEntries.findMany({
    where: and(...conds),
    orderBy: [asc(scheduleEntries.date), asc(scheduleEntries.modelId)],
  });
  return rows.map(toDomain);
}

export interface UpsertScheduleInput {
  model_id: number;
  date: string;
  status: ScheduleStatus;
  note?: string | null;
}

export async function upsertScheduleEntry(
  input: UpsertScheduleInput,
): Promise<ScheduleEntryRecord> {
  const db = getDb();
  const [row] = await db
    .insert(scheduleEntries)
    .values({
      modelId: input.model_id,
      date: input.date,
      status: input.status,
      note: input.note ?? null,
    })
    .onConflictDoUpdate({
      target: [scheduleEntries.modelId, scheduleEntries.date],
      set: {
        status: input.status,
        note: input.note ?? null,
        updatedAt: new Date(),
      },
    })
    .returning();
  return toDomain(row!);
}

export async function deleteScheduleEntry(model_id: number, date: string): Promise<boolean> {
  const db = getDb();
  const out = await db
    .delete(scheduleEntries)
    .where(and(eq(scheduleEntries.modelId, model_id), eq(scheduleEntries.date, date)))
    .returning({ id: scheduleEntries.id });
  return out.length > 0;
}

export async function _resetScheduleRepoForTests(): Promise<void> {
  const db = getDb();
  await db.delete(scheduleEntries);
}
