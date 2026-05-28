/**
 * Models 仓储 —— 单存储双视图。
 *
 * Phase 2/3 mock：in-memory Map 持有完整记录（内部 FullModelRecord / FullMediaRecord 含敏感列），
 * 但 export 两套视图：
 *  - 公开视角（findActiveByCode / findActiveByIds / listActive / findCoverAndGalleryAssets）→ 返 ModelRecord / ImageAsset，刻意 strip real_name_enc / original_url
 *  - 管理视角（adminListModels / adminFindModelById / adminCreateModel / ... / adminListMedia / ...）→ 返 AdminModelRecord / AdminMediaRecord，含全字段
 *
 * 单存储的好处：管理员新建模特 → 公开 /models 立刻可见，无需双写。Step 7 切真 Drizzle 时，
 * 公开 query 显式 select 公开列、管理 query 显式 select 全列，仍是两套视图同一张表。
 *
 * 6 条约定（对齐 admin-repo.ts）：
 *  1. 函数 async，签名稳定
 *  2. Map-backed in-memory store
 *  3. clone-on-return
 *  4. _insertXxxForTests 测试种子
 *  5. _resetXxxForTests beforeEach 清理
 *  6. 领域动词命名
 */

import type { pub } from "@chiyan/types";
type ImageAsset = pub.ImageAsset;

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
  hometown: string | null;
  city: string | null;
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

export interface ListActiveOpts {
  type?: string;
  style?: string;
  q?: string;
  page: number;
  page_size: number;
}

/** 管理视角：含 real_name_enc（AES-GCM 加密的真名 blob）。 */
export interface AdminModelRecord extends ModelRecord {
  real_name_enc: Uint8Array | null;
}

/** 管理视角：含 original_url（R2 私有桶）+ 上传元数据。 */
export interface AdminMediaRecord extends MediaAssetRecord {
  original_url: string;
  file_size: number;
  hash: string;
  uploaded_by: number;
  uploaded_at: Date;
}

/** 内部完整记录 —— 仓库 Map 实际持有这个；clone 时按视角裁剪。 */
type FullModelRecord = AdminModelRecord;
type FullMediaRecord = AdminMediaRecord;

const modelsById = new Map<number, FullModelRecord>();
const modelsByCode = new Map<string, number>();
const mediaById = new Map<number, FullMediaRecord>();
const mediaByHash = new Map<string, number>();
let nextModelId = 1;
let nextMediaId = 1;

function cloneModel(m: FullModelRecord): ModelRecord {
  // 公开视角：strip real_name_enc。
  return {
    id: m.id,
    code: m.code,
    nickname: m.nickname,
    status: m.status,
    height_cm: m.height_cm,
    weight_kg: m.weight_kg,
    bust: m.bust,
    waist: m.waist,
    hip: m.hip,
    shoe_size_eu: m.shoe_size_eu,
    age_range: m.age_range,
    hometown: m.hometown,
    city: m.city,
    style_tags: [...m.style_tags],
    available_types: [...m.available_types],
    can_remote: m.can_remote,
    is_minor: m.is_minor,
    cover_asset_id: m.cover_asset_id,
    gallery_asset_ids: [...m.gallery_asset_ids],
    portfolio: m.portfolio.map((p) => ({ ...p })),
    cooperation_history: m.cooperation_history.map((c) => ({ ...c })),
    created_at: m.created_at,
    updated_at: m.updated_at,
  };
}

function cloneAdminModel(m: FullModelRecord): AdminModelRecord {
  // 管理视角：含 real_name_enc 副本（避免外部 mutate 落到 Map）。
  const base = cloneModel(m);
  const enc = m.real_name_enc;
  return {
    ...base,
    real_name_enc: enc == null ? null : new Uint8Array(enc),
  };
}

function cloneMedia(a: FullMediaRecord): MediaAssetRecord {
  // 公开视角：strip original_url / hash / file_size / uploaded_by / uploaded_at。
  return {
    id: a.id,
    model_id: a.model_id,
    type: a.type,
    url: a.url,
    thumb_url: a.thumb_url,
    width: a.width,
    height: a.height,
    has_watermark: a.has_watermark,
  };
}

function cloneAdminMedia(a: FullMediaRecord): AdminMediaRecord {
  return {
    ...cloneMedia(a),
    original_url: a.original_url,
    file_size: a.file_size,
    hash: a.hash,
    uploaded_by: a.uploaded_by,
    uploaded_at: a.uploaded_at,
  };
}

