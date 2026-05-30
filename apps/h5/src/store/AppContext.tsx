/**
 * H5 应用状态容器。
 *
 * 数据来源策略（offline-first + API 兜底 + 登录态切 admin 源）：
 *  1. 初始渲染：从 localStorage 即时 hydrate（无网也能秒开 UI）。无缓存则用 DEFAULT_*。
 *  2. mount 后：未登录 → fetchPublicSnapshot；登录后 → fetchAdminSnapshot。
 *     - admin snapshot 多带 apiId + coverAssetId，让 mutation 能发 PATCH/DELETE /admin/models/:id。
 *     - 失败：写 state.phase='failed' + hasCache 标志；UI 根据 hasCache 决定 banner 还是独立屏。
 *  3. mutation：
 *     - 未登录态：仅本地 + cache。
 *     - 登录态：本地乐观 + 后台发 POST/PATCH/DELETE；失败抛回，调用方决定回滚或提示。
 *
 * adminPin 是纯 H5 本地，永不进 API。
 *
 * state 用 discriminated union 而非分离 loading/error：失败路径强制带 hasCache，
 * 让 UI 层不用再做"failed && hasCache" 的双重判断，类型层就能区分 banner vs 独立屏。
 */
import { createContext, useCallback, useContext, useState, useEffect, type ReactNode } from "react";
import {
  DEFAULT_MODELS,
  DEFAULT_SETTINGS,
  DEFAULT_DISPLAY,
  type Model,
  type SiteSettings,
  type DisplayConfig,
} from "../data/models";
import { fetchAdminSnapshot, fetchPublicSnapshot } from "../lib/api-client";
import {
  archiveAdminModel,
  createAdminModel,
  patchAdminModel,
  patchStudioSettings,
  type AdminCreateModelInput,
  type StudioSettingsPatch,
} from "@chiyan/api-client";
import { useAuth } from "./AuthContext";

export type FetchPhase =
  | { phase: "loading" }
  | { phase: "ready" }
  | { phase: "failed"; error: string; hasCache: boolean };

