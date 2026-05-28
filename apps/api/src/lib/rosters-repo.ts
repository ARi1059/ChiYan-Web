/**
 * Daily Roster 仓储 —— 公开读 + 管理写。
 *
 * Phase 2 mock：date 作主键模拟 unique。
 * 公开域：findByDate（today endpoint 用）。
 * 管理域：upsertRoster / deleteByDate / findByDateRange（PUT/COPY/DELETE/history endpoint 用）。
 *
 * 6 条约定对齐 admin-repo.ts。
 */

export interface RosterRecord {
  id: number;
  date: string;          // 'YYYY-MM-DD'
  model_ids: number[];
  note: string | null;
  created_by: number;
  created_at: Date;
  updated_at: Date;
}

const rostersByDate = new Map<string, RosterRecord>();
let nextRosterId = 1;

function clone(r: RosterRecord): RosterRecord {
  return { ...r, model_ids: [...r.model_ids] };
}

export async function findByDate(date: string): Promise<RosterRecord | undefined> {
  const r = rostersByDate.get(date);
  return r ? clone(r) : undefined;
}

export interface UpsertRosterInput {
  date: string;
  model_ids: number[];
  note?: string | null;
  created_by: number;
}

export async function upsertRoster(input: UpsertRosterInput): Promise<RosterRecord> {
  const existing = rostersByDate.get(input.date);
  const now = new Date();
  const full: RosterRecord = existing
    ? {
        ...existing,
        model_ids: [...input.model_ids],
        note: input.note ?? null,
        updated_at: now,
      }
    : {
        id: nextRosterId++,
        date: input.date,
        model_ids: [...input.model_ids],
        note: input.note ?? null,
        created_by: input.created_by,
        created_at: now,
        updated_at: now,
      };
  rostersByDate.set(input.date, full);
  return clone(full);
}

/** @deprecated 测试历史用法保留；生产代码请用 upsertRoster。 */
export async function _upsertRosterForTests(input: UpsertRosterInput): Promise<RosterRecord> {
  return upsertRoster(input);
}

export async function deleteByDate(date: string): Promise<boolean> {
  return rostersByDate.delete(date);
}

/** history endpoint 用：返 [from, to] 内全部记录，按日期升序。 */
export async function findByDateRange(from: string, to: string): Promise<RosterRecord[]> {
  const out: RosterRecord[] = [];
  for (const r of rostersByDate.values()) {
    if (r.date >= from && r.date <= to) out.push(clone(r));
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

export function _resetRostersRepoForTests(): void {
  rostersByDate.clear();
  nextRosterId = 1;
}
