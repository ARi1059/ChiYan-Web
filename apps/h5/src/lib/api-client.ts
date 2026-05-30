/**
 * H5 公开端 API 客户端。
 *
 * 只对接 /api/v1/public/*；vite proxy 代理到本地 API:3000。
 *
 * 字段映射约定：API snake_case → H5 内部 camelCase + Figma 设计语义补齐：
 *  - PublicModelCard.code           → Model.id           （H5 用 code 当 React key）
 *  - PublicModelCard.nickname       → Model.alias
 *  - PublicModelCard.height_cm      → Model.height
 *  - PublicModelCard.weight_kg      → Model.weight
 *  - PublicModelCard.qq             → Model.qqNumber     （默认空串）
 *  - PublicModelCard.style_tags     → Model.styles
 *  - PublicModelCard.cover.src      → Model.photo
 *  - status (在班/空闲/休息)         → 默认"空闲"；今日 /public/today 列表里的覆盖为"在班"
 *  - featured                       → 默认 false（API schema 暂无此字段，HomeSection 人气区块自然隐藏）
 *  - description                    → 默认空串（API 暂无；ModelDetailSheet 用 `display.showDescription && model.description` 守卫）
 *  - photos                         → [photo]（H5 列表用，详情端的 gallery 暂不接入）
 *
 * Step 7 后端接 Cloudflare Images 拿到真实 width/height/srcset 时这里不用改。
 */
import {
  DEFAULT_DISPLAY,
  DEFAULT_SETTINGS,
  type DisplayConfig,
  type Model,
  type SiteSettings,
} from "../data/models";

const API_BASE = "/api/v1";

interface ApiEnvelope<T> {
  code: number;
  data: T;
  message?: string;
  trace_id?: string;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    throw new Error(`API ${path} → HTTP ${res.status}`);
  }
  const env = (await res.json()) as ApiEnvelope<T>;
  if (env.code !== 0) {
    throw new Error(`API ${path} → code ${env.code}: ${env.message ?? ""}`);
  }
  return env.data;
}

interface ApiImageAsset {
  src: string;
  srcset: { "1x": string; "2x": string; "3x": string };
  width: number;
  height: number;
  blurhash?: string;
  lqip?: string;
}

interface ApiPublicModelCard {
  code: string;
  nickname: string;
  cover: ApiImageAsset;
  height_cm?: number;
  weight_kg?: number;
  bust?: number;
  waist?: number;
  hip?: number;
  shoe_size_eu?: number;
  age_range?: string;
  age?: number;
  city?: string;
  district?: string;
  qq?: string;
  style_tags: string[];
  available_types: string[];
  can_remote: boolean;
  is_minor: boolean;
}

interface ApiPublicModelsResponse {
  items: ApiPublicModelCard[];
  total: number;
  page: number;
  page_size: number;
}

interface ApiBusinessHours {
  weekdays: { open: string; close: string };
  weekends?: { open: string; close: string };
}

interface ApiPublicTodayResponse {
  date: string;
  is_studio_open: boolean;
  business_hours: ApiBusinessHours;
  resume_at?: string;
  note?: string;
  models: ApiPublicModelCard[];
}

interface ApiDisplayConfig {
  showBust: boolean;
  showAge: boolean;
  showDistrict: boolean;
  showStyles: boolean;
  showDescription: boolean;
  showQQNumber: boolean;
}

interface ApiPublicStudioInfoResponse {
  name: string;
  tagline?: string;
  address?: string;
  qq: string;
  qq_group?: string;
  phone?: string;
  business_hours: ApiBusinessHours;
  about?: string;
  home_notice?: string;
  notice_enabled: boolean;
  display_config: ApiDisplayConfig;
}

function formatBusinessHours(b: ApiBusinessHours): string {
  const w = `${b.weekdays.open}–${b.weekdays.close}`;
  if (b.weekends) {
    const we = `${b.weekends.open}–${b.weekends.close}`;
    return `工作日 ${w} · 周末 ${we}`;
  }
  return `每日 ${w}`;
}

function toModel(card: ApiPublicModelCard, status: Model["status"] = "空闲"): Model {
  const photo = card.cover.src;
  return {
    id: card.code,
    code: card.code,
    alias: card.nickname,
    height: card.height_cm ?? 0,
    weight: card.weight_kg ?? 0,
    bust: card.bust ?? 0,
    age: card.age ?? 0,
    district: card.district ?? "",
    styles: card.style_tags,
    status,
    photo,
    photos: [photo],
    qqNumber: card.qq ?? "",
    description: "",
    featured: false,
  };
}

export interface PublicSnapshot {
  models: Model[];
  settings: SiteSettings;
  display: DisplayConfig;
  /** /public/today.is_studio_open；默认 true。控制 HomeSection"今日推荐"区块 + TodaySection 顶部休息提示。 */
  studioOpen: boolean;
  /** 工作室休息时的提示文案（来自 today.note）。空时显示默认"明日恢复"。 */
  studioNote?: string;
}

/**
 * 一次性拉取 H5 启动需要的全部公开数据。
 *
 * 三条并发：models / today / studio-info。
 * today 仅用来标 status=在班；不在今日 roster 的标"空闲"（不区分"休息"，API 没这语义）。
 * studio-info 提供 settings + display_config；adminPin 保持本地（API 不暴露）。
 * studioOpen / studioNote 也来自 today（is_studio_open + note）。
 */