/**
 * 三态返回：
 *  - 'not_found'  → handler 回 40401
 *  - 'archived'   → handler 回 41001 sub_code=archived（必须 Cache-Control: no-store）
 *  - ModelRecord  → handler 回 200
 */
export async function findActiveByCode(
  code: string,
): Promise<ModelRecord | "not_found" | "archived"> {
  const id = modelsByCode.get(code);
  if (id == null) return "not_found";
  const r = modelsById.get(id);
  if (!r) return "not_found";
  if (r.status === "archived") return "archived";
  return cloneModel(r);
}

/** today endpoint 使用：按 roster.model_ids 批量取，保持入参顺序，跳过 archived/缺失。 */
export async function findActiveByIds(ids: number[]): Promise<ModelRecord[]> {
  const out: ModelRecord[] = [];
  for (const id of ids) {
    const r = modelsById.get(id);
    if (!r || r.status === "archived") continue;
    out.push(cloneModel(r));
  }
  return out;
}

/** 列表 endpoint 使用：filter + 简单分页；mock 阶段全内存，Step 7 换成 db.query。 */
export async function listActive(
  opts: ListActiveOpts,
): Promise<{ items: ModelRecord[]; total: number }> {
  const q = opts.q?.trim().toLowerCase();
  const filtered: FullModelRecord[] = [];
  for (const r of modelsById.values()) {
    if (r.status !== "active") continue;
    if (opts.type && !r.available_types.includes(opts.type)) continue;
    if (opts.style && !r.style_tags.includes(opts.style)) continue;
    if (q && !r.nickname.toLowerCase().includes(q)) continue;
    filtered.push(r);
  }
  filtered.sort((a, b) => a.id - b.id);
  const total = filtered.length;
  const start = (opts.page - 1) * opts.page_size;
  const items = filtered.slice(start, start + opts.page_size).map(cloneModel);
  return { items, total };
}

function mediaToImageAsset(a: FullMediaRecord): ImageAsset {
  // mock 阶段：width/height 必须给值（schema 要求 positive int）。
  // 真实 R2 + Cloudflare Images 接入后由变体生成器写回正确值。
  const width = a.width ?? 1200;
  const height = a.height ?? 1600;
  const src = a.url;
  const thumb = a.thumb_url ?? a.url;
  return {
    src,
    srcset: {
      "1x": thumb,
      "2x": src,
      "3x": src,
    },
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
  let cover: ImageAsset | null = null;
  if (model.cover_asset_id != null) {
    const a = mediaById.get(model.cover_asset_id);
    if (a && (a.model_id === model.id || a.model_id == null)) {
      cover = mediaToImageAsset(a);
    }
  }
  const gallery: ImageAsset[] = [];
  for (const gid of model.gallery_asset_ids) {
    const a = mediaById.get(gid);
    if (!a) continue;
    if (a.model_id !== model.id && a.model_id != null) continue;
    gallery.push(mediaToImageAsset(a));
  }
  return { cover, gallery };
}

// ─── 测试种子 ──────────────────────────────────────────────

/**
 * 测试用 insert：按 code upsert（模拟真实 DB unique(code) 上的 ON CONFLICT DO UPDATE）。
 * 多次同 code 调用不会在 store 里留多条 —— 便于"先种占位 → 再带 cover 重新种"的 helper 模式。
 */
export async function _insertModelForTests(
  record: Omit<ModelRecord, "id" | "created_at" | "updated_at"> &
    Partial<Pick<ModelRecord, "created_at" | "updated_at">> & {
      real_name_enc?: Uint8Array | null;
    },
): Promise<ModelRecord> {
  const existingId = modelsByCode.get(record.code);
  const id = existingId ?? nextModelId++;
  const existing = existingId != null ? modelsById.get(existingId) : undefined;
  const now = new Date();
  const { real_name_enc, ...rest } = record;
  const full: FullModelRecord = {
    ...rest,
    id,
    real_name_enc: real_name_enc ?? existing?.real_name_enc ?? null,
    created_at: record.created_at ?? existing?.created_at ?? now,
    updated_at: record.updated_at ?? now,
  };
  modelsById.set(id, full);
  modelsByCode.set(full.code, id);
  return cloneModel(full);
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
  const id = record.id ?? nextMediaId++;
  if (record.id != null && id >= nextMediaId) nextMediaId = id + 1;
  const hash = record.hash ?? `mockhash${id.toString().padStart(56, "0")}`;
  const full: FullMediaRecord = {
    id,
    model_id: record.model_id,
    type: record.type,
    url: record.url,
    thumb_url: record.thumb_url,
    width: record.width,
    height: record.height,
    has_watermark: record.has_watermark,
    original_url: record.original_url ?? record.url,
    file_size: record.file_size ?? 0,
    hash,
    uploaded_by: record.uploaded_by ?? 1,
    uploaded_at: record.uploaded_at ?? new Date(),
  };
  mediaById.set(id, full);
  mediaByHash.set(hash, id);
  return cloneMedia(full);
}

export function _resetModelsRepoForTests(): void {
  modelsById.clear();
  modelsByCode.clear();
  mediaById.clear();
  mediaByHash.clear();
  nextModelId = 1;
  nextMediaId = 1;
}

// ─── 管理视角 ──────────────────────────────────────────────

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
  const q = opts.q?.trim().toLowerCase();
  const filtered: FullModelRecord[] = [];
  for (const r of modelsById.values()) {
    if (opts.status && r.status !== opts.status) continue;
    if (opts.type && !r.available_types.includes(opts.type)) continue;
    if (opts.style && !r.style_tags.includes(opts.style)) continue;
    if (q && !r.nickname.toLowerCase().includes(q)) continue;
    filtered.push(r);
  }
  filtered.sort((a, b) => a.id - b.id);
  const total = filtered.length;
  const start = (opts.page - 1) * opts.page_size;
  const items = filtered.slice(start, start + opts.page_size).map(cloneAdminModel);
  return { items, total };
}

