/**
 * Models 仓储 — drizzle/node-postgres 实现。单存储双视图：
 *  - 公开视角（findActiveByCode / findActiveByIds / listActive / findCoverAndGalleryAssets）
 *    返 ModelRecord / ImageAsset，刻意 strip real_name_enc / original_url
 *  - 管理视角（adminListModels / adminFindModelByXxx / adminCreateModel / ... / adminListMedia / ...）
 *    返 AdminModelRecord / AdminMediaRecord，含 real_name_enc / original_url / hash / file_size 等
 *
 * 域到 schema 字段映射：drizzle 选出来的 camelCase row（heightCm/qqGroup/...）
 * 在 toModelDomain / toMediaDomain 里转回 domain snake_case（height_cm/qq/...），
 * 让 7 个 route handler + 6 个测试文件 0 改动。
 *
 * 冲突错误：catch pg 错误码 23505（唯一约束）后映射成 ModelsRepoConflictError，
 * 按 constraint name 区分 code/hash 冲突。
 *
 * 跨表写（adminUpdateMedia.is_cover 同步 models.cover_asset_id）放 db.transaction()。
 */

import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { schema } from "@chiyan/db";
import type { pub } from "@chiyan/types";
import { getDb } from "./db";
import { ensureSentinelAdmin } from "./sentinel-admin";

type ImageAsset = pub.ImageAsset;

const models = schema.models;
const mediaAssets = schema.mediaAssets;
const admins = schema.admins;

// ─── 公开 / 管理类型（接口签名保留） ──────────────────────────────

export type ModelStatus = "active" | "archived";

export interface MediaAssetRecord {
  id: number;
  model_id: number | null;
  type: "image" | "video";
  url: string;
  thumb_url: string | null;
  width: number | null;
  height: number | null;
  has_watermark: boolean;
}

export interface ModelPortfolioItem {
  brand: string;
  project?: string;
  year?: number;
  cover_asset_id?: number;
}

export interface ModelCooperationItem {
  brand: string;
  project?: string;
  year?: number;
}

export interface ModelRecord {
  id: number;
  code: string;
  nickname: string;
  status: ModelStatus;
  height_cm: number | null;
  weight_kg: number | null;
  bust: number | null;
  waist: number | null;
  hip: number | null;
  shoe_size_eu: number | null;
  age_range: string | null;
  age: number | null;
  hometown: string | null;
  city: string | null;
  district: string | null;
  qq: string | null;
  style_tags: string[];
  available_types: string[];
  can_remote: boolean;
  is_minor: boolean;
  cover_asset_id: number | null;
  gallery_asset_ids: number[];
  portfolio: ModelPortfolioItem[];
  cooperation_history: ModelCooperationItem[];
  created_at: Date;
  updated_at: Date;
}

export interface AdminModelRecord extends ModelRecord {
  real_name_enc: Uint8Array | null;
}

export interface AdminMediaRecord extends MediaAssetRecord {
  original_url: string;
  file_size: number;
  hash: string;
  uploaded_by: number;
  uploaded_at: Date;
}

export interface ListActiveOpts {
  type?: string;
  style?: string;
  q?: string;
  page: number;
  page_size: number;
}

export class ModelsRepoConflictError extends Error {
  constructor(public field: string) {
    super(`conflict on ${field}`);
    this.name = "ModelsRepoConflictError";
  }
}

// ─── 字段映射 helpers ──────────────────────────────────────────────

type ModelRow = typeof models.$inferSelect;
type MediaRow = typeof mediaAssets.$inferSelect;

/**
 * schema 把 portfolio / cooperation_history 标为 `Record<string, unknown>[]`（jsonb 通用）；
 * domain 用了 ModelPortfolioItem / ModelCooperationItem（有具名字段）。
 * 写入 jsonb 时用 toJsonb 退化为通用 Record；读出时直接 cast 回 domain 形态。
 */
function toJsonb<T>(arr: T[] | undefined): Record<string, unknown>[] | undefined {
  return arr as unknown as Record<string, unknown>[] | undefined;
}