interface AppContextValue {
  models: Model[];
  settings: SiteSettings;
  display: DisplayConfig;
  /** 当前 fetch 阶段。UI 据此渲染 LoadingScreen / NetworkBanner / ErrorScreen。 */
  state: FetchPhase;
  /** 工作室今日营业（默认 true）。控制 HomeSection"今日推荐"显示 + TodaySection 顶部提示。 */
  studioOpen: boolean;
  /** 休息日提示文案（API today.note）。 */
  studioNote?: string;
  /** 手动重试入口；ErrorScreen / NetworkBanner 调用。 */
  refresh: () => void;
  /** 登录态且 model 来自 API 时发 PATCH；否则纯本地。失败抛回给调用方。 */
  updateModel: (id: string, updates: Partial<Model>) => Promise<void>;
  /** 登录态发 POST 拿 apiId+code；未登录态仅本地。失败抛回。 */
  addModel: (model: Model) => Promise<Model>;
  /** 登录态且 apiId 有则 DELETE（软删）；否则本地删。失败抛回。 */
  deleteModel: (id: string) => Promise<void>;
  setModels: (models: Model[]) => void;
  updateSettings: (updates: Partial<SiteSettings>) => void;
  updateDisplay: (updates: Partial<DisplayConfig>) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

const CACHE_KEYS = {
  models: "cy_models",
  settings: "cy_settings",
  display: "cy_display",
} as const;

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

/**
 * H5 SiteSettings → API AdminUpdateStudioSettingsRequest 子集映射。
 * 只覆盖能干净 round-trip 的字段；businessHours/adminPin 不参与。
 */
function settingsPatchFromUpdates(updates: Partial<SiteSettings>): StudioSettingsPatch {
  const p: StudioSettingsPatch = {};
  if (updates.agencyName !== undefined) p.name = updates.agencyName;
  if (updates.agencySlogan !== undefined) p.tagline = updates.agencySlogan || null;
  if (updates.agencyQQ !== undefined) p.qq = updates.agencyQQ;
  if (updates.agencyQQGroup !== undefined) p.qq_group = updates.agencyQQGroup || null;
  if (updates.homeNotice !== undefined) p.home_notice = updates.homeNotice || null;
  if (updates.noticeEnabled !== undefined) p.notice_enabled = updates.noticeEnabled;
  return p;
}

/**
 * H5 Model → API CreateModelInput 完整映射。
 *
 * H5 Model 没有 available_types / can_remote / is_minor / gallery_asset_ids / portfolio /
 * cooperation_history / waist / hip / shoe_size_eu / hometown / city —— 给合理默认让 zod 通过。
 */
function modelToCreateInput(m: Model): AdminCreateModelInput {
  if (!m.code) throw new Error("addModel: 缺少 code（M-YYYY-NNNN）");
  const input: AdminCreateModelInput = {
    code: m.code,
    nickname: m.alias,
    style_tags: m.styles,
    available_types: ["写真"], // H5 表单暂未暴露此字段；默认占位
    can_remote: false,
    is_minor: false,
    gallery_asset_ids: [],
    portfolio: [],
    cooperation_history: [],
  };
  if (m.height > 0) input.height_cm = m.height;
  if (m.weight > 0) input.weight_kg = m.weight;
  if (m.bust > 0) input.bust = m.bust;
  if (m.age > 0) input.age = m.age;
  if (m.district) input.district = m.district;
  if (m.qqNumber) input.qq = m.qqNumber;
  if (m.coverAssetId !== undefined) input.cover_asset_id = m.coverAssetId;
  return input;
}

/**
 * Partial<Model> → Partial<AdminCreateModelInput>。只映射真改了的字段，
 * 让 server 端 zod undefined 跳过保持原值。
 */
function modelToPatch(updates: Partial<Model>): Partial<AdminCreateModelInput> {
  const p: Partial<AdminCreateModelInput> = {};
  if (updates.alias !== undefined) p.nickname = updates.alias;
  if (updates.styles !== undefined) p.style_tags = updates.styles;
  if (updates.height !== undefined && updates.height > 0) p.height_cm = updates.height;
  if (updates.weight !== undefined && updates.weight > 0) p.weight_kg = updates.weight;
  if (updates.bust !== undefined && updates.bust > 0) p.bust = updates.bust;
  if (updates.age !== undefined && updates.age > 0) p.age = updates.age;
  if (updates.district !== undefined) p.district = updates.district;
  if (updates.qqNumber !== undefined) p.qq = updates.qqNumber;
  if (updates.coverAssetId !== undefined) p.cover_asset_id = updates.coverAssetId;
  return p;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [models, setModelsState] = useState<Model[]>(() =>
    load(CACHE_KEYS.models, DEFAULT_MODELS),
  );
  const [settings, setSettings] = useState<SiteSettings>(() =>
    load(CACHE_KEYS.settings, DEFAULT_SETTINGS),
  );
  const [display, setDisplay] = useState<DisplayConfig>(() =>
    load(CACHE_KEYS.display, DEFAULT_DISPLAY),
  );
  const [state, setState] = useState<FetchPhase>({ phase: "loading" });
  const [studioOpen, setStudioOpen] = useState<boolean>(true);
  const [studioNote, setStudioNote] = useState<string | undefined>(undefined);
  // 每次 refresh++ 触发 useEffect 重跑；用 ref-pin token 避免在 effect 里把 token 当 dep
  const [refreshTick, setRefreshTick] = useState(0);

  // 数据源切换：未登录 fetchPublicSnapshot；登录后 fetchAdminSnapshot。
  // 登录态 → 退出 → 重新拉公开端，避免缓存里有 admin 视角的脏 apiId。
  // refreshTick 变化也触发重拉（ErrorScreen / NetworkBanner 调 refresh()）。
  useEffect(() => {
    let cancelled = false;
    const token = session?.access_token;
    const pull = token ? fetchAdminSnapshot(token) : fetchPublicSnapshot();
    setState({ phase: "loading" });
    pull
      .then((snap) => {
        if (cancelled) return;
        setModelsState(snap.models);
        setSettings((prev) => ({ ...snap.settings, adminPin: prev.adminPin }));
        setDisplay(snap.display);
        setStudioOpen(snap.studioOpen);
        setStudioNote(snap.studioNote);
        setState({ phase: "ready" });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const hasCache = localStorage.getItem(CACHE_KEYS.models) !== null;
        // eslint-disable-next-line no-console
        console.warn("[AppContext] snapshot fetch failed:", e);
        setState({
          phase: "failed",
          error: e instanceof Error ? e.message : String(e),
          hasCache,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [session?.access_token, refreshTick]);

  const refresh = useCallback(() => {
    setRefreshTick((t) => t + 1);
  }, []);

  useEffect(() => {
    save(CACHE_KEYS.models, models);
  }, [models]);
  useEffect(() => {
    save(CACHE_KEYS.settings, settings);
  }, [settings]);
  useEffect(() => {
    save(CACHE_KEYS.display, display);
  }, [display]);

  const updateModel = async (id: string, updates: Partial<Model>): Promise<void> => {
    const before = models.find((m) => m.id === id);
    // 本地乐观更新
    setModelsState((prev) => prev.map((m) => (m.id === id ? { ...m, ...updates } : m)));
    if (!session || !before?.apiId) return;
    const patch = modelToPatch(updates);
    if (Object.keys(patch).length === 0) return;
    try {
      await patchAdminModel(before.apiId, patch, session.access_token);
    } catch (e) {
      // 失败回滚到 before（保留本地之前的状态）
      setModelsState((prev) => prev.map((m) => (m.id === id ? before : m)));
      throw e;
    }
  };

  const addModel = async (model: Model): Promise<Model> => {
    if (!session) {
      // 未登录态：纯本地，沿用 Date.now() id
      setModelsState((prev) => [...prev, model]);
      return model;
    }
    const created = await createAdminModel(modelToCreateInput(model), session.access_token);
    const next: Model = {
      ...model,
      id: created.code,
      apiId: created.id,
      code: created.code,
    };
    setModelsState((prev) => [...prev, next]);
    return next;
  };

  const deleteModel = async (id: string): Promise<void> => {
    const before = models.find((m) => m.id === id);
    // 本地立即移除（乐观）
    setModelsState((prev) => prev.filter((m) => m.id !== id));
    if (!session || !before?.apiId) return;
    try {
      await archiveAdminModel(before.apiId, session.access_token);
    } catch (e) {
      // 失败放回原位（追加在尾部，保留其他用户操作）
      setModelsState((prev) => (prev.find((m) => m.id === id) ? prev : [...prev, before]));
      throw e;
    }
  };

  const setModels = (next: Model[]) => setModelsState(next);

  /**
   * 乐观本地 + 已鉴权时后台 PATCH /admin/studio-settings。
   * 失败策略：本地不回滚（最终一致），只 console.warn。
   */
  const updateSettings = (updates: Partial<SiteSettings>) => {
    setSettings((prev) => ({ ...prev, ...updates }));
    if (!session) return;
    const patch = settingsPatchFromUpdates(updates);
    if (Object.keys(patch).length === 0) return;
    patchStudioSettings(patch, session.access_token).catch((e: unknown) => {
      console.warn("[AppContext] updateSettings PATCH failed:", e);
    });
  };

  const updateDisplay = (updates: Partial<DisplayConfig>) => {
    setDisplay((prev) => ({ ...prev, ...updates }));
    if (!session) return;
    patchStudioSettings({ display_config: updates }, session.access_token).catch(
      (e: unknown) => {
        console.warn("[AppContext] updateDisplay PATCH failed:", e);
      },
    );
  };

  return (
    <AppContext.Provider
      value={{
        models,
        settings,
        display,
        state,
        studioOpen,
        studioNote,
        refresh,
        updateModel,
        addModel,
        deleteModel,
        setModels,
        updateSettings,
        updateDisplay,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
