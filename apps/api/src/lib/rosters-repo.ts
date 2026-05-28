/**
 * Daily Roster 仓储（公开域只读 + 测试 upsert）。
 *
 * Phase 2 mock：date 作主键模拟 unique。
 * 写路径（PUT /admin/roster）走 Admin Step（Phase 3），这里只暴露公开 read 用。
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

export async function _upsertRosterForTests(input: {
  date: string;
  model_ids: number[];
  note?: string | null;
  created_by: number;
}): Promise<RosterRecord> {
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

export function _resetRostersRepoForTests(): void {
  rostersByDate.clear();
  nextRosterId = 1;
}