function toModelDomain(r: ModelRow): ModelRecord {
  return {
    id: r.id,
    code: r.code,
    nickname: r.nickname,
    status: r.status,
    height_cm: r.heightCm,
    weight_kg: r.weightKg,
    bust: r.bust,
    waist: r.waist,
    hip: r.hip,
    shoe_size_eu: r.shoeSizeEu,
    age_range: r.ageRange,
    age: r.age,
    hometown: r.hometown,
    city: r.city,
    district: r.district,
    qq: r.qq,
    style_tags: r.styleTags,
    available_types: r.availableTypes,
    can_remote: r.canRemote,
    is_minor: r.isMinor,
    cover_asset_id: r.coverAssetId,
    gallery_asset_ids: r.galleryAssetIds,
    portfolio: r.portfolio as unknown as ModelPortfolioItem[],
    cooperation_history: r.cooperationHistory as unknown as ModelCooperationItem[],
    created_at: r.createdAt,
    updated_at: r.updatedAt,
  };
}

function toAdminModelDomain(r: ModelRow): AdminModelRecord {
  return { ...toModelDomain(r), real_name_enc: r.realNameEnc ?? null };
}

function toMediaDomain(r: MediaRow): MediaAssetRecord {
  return {
    id: r.id,
    model_id: r.modelId,
    type: r.type,
    url: r.url,
    thumb_url: r.thumbUrl,
    width: r.width,
    height: r.height,
    has_watermark: r.hasWatermark,
  };
}

function toAdminMediaDomain(r: MediaRow): AdminMediaRecord {
  return {
    ...toMediaDomain(r),
    original_url: r.originalUrl,
    file_size: r.fileSize ?? 0,
    hash: r.hash,
    uploaded_by: r.uploadedBy,
    uploaded_at: r.uploadedAt,
  };
}

function isUniqueViolation(e: unknown): { code: string; constraint?: string } | null {
  if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "23505") {
    const constraint = (e as { constraint?: string }).constraint;
    return { code: "23505", constraint };
  }
  return null;
}

// ─── 公开视角 ──────────────────────────────────────────────────────

/**
 * 三态返回（handler 翻译为 200/404/410）：
 *  - 'not_found'  → handler 回 40401
 *  - 'archived'   → handler 回 41001 sub_code=archived（必须 Cache-Control: no-store）
 *  - ModelRecord  → handler 回 200
 */
export async function findActiveByCode(
  code: string,
): Promise<ModelRecord | "not_found" | "archived"> {
  const db = getDb();
  const r = await db.query.models.findFirst({ where: eq(models.code, code) });
  if (!r) return "not_found";
  if (r.status === "archived") return "archived";
  return toModelDomain(r);
}