export async function fetchPublicSnapshot(): Promise<PublicSnapshot> {
  const [modelsRes, todayRes, studioRes] = await Promise.all([
    call<ApiPublicModelsResponse>("/public/models?page=1&page_size=50"),
    call<ApiPublicTodayResponse>("/public/today"),
    call<ApiPublicStudioInfoResponse>("/public/studio-info"),
  ]);

  const todayCodes = new Set(todayRes.models.map((m) => m.code));
  const models = modelsRes.items.map((c) =>
    toModel(c, todayCodes.has(c.code) ? "在班" : "空闲"),
  );

  const settings: SiteSettings = {
    ...DEFAULT_SETTINGS,
    agencyName: studioRes.name,
    agencySlogan: studioRes.tagline ?? DEFAULT_SETTINGS.agencySlogan,
    agencyQQ: studioRes.qq,
    agencyQQGroup: studioRes.qq_group ?? "",
    businessHours: formatBusinessHours(studioRes.business_hours),
    homeNotice: studioRes.home_notice ?? "",
    noticeEnabled: studioRes.notice_enabled,
  };

  const display: DisplayConfig = {
    ...DEFAULT_DISPLAY,
    ...studioRes.display_config,
  };

  return {
    models,
    settings,
    display,
    studioOpen: todayRes.is_studio_open,
    ...(todayRes.note ? { studioNote: todayRes.note } : {}),
  };
}

// ─── Admin 数据源（已登录态）──────────────────────────────────────
//
// 登录后 AppContext 切到这里：models 同时带 apiId (数字 id) + code + coverAssetId，
// 使得 mutation 能精确发 PATCH/DELETE /admin/models/:id 而无需公开端反查。

import {
  fetchAdminModels,
  fetchAdminRoster,
  type AdminModelDetail,
} from "@chiyan/api-client";

/**
 * AdminModelDetail → H5 Model 的纯转换；photo 留空，由 fetchAdminSnapshot 用
 * /public/models 的 ImageAsset.src 合并补齐（admin endpoint 不直接出 URL）。
 */
function adminToModel(d: AdminModelDetail, todayApiIds: Set<number>): Model {
  return {
    id: d.code,
    apiId: d.id,
    code: d.code,
    coverAssetId: d.cover_asset_id,
    alias: d.nickname,
    height: d.height_cm ?? 0,
    weight: d.weight_kg ?? 0,
    bust: d.bust ?? 0,
    age: d.age ?? 0,
    district: d.district ?? "",
    styles: d.style_tags,
    status: todayApiIds.has(d.id) ? "在班" : "空闲",
    photo: "",
    photos: [],
    qqNumber: d.qq ?? "",
    description: "",
    featured: false,
  };
}

export interface AdminSnapshot extends PublicSnapshot {
  /** 来自 /admin/models —— 有数字 id；mutation 都用这个。 */
  models: Model[];
}

/**
 * 登录态 snapshot：admin/models（含数字 id）+ admin/roster（今日 model_ids）
 * + public/studio-info（settings + display_config）+ public/models（拿 cover URL 合并）。
 *
 * 公开端不暴露 admin 数字 id，所以 admin 端要单独拉一次；merge 后 H5 既能跑 mutation 又有真图。
 */
export async function fetchAdminSnapshot(accessToken: string): Promise<AdminSnapshot> {
  const today = new Date().toISOString().slice(0, 10);
  const [adminList, rosterRes, publicModelsRes, todayRes, studioRes] = await Promise.all([
    fetchAdminModels(accessToken, { status: "active", page: 1, page_size: 100 }),
    fetchAdminRoster(today, accessToken).catch(() => ({
      date: today,
      model_ids: [] as number[],
      note: null,
      created_by: 0,
      updated_at: today,
    })),
    call<ApiPublicModelsResponse>("/public/models?page=1&page_size=100"),
    call<ApiPublicTodayResponse>("/public/today"),
    call<ApiPublicStudioInfoResponse>("/public/studio-info"),
  ]);

  const todaySet = new Set(rosterRes.model_ids);
  const codeToPhoto = new Map<string, string>();
  for (const c of publicModelsRes.items) codeToPhoto.set(c.code, c.cover.src);

  const models = adminList.items.map((d) => {
    const base = adminToModel(d, todaySet);
    const photo = codeToPhoto.get(d.code) ?? base.photo;
    return { ...base, photo, photos: photo ? [photo] : [] };
  });

  const settings: SiteSettings = {
    ...DEFAULT_SETTINGS,
    agencyName: studioRes.name,
    agencySlogan: studioRes.tagline ?? DEFAULT_SETTINGS.agencySlogan,
    agencyQQ: studioRes.qq,
    agencyQQGroup: studioRes.qq_group ?? "",
    businessHours: formatBusinessHours(studioRes.business_hours),
    homeNotice: studioRes.home_notice ?? "",
    noticeEnabled: studioRes.notice_enabled,
  };

  const display: DisplayConfig = {
    ...DEFAULT_DISPLAY,
    ...studioRes.display_config,
  };

  return {
    models,
    settings,
    display,
    studioOpen: todayRes.is_studio_open,
    ...(todayRes.note ? { studioNote: todayRes.note } : {}),
  };
}
