/**
 * Public Visits 仓储（H5 埋点写入）。
 *
 * Phase 2 mock：append-only 数组。
 * 隐私约束：ip_hash 必须是 SHA-256 hex（64 字符），原文 IP 永不入参 —
 * handler 上游先调 ip-hash.ts 转换。
 *
 * 6 条约定对齐 admin-repo.ts。
 */

export interface VisitRecord {
  id: number;
  path: string;
  referrer: string | null;
  model_id: number | null;
  ip_hash: string | null;
  ua: string | null;
  country: string | null;
  city: string | null;
  created_at: Date;
}

const visits: VisitRecord[] = [];
let nextVisitId = 1;

function clone(v: VisitRecord): VisitRecord {
  return { ...v };
}

export async function recordVisit(input: {
  path: string;
  referrer?: string | null;
  model_id?: number | null;
  ip_hash?: string | null;
  ua?: string | null;
  country?: string | null;
  city?: string | null;
}): Promise<{ id: number }> {
  const v: VisitRecord = {
    id: nextVisitId++,
    path: input.path,
    referrer: input.referrer ?? null,
    model_id: input.model_id ?? null,
    ip_hash: input.ip_hash ?? null,
    ua: input.ua ?? null,
    country: input.country ?? null,
    city: input.city ?? null,
    created_at: new Date(),
  };
  visits.push(v);
  return { id: v.id };
}

export function _getVisitsForTests(): VisitRecord[] {
  return visits.map(clone);
}

export function _resetVisitsRepoForTests(): void {
  visits.length = 0;
  nextVisitId = 1;
}
