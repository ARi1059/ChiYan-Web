/**
 * Public Visits 仓储 — drizzle/node-postgres 实现（H5 埋点写入）。
 *
 * 隐私约束：ip_hash 必须是 SHA-256 hex（64 字符），原文 IP 永不入参 —
 * handler 上游先调 ip-hash.ts 转换。
 *
 * 写路径：POST /public/track 调 recordVisit；附 Cache-Control: no-store 在 route 层。
 * 读路径：当前无管理端 endpoint 消费；仅测试通过 _getVisitsForTests 查回核对。
 */

import { and, asc, gte, isNotNull, sql } from "drizzle-orm";
import { schema } from "@chiyan/db";
import { getDb } from "./db";

const { publicVisits } = schema;

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

type Row = typeof publicVisits.$inferSelect;

function toDomain(r: Row): VisitRecord {
  return {
    id: r.id,
    path: r.path,
    referrer: r.referrer,
    model_id: r.modelId,
    ip_hash: r.ipHash,
    ua: r.ua,
    country: r.country,
    city: r.city,
    created_at: r.createdAt,
  };
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
  const db = getDb();
  const [row] = await db
    .insert(publicVisits)
    .values({
      path: input.path,
      referrer: input.referrer ?? null,
      modelId: input.model_id ?? null,
      ipHash: input.ip_hash ?? null,
      ua: input.ua ?? null,
      country: input.country ?? null,
      city: input.city ?? null,
    })
    .returning({ id: publicVisits.id });
  return { id: row!.id };
}

// ─── 看板聚合（GET /admin/stats）──────────────────────────────────
//
// 三个查询都吃 public_visits_created_idx / public_visits_model_created_idx。
// "今日"窗口由 handler 传 since（UTC 当天 00:00），与 public/today 的 UTC 口径一致。

/** [since, now) 的访问总数（PV）。 */
export async function countVisitsSince(since: Date): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(publicVisits)
    .where(gte(publicVisits.createdAt, since));
  return rows[0]?.c ?? 0;
}

/** [since, now) 的去重访客数（UV，按 ip_hash distinct；ip_hash 为空的不计）。 */
export async function countUniqueVisitorsSince(since: Date): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ c: sql<number>`count(distinct ${publicVisits.ipHash})::int` })
    .from(publicVisits)
    .where(and(gte(publicVisits.createdAt, since), isNotNull(publicVisits.ipHash)));
  return rows[0]?.c ?? 0;
}

/** [since, now) 按 model_id 聚合的访问热度，降序取前 limit（仅含带 model_id 的访问）。 */
export async function topModelsByVisitsSince(
  since: Date,
  limit: number,
): Promise<Array<{ model_id: number; visits: number }>> {
  const db = getDb();
  const rows = await db
    .select({
      model_id: publicVisits.modelId,
      visits: sql<number>`count(*)::int`,
    })
    .from(publicVisits)
    .where(and(gte(publicVisits.createdAt, since), isNotNull(publicVisits.modelId)))
    .groupBy(publicVisits.modelId)
    .orderBy(sql`count(*) desc`)
    .limit(limit);
  return rows.map((r) => ({ model_id: r.model_id as number, visits: r.visits }));
}

export async function _getVisitsForTests(): Promise<VisitRecord[]> {
  const db = getDb();
  const rows = await db.query.publicVisits.findMany({
    orderBy: [asc(publicVisits.id)],
  });
  return rows.map(toDomain);
}

export async function _resetVisitsRepoForTests(): Promise<void> {
  const db = getDb();
  await db.execute(sql`TRUNCATE TABLE public_visits RESTART IDENTITY`);
}
