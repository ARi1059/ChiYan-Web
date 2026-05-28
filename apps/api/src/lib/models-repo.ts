/**
 * Models 仓储（公开域视角）。
 *
 * Phase 2 mock：in-memory Map 模拟 models + media_assets 两张表，
 * 但**只暴露公开列**（model.real_name_enc 不进 ModelRecord；
 * media_assets.original_url 不进 MediaAssetRecord）—— 这是为了模拟
 * "公开 endpoint 仓库 SELECT 时已过滤敏感列"的契约。
 * Step 7 切真 Drizzle 时，仓库的 select() 也必须显式列出公开列，
 * 不能 `select()` 全字段交给 handler 裁剪。
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

const modelsById = new Map<number, ModelRecord>();
const modelsByCode = new Map<string, number>();
const mediaById = new Map<number, MediaAssetRecord>();
let nextModelId = 1;
let nextMediaId = 1;

function cloneModel(m: ModelRecord): ModelRecord {
  return {
    ...m,
    style_tags: [...m.style_tags],
    available_types: [...m.available_types],
    gallery_asset_ids: [...m.gallery_asset_ids],
    portfolio: m.portfolio.map((p) => ({ ...p })),
    cooperation_history: m.cooperation_history.map((c) => ({ ...c })),
  };
}

function cloneMedia(a: MediaAssetRecord): MediaAssetRecord {
  return { ...a };
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
  const filtered: ModelRecord[] = [];
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

function mediaToImageAsset(a: MediaAssetRecord): ImageAsset {
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

export async function _insertModelForTests(
  record: Omit<ModelRecord, "id" | "created_at" | "updated_at"> &
    Partial<Pick<ModelRecord, "created_at" | "updated_at">>,
): Promise<ModelRecord> {
  const id = nextModelId++;
  const now = new Date();
  const full: ModelRecord = {
    ...record,
    id,
    created_at: record.created_at ?? now,
    updated_at: record.updated_at ?? now,
  };
  modelsById.set(id, full);
  modelsByCode.set(full.code, id);
  return cloneModel(full);
}

export async function _insertMediaForTests(
  record: Omit<MediaAssetRecord, "id"> & Partial<Pick<MediaAssetRecord, "id">>,
): Promise<MediaAssetRecord> {
  const id = record.id ?? nextMediaId++;
  if (record.id != null && id >= nextMediaId) nextMediaId = id + 1;
  const full: MediaAssetRecord = { ...record, id };
  mediaById.set(id, full);
  return cloneMedia(full);
}

export function _resetModelsRepoForTests(): void {
  modelsById.clear();
  modelsByCode.clear();
  mediaById.clear();
  nextModelId = 1;
  nextMediaId = 1;
}