/** 含 archived；管理详情用。 */
export async function adminFindModelById(id: number): Promise<AdminModelRecord | undefined> {
  const r = modelsById.get(id);
  return r ? cloneAdminModel(r) : undefined;
}

export async function adminFindModelByCode(code: string): Promise<AdminModelRecord | undefined> {
  const id = modelsByCode.get(code);
  if (id == null) return undefined;
  const r = modelsById.get(id);
  return r ? cloneAdminModel(r) : undefined;
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
  hometown?: string | null;
  city?: string | null;
  style_tags?: string[];
  available_types?: string[];
  can_remote?: boolean;
  is_minor?: boolean;
  cover_asset_id?: number | null;
  gallery_asset_ids?: number[];
  portfolio?: ModelPortfolioItem[];
  cooperation_history?: ModelCooperationItem[];
}

export class ModelsRepoConflictError extends Error {
  constructor(field: string) {
    super(`conflict on ${field}`);
    this.name = "ModelsRepoConflictError";
  }
}

export async function adminCreateModel(input: AdminCreateModelInput): Promise<AdminModelRecord> {
  if (modelsByCode.has(input.code)) {
    throw new ModelsRepoConflictError("code");
  }
  const id = nextModelId++;
  const now = new Date();
  const full: FullModelRecord = {
    id,
    code: input.code,
    nickname: input.nickname,
    status: "active",
    real_name_enc: input.real_name_enc ?? null,
    height_cm: input.height_cm ?? null,
    weight_kg: input.weight_kg ?? null,
    bust: input.bust ?? null,
    waist: input.waist ?? null,
    hip: input.hip ?? null,
    shoe_size_eu: input.shoe_size_eu ?? null,
    age_range: input.age_range ?? null,
    hometown: input.hometown ?? null,
    city: input.city ?? null,
    style_tags: input.style_tags ? [...input.style_tags] : [],
    available_types: input.available_types ? [...input.available_types] : [],
    can_remote: input.can_remote ?? false,
    is_minor: input.is_minor ?? false,
    cover_asset_id: input.cover_asset_id ?? null,
    gallery_asset_ids: input.gallery_asset_ids ? [...input.gallery_asset_ids] : [],
    portfolio: input.portfolio ? input.portfolio.map((p) => ({ ...p })) : [],
    cooperation_history: input.cooperation_history
      ? input.cooperation_history.map((c) => ({ ...c }))
      : [],
    created_at: now,
    updated_at: now,
  };
  modelsById.set(id, full);
  modelsByCode.set(full.code, id);
  return cloneAdminModel(full);
}

export type AdminUpdateModelPatch = Partial<Omit<AdminCreateModelInput, "code">>;