/** today endpoint 使用：按入参顺序，跳过 archived/缺失（drizzle inArray 不保序，客户端 reorder）。 */
export async function findActiveByIds(ids: number[]): Promise<ModelRecord[]> {
  if (ids.length === 0) return [];
  const db = getDb();
  const rows = await db.query.models.findMany({
    where: and(inArray(models.id, ids), eq(models.status, "active")),
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const out: ModelRecord[] = [];
  for (const id of ids) {
    const r = byId.get(id);
    if (r) out.push(toModelDomain(r));
  }
  return out;
}

export async function listActive(
  opts: ListActiveOpts,
): Promise<{ items: ModelRecord[]; total: number }> {
  const db = getDb();
  const conds = [eq(models.status, "active")];
  if (opts.type) {
    // jsonb ? text：available_types 数组里"包含" type
    conds.push(sql`${models.availableTypes} @> ${JSON.stringify([opts.type])}::jsonb`);
  }
  if (opts.style) {
    conds.push(sql`${models.styleTags} @> ${JSON.stringify([opts.style])}::jsonb`);
  }
  if (opts.q) {
    conds.push(sql`${models.nickname} ILIKE ${"%" + opts.q.trim() + "%"}`);
  }
  const where = conds.length === 1 ? conds[0] : and(...conds);

  const totalRow = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(models)
    .where(where);
  const total = totalRow[0]?.c ?? 0;

  const offset = Math.max(0, (opts.page - 1) * opts.page_size);
  const rows = await db
    .select()
    .from(models)
    .where(where)
    .orderBy(asc(models.id))
    .limit(opts.page_size)
    .offset(offset);

  return { items: rows.map(toModelDomain), total };
}

function mediaToImageAsset(a: MediaRow): ImageAsset {
  const width = a.width ?? 1200;
  const height = a.height ?? 1600;
  const src = a.url;
  const thumb = a.thumbUrl ?? a.url;
  return {
    src,
    srcset: { "1x": thumb, "2x": src, "3x": src },
    width,
    height,
  };
}

/**
 * 详情 / today 拼图：取 model 的 cover + gallery 全部 asset。
 * model_id 不匹配的 asset 跳过（避免越权拼图）。
 */
export async function findCoverAndGalleryAssets(
  model: Pick<ModelRecord, "id" | "cover_asset_id" | "gallery_asset_ids">,
): Promise<{ cover: ImageAsset | null; gallery: ImageAsset[] }> {
  const db = getDb();
  let cover: ImageAsset | null = null;
  if (model.cover_asset_id != null) {
    const a = await db.query.mediaAssets.findFirst({
      where: eq(mediaAssets.id, model.cover_asset_id),
    });
    if (a && (a.modelId === model.id || a.modelId == null)) {
      cover = mediaToImageAsset(a);
    }
  }
  const gallery: ImageAsset[] = [];
  if (model.gallery_asset_ids.length > 0) {
    const rows = await db.query.mediaAssets.findMany({
      where: inArray(mediaAssets.id, model.gallery_asset_ids),
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const gid of model.gallery_asset_ids) {
      const a = byId.get(gid);
      if (!a) continue;
      if (a.modelId !== model.id && a.modelId != null) continue;
      gallery.push(mediaToImageAsset(a));
    }
  }
  return { cover, gallery };
}

// ─── 测试 helpers ──────────────────────────────────────────────────

/**
 * 测试用 insert：按 code upsert（模拟"先种占位 → 再带 cover 重新种"）。
 * cover_asset_id 等可空字段输入是 null 时显式落空（不是 undefined 跳过）。
 */
export async function _insertModelForTests(
  record: Omit<ModelRecord, "id" | "created_at" | "updated_at"> &
    Partial<Pick<ModelRecord, "created_at" | "updated_at">> & {
      real_name_enc?: Uint8Array | null;
    },
): Promise<ModelRecord> {
  const db = getDb();
  const values = {
    code: record.code,
    nickname: record.nickname,
    status: record.status,
    realNameEnc: record.real_name_enc ?? null,
    heightCm: record.height_cm,
    weightKg: record.weight_kg,
    bust: record.bust,
    waist: record.waist,
    hip: record.hip,
    shoeSizeEu: record.shoe_size_eu,
    ageRange: record.age_range,
    age: record.age,
    hometown: record.hometown,
    city: record.city,
    district: record.district,
    qq: record.qq,
    styleTags: record.style_tags,
    availableTypes: record.available_types,
    canRemote: record.can_remote,
    isMinor: record.is_minor,
    coverAssetId: record.cover_asset_id,
    galleryAssetIds: record.gallery_asset_ids,
    portfolio: toJsonb(record.portfolio) ?? [],
    cooperationHistory: toJsonb(record.cooperation_history) ?? [],
    ...(record.created_at ? { createdAt: record.created_at } : {}),
    ...(record.updated_at ? { updatedAt: record.updated_at } : {}),
  };
  const [row] = await db
    .insert(models)
    .values(values)
    .onConflictDoUpdate({
      target: models.code,
      set: {
        nickname: values.nickname,
        status: values.status,
        realNameEnc: values.realNameEnc,
        heightCm: values.heightCm,
        weightKg: values.weightKg,
        bust: values.bust,
        waist: values.waist,
        hip: values.hip,
        shoeSizeEu: values.shoeSizeEu,
        ageRange: values.ageRange,
        age: values.age,
        hometown: values.hometown,
        city: values.city,
        district: values.district,
        qq: values.qq,
        styleTags: values.styleTags,
        availableTypes: values.availableTypes,
        canRemote: values.canRemote,
        isMinor: values.isMinor,
        coverAssetId: values.coverAssetId,
        galleryAssetIds: values.galleryAssetIds,
        portfolio: values.portfolio ?? [],
        cooperationHistory: values.cooperationHistory ?? [],
        updatedAt: new Date(),
      },
    })
    .returning();
  return toModelDomain(row!);
}

export async function _insertMediaForTests(
  record: Omit<MediaAssetRecord, "id"> &
    Partial<
      Pick<MediaAssetRecord, "id"> & {
        original_url: string;
        file_size: number;
        hash: string;
        uploaded_by: number;
        uploaded_at: Date;
      }
    >,
): Promise<MediaAssetRecord> {
  const db = getDb();
  await ensureSentinelAdmin();
  const idFallback = Math.floor(Math.random() * 1_000_000) + 1;
  const hash = record.hash ?? `mockhash${(record.id ?? idFallback).toString().padStart(56, "0")}`;
  const values = {
    ...(record.id != null ? { id: record.id } : {}),
    modelId: record.model_id,
    type: record.type,
    url: record.url,
    originalUrl: record.original_url ?? record.url,
    thumbUrl: record.thumb_url,
    width: record.width,
    height: record.height,
    fileSize: record.file_size ?? 0,
    hash,
    hasWatermark: record.has_watermark,
    uploadedBy: record.uploaded_by ?? 1,
    ...(record.uploaded_at ? { uploadedAt: record.uploaded_at } : {}),
  };
  const [row] = await db.insert(mediaAssets).values(values).returning();
  return toMediaDomain(row!);
}

export async function _resetModelsRepoForTests(): Promise<void> {
  const db = getDb();
  // CASCADE：清 models / media_assets 时，引用它们的 rosters/audit/schedule 也会被清；够测试用。
  await db.execute(
    sql`TRUNCATE TABLE media_assets, models, admins, daily_rosters RESTART IDENTITY CASCADE`,
  );
  // sentinel admin (id=1) 在 truncate 后立刻重种 —— adminCreateMedia 等不经过
  // _insertMediaForTests 的代码路径默认 uploaded_by=1，它们需要这个 FK target 存在。
  await ensureSentinelAdmin();
}

// ─── 管理视角 ──────────────────────────────────────────────────────

export interface AdminListModelsOpts {
  status?: ModelStatus;
  type?: string;
  style?: string;
  q?: string;
  page: number;
  page_size: number;
}

export async function adminListModels(
  opts: AdminListModelsOpts,
): Promise<{ items: AdminModelRecord[]; total: number }> {
  const db = getDb();
  const conds = [];
  if (opts.status) conds.push(eq(models.status, opts.status));
  if (opts.type)
    conds.push(sql`${models.availableTypes} @> ${JSON.stringify([opts.type])}::jsonb`);
  if (opts.style)
    conds.push(sql`${models.styleTags} @> ${JSON.stringify([opts.style])}::jsonb`);
  if (opts.q) conds.push(sql`${models.nickname} ILIKE ${"%" + opts.q.trim() + "%"}`);
  const where = conds.length === 0 ? undefined : conds.length === 1 ? conds[0] : and(...conds);

  const totalRow = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(models)
    .where(where);
  const total = totalRow[0]?.c ?? 0;
  const offset = Math.max(0, (opts.page - 1) * opts.page_size);
  const rows = await db
    .select()
    .from(models)
    .where(where)
    .orderBy(asc(models.id))
    .limit(opts.page_size)
    .offset(offset);
  return { items: rows.map(toAdminModelDomain), total };
}

export async function adminFindModelById(id: number): Promise<AdminModelRecord | undefined> {
  const db = getDb();
  const r = await db.query.models.findFirst({ where: eq(models.id, id) });
  return r ? toAdminModelDomain(r) : undefined;
}

export async function adminFindModelByCode(code: string): Promise<AdminModelRecord | undefined> {
  const db = getDb();
  const r = await db.query.models.findFirst({ where: eq(models.code, code) });
  return r ? toAdminModelDomain(r) : undefined;
}

export interface AdminCreateModelInput {
  code: string;
  nickname: string;
  real_name_enc?: Uint8Array | null;
  height_cm?: number | null;
  weight_kg?: number | null;
  bust?: number | null;
  waist?: number | null;
  hip?: number | null;
  shoe_size_eu?: number | null;
  age_range?: string | null;
  age?: number | null;
  hometown?: string | null;
  city?: string | null;
  district?: string | null;
  qq?: string | null;
  style_tags?: string[];
  available_types?: string[];
  can_remote?: boolean;
  is_minor?: boolean;
  cover_asset_id?: number | null;
  gallery_asset_ids?: number[];
  portfolio?: ModelPortfolioItem[];
  cooperation_history?: ModelCooperationItem[];
}

export async function adminCreateModel(input: AdminCreateModelInput): Promise<AdminModelRecord> {
  const db = getDb();
  try {
    const [row] = await db
      .insert(models)
      .values({
        code: input.code,
        nickname: input.nickname,
        realNameEnc: input.real_name_enc ?? null,
        heightCm: input.height_cm ?? null,
        weightKg: input.weight_kg ?? null,
        bust: input.bust ?? null,
        waist: input.waist ?? null,
        hip: input.hip ?? null,
        shoeSizeEu: input.shoe_size_eu ?? null,
        ageRange: input.age_range ?? null,
        age: input.age ?? null,
        hometown: input.hometown ?? null,
        city: input.city ?? null,
        district: input.district ?? null,
        qq: input.qq ?? null,
        styleTags: input.style_tags ?? [],
        availableTypes: input.available_types ?? [],
        canRemote: input.can_remote ?? false,
        isMinor: input.is_minor ?? false,
        coverAssetId: input.cover_asset_id ?? null,
        galleryAssetIds: input.gallery_asset_ids ?? [],
        portfolio: toJsonb(input.portfolio) ?? [],
        cooperationHistory: toJsonb(input.cooperation_history) ?? [],
      })
      .returning();
    return toAdminModelDomain(row!);
  } catch (e) {
    const ue = isUniqueViolation(e);
    if (ue && ue.constraint?.includes("code")) throw new ModelsRepoConflictError("code");
    throw e;
  }
}

export type AdminUpdateModelPatch = Partial<Omit<AdminCreateModelInput, "code">>;

export async function adminUpdateModel(
  id: number,
  patch: AdminUpdateModelPatch,
): Promise<AdminModelRecord | undefined> {
  const db = getDb();
  const set: Partial<typeof models.$inferInsert> = { updatedAt: new Date() };
  if (patch.nickname !== undefined) set.nickname = patch.nickname;
  if (patch.real_name_enc !== undefined) set.realNameEnc = patch.real_name_enc;
  if (patch.height_cm !== undefined) set.heightCm = patch.height_cm;
  if (patch.weight_kg !== undefined) set.weightKg = patch.weight_kg;
  if (patch.bust !== undefined) set.bust = patch.bust;
  if (patch.waist !== undefined) set.waist = patch.waist;
  if (patch.hip !== undefined) set.hip = patch.hip;
  if (patch.shoe_size_eu !== undefined) set.shoeSizeEu = patch.shoe_size_eu;
  if (patch.age_range !== undefined) set.ageRange = patch.age_range;
  if (patch.age !== undefined) set.age = patch.age;
  if (patch.hometown !== undefined) set.hometown = patch.hometown;
  if (patch.city !== undefined) set.city = patch.city;
  if (patch.district !== undefined) set.district = patch.district;
  if (patch.qq !== undefined) set.qq = patch.qq;
  if (patch.style_tags !== undefined) set.styleTags = patch.style_tags;
  if (patch.available_types !== undefined) set.availableTypes = patch.available_types;
  if (patch.can_remote !== undefined) set.canRemote = patch.can_remote;
  if (patch.is_minor !== undefined) set.isMinor = patch.is_minor;
  if (patch.cover_asset_id !== undefined) set.coverAssetId = patch.cover_asset_id;
  if (patch.gallery_asset_ids !== undefined) set.galleryAssetIds = patch.gallery_asset_ids;
  if (patch.portfolio !== undefined) set.portfolio = toJsonb(patch.portfolio);
  if (patch.cooperation_history !== undefined)
    set.cooperationHistory = toJsonb(patch.cooperation_history);

  const [row] = await db.update(models).set(set).where(eq(models.id, id)).returning();
  return row ? toAdminModelDomain(row) : undefined;
}

export async function adminArchiveModel(id: number): Promise<AdminModelRecord | undefined> {
  const db = getDb();
  const [row] = await db
    .update(models)
    .set({ status: "archived", updatedAt: new Date() })
    .where(eq(models.id, id))
    .returning();
  return row ? toAdminModelDomain(row) : undefined;
}

export async function adminRestoreModel(id: number): Promise<AdminModelRecord | undefined> {
  const db = getDb();
  const [row] = await db
    .update(models)
    .set({ status: "active", updatedAt: new Date() })
    .where(eq(models.id, id))
    .returning();
  return row ? toAdminModelDomain(row) : undefined;
}

export interface AdminListMediaOpts {
  model_id?: number;
  type?: MediaAssetRecord["type"];
  page: number;
  page_size: number;
}

export async function adminListMedia(
  opts: AdminListMediaOpts,
): Promise<{ items: AdminMediaRecord[]; total: number }> {
  const db = getDb();
  const conds = [];
  if (opts.model_id !== undefined) conds.push(eq(mediaAssets.modelId, opts.model_id));
  if (opts.type !== undefined) conds.push(eq(mediaAssets.type, opts.type));
  const where = conds.length === 0 ? undefined : conds.length === 1 ? conds[0] : and(...conds);

  const totalRow = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(mediaAssets)
    .where(where);
  const total = totalRow[0]?.c ?? 0;
  const offset = Math.max(0, (opts.page - 1) * opts.page_size);
  const rows = await db
    .select()
    .from(mediaAssets)
    .where(where)
    .orderBy(sql`${mediaAssets.id} desc`)
    .limit(opts.page_size)
    .offset(offset);
  return { items: rows.map(toAdminMediaDomain), total };
}

export async function adminFindMediaById(id: number): Promise<AdminMediaRecord | undefined> {
  const db = getDb();
  const r = await db.query.mediaAssets.findFirst({ where: eq(mediaAssets.id, id) });
  return r ? toAdminMediaDomain(r) : undefined;
}

export interface AdminCreateMediaInput {
  model_id: number | null;
  type: MediaAssetRecord["type"];
  url: string;
  original_url: string;
  thumb_url: string | null;
  width: number | null;
  height: number | null;
  file_size: number;
  hash: string;
  has_watermark: boolean;
  uploaded_by: number;
}

export async function adminCreateMedia(input: AdminCreateMediaInput): Promise<AdminMediaRecord> {
  const db = getDb();
  try {
    const [row] = await db
      .insert(mediaAssets)
      .values({
        modelId: input.model_id,
        type: input.type,
        url: input.url,
        originalUrl: input.original_url,
        thumbUrl: input.thumb_url,
        width: input.width,
        height: input.height,
        fileSize: input.file_size,
        hash: input.hash,
        hasWatermark: input.has_watermark,
        uploadedBy: input.uploaded_by,
      })
      .returning();
    return toAdminMediaDomain(row!);
  } catch (e) {
    const ue = isUniqueViolation(e);
    if (ue && ue.constraint?.includes("hash")) throw new ModelsRepoConflictError("hash");
    throw e;
  }
}

export interface AdminUpdateMediaPatch {
  is_cover?: boolean;
  alt?: string;
  has_watermark?: boolean;
}

/**
 * is_cover 跨表写：必须 transaction —— 同时更新 media + models.cover_asset_id。
 * 否则可能出现"media 改了 is_cover 但 model.cover_asset_id 没改"的中间态。
 */
export async function adminUpdateMedia(
  id: number,
  patch: AdminUpdateMediaPatch,
): Promise<AdminMediaRecord | undefined> {
  const db = getDb();
  return await db.transaction(async (tx) => {
    const cur = await tx.query.mediaAssets.findFirst({ where: eq(mediaAssets.id, id) });
    if (!cur) return undefined;
    const set: Partial<typeof mediaAssets.$inferInsert> = {};
    if (patch.has_watermark !== undefined) set.hasWatermark = patch.has_watermark;
    let updated: MediaRow = cur;
    if (Object.keys(set).length > 0) {
      const [r] = await tx
        .update(mediaAssets)
        .set(set)
        .where(eq(mediaAssets.id, id))
        .returning();
      if (r) updated = r;
    }
    if (patch.is_cover !== undefined && cur.modelId != null) {
      if (patch.is_cover) {
        await tx
          .update(models)
          .set({ coverAssetId: id, updatedAt: new Date() })
          .where(eq(models.id, cur.modelId));
      } else {
        // 仅当 model.cover_asset_id 正指向本条时清零
        await tx
          .update(models)
          .set({ coverAssetId: null, updatedAt: new Date() })
          .where(and(eq(models.id, cur.modelId), eq(models.coverAssetId, id)));
      }
    }
    return toAdminMediaDomain(updated);
  });
}

export async function adminDeleteMedia(id: number): Promise<boolean> {
  const db = getDb();
  return await db.transaction(async (tx) => {
    const cur = await tx.query.mediaAssets.findFirst({ where: eq(mediaAssets.id, id) });
    if (!cur) return false;
    await tx.delete(mediaAssets).where(eq(mediaAssets.id, id));
    if (cur.modelId != null) {
      await tx
        .update(models)
        .set({ coverAssetId: null, updatedAt: new Date() })
        .where(and(eq(models.id, cur.modelId), eq(models.coverAssetId, id)));
    }
    return true;
  });
}