export async function adminUpdateModel(
  id: number,
  patch: AdminUpdateModelPatch,
): Promise<AdminModelRecord | undefined> {
  const r = modelsById.get(id);
  if (!r) return undefined;
  if (patch.nickname !== undefined) r.nickname = patch.nickname;
  if (patch.real_name_enc !== undefined) r.real_name_enc = patch.real_name_enc;
  if (patch.height_cm !== undefined) r.height_cm = patch.height_cm;
  if (patch.weight_kg !== undefined) r.weight_kg = patch.weight_kg;
  if (patch.bust !== undefined) r.bust = patch.bust;
  if (patch.waist !== undefined) r.waist = patch.waist;
  if (patch.hip !== undefined) r.hip = patch.hip;
  if (patch.shoe_size_eu !== undefined) r.shoe_size_eu = patch.shoe_size_eu;
  if (patch.age_range !== undefined) r.age_range = patch.age_range;
  if (patch.hometown !== undefined) r.hometown = patch.hometown;
  if (patch.city !== undefined) r.city = patch.city;
  if (patch.style_tags !== undefined) r.style_tags = [...patch.style_tags];
  if (patch.available_types !== undefined) r.available_types = [...patch.available_types];
  if (patch.can_remote !== undefined) r.can_remote = patch.can_remote;
  if (patch.is_minor !== undefined) r.is_minor = patch.is_minor;
  if (patch.cover_asset_id !== undefined) r.cover_asset_id = patch.cover_asset_id;
  if (patch.gallery_asset_ids !== undefined) r.gallery_asset_ids = [...patch.gallery_asset_ids];
  if (patch.portfolio !== undefined) r.portfolio = patch.portfolio.map((p) => ({ ...p }));
  if (patch.cooperation_history !== undefined) {
    r.cooperation_history = patch.cooperation_history.map((c) => ({ ...c }));
  }
  r.updated_at = new Date();
  return cloneAdminModel(r);
}

export async function adminArchiveModel(id: number): Promise<AdminModelRecord | undefined> {
  const r = modelsById.get(id);
  if (!r) return undefined;
  r.status = "archived";
  r.updated_at = new Date();
  return cloneAdminModel(r);
}

export async function adminRestoreModel(id: number): Promise<AdminModelRecord | undefined> {
  const r = modelsById.get(id);
  if (!r) return undefined;
  r.status = "active";
  r.updated_at = new Date();
  return cloneAdminModel(r);
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
  const filtered: FullMediaRecord[] = [];
  for (const a of mediaById.values()) {
    if (opts.model_id !== undefined && a.model_id !== opts.model_id) continue;
    if (opts.type !== undefined && a.type !== opts.type) continue;
    filtered.push(a);
  }
  filtered.sort((a, b) => b.id - a.id);
  const total = filtered.length;
  const start = (opts.page - 1) * opts.page_size;
  const items = filtered.slice(start, start + opts.page_size).map(cloneAdminMedia);
  return { items, total };
}

export async function adminFindMediaById(id: number): Promise<AdminMediaRecord | undefined> {
  const a = mediaById.get(id);
  return a ? cloneAdminMedia(a) : undefined;
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
  if (mediaByHash.has(input.hash)) {
    throw new ModelsRepoConflictError("hash");
  }
  const id = nextMediaId++;
  const full: FullMediaRecord = {
    ...input,
    id,
    uploaded_at: new Date(),
  };
  mediaById.set(id, full);
  mediaByHash.set(input.hash, id);
  return cloneAdminMedia(full);
}

export interface AdminUpdateMediaPatch {
  is_cover?: boolean;
  alt?: string;
  has_watermark?: boolean;
}

/**
 * patch is_cover=true 时，同步把所属 model.cover_asset_id 指向本条；
 * is_cover=false 时，若 model.cover_asset_id 正指向本条则清零。
 * Step 7 切真 DB 时这两个 UPDATE 要在同一事务里。
 */
export async function adminUpdateMedia(
  id: number,
  patch: AdminUpdateMediaPatch,
): Promise<AdminMediaRecord | undefined> {
  const a = mediaById.get(id);
  if (!a) return undefined;
  if (patch.has_watermark !== undefined) a.has_watermark = patch.has_watermark;
  if (patch.is_cover !== undefined && a.model_id != null) {
    const m = modelsById.get(a.model_id);
    if (m) {
      if (patch.is_cover) {
        m.cover_asset_id = id;
      } else if (m.cover_asset_id === id) {
        m.cover_asset_id = null;
      }
      m.updated_at = new Date();
    }
  }
  // alt 字段当前 schema 上没存（图片 alt 留给 Cloudflare Images 那层）；patch 忽略即可。
  return cloneAdminMedia(a);
}

export async function adminDeleteMedia(id: number): Promise<boolean> {
  const a = mediaById.get(id);
  if (!a) return false;
  mediaById.delete(id);
  mediaByHash.delete(a.hash);
  // 若有 model 引用本条作 cover，清掉。
  if (a.model_id != null) {
    const m = modelsById.get(a.model_id);
    if (m && m.cover_asset_id === id) {
      m.cover_asset_id = null;
      m.updated_at = new Date();
    }
  }
  return true;
}
