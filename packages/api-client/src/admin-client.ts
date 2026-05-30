/**
 * H5 admin 写 API 客户端（/api/v1/admin/*）。
 *
 * 阶段 4 范围：只覆盖 PATCH /admin/studio-settings（settings/display）。
 * 模特 CRUD + roster 仍走本地 localStorage，等阶段 5 媒体链路完工后再接。
 *
 * 鉴权约定（对齐接口方案 §3.2 + middleware/auth-required.ts + middleware/csrf.ts）：
 *  - Authorization: Bearer <access_token>
 *  - X-CSRF-Token: <chiyan_csrf cookie 值>
 *  - credentials: 'include'  让 csrf cookie 与浏览器自动 ship
 *
 * 错误：服务端返回 { code, message }，非 0 抛 AdminApiError；调用方决定是否回滚乐观更新。
 */
const API_BASE = "/api/v1";
const CSRF_COOKIE_NAME = "chiyan_csrf";
const CSRF_HEADER = "X-CSRF-Token";

export class AdminApiError extends Error {
  constructor(
    public code: number,
    message: string,
    public extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AdminApiError";
  }
}

interface ApiEnvelope<T> {
  code: number;
  data?: T;
  message?: string;
}

/**
 * 从 document.cookie 读 CSRF token。
 * 找不到返回 null —— 调用方应在登录态下用，无 CSRF cookie 说明会话已失效。
 */
function readCsrfToken(): string | null {
  const cookies = document.cookie.split(";");
  for (const c of cookies) {
    const [name, ...rest] = c.trim().split("=");
    if (name === CSRF_COOKIE_NAME) return decodeURIComponent(rest.join("="));
  }
  return null;
}

async function authedPatch<TReq, TRes>(
  path: string,
  body: TReq,
  accessToken: string,
): Promise<TRes> {
  const csrf = readCsrfToken();
  if (!csrf) throw new AdminApiError(40301, "CSRF cookie 缺失，请重新登录");
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      [CSRF_HEADER]: csrf,
    },
    credentials: "include",
    body: JSON.stringify(body),
  });
  const env = (await res.json()) as ApiEnvelope<TRes> & Record<string, unknown>;
  if (env.code !== 0 || env.data === undefined) {
    throw new AdminApiError(env.code, env.message ?? "请求失败", env);
  }
  return env.data;
}

async function authedPost<TReq, TRes>(
  path: string,
  body: TReq,
  accessToken: string,
): Promise<TRes> {
  const csrf = readCsrfToken();
  if (!csrf) throw new AdminApiError(40301, "CSRF cookie 缺失，请重新登录");
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      [CSRF_HEADER]: csrf,
    },
    credentials: "include",
    body: JSON.stringify(body),
  });
  const env = (await res.json()) as ApiEnvelope<TRes> & Record<string, unknown>;
  if (env.code !== 0 || env.data === undefined) {
    throw new AdminApiError(env.code, env.message ?? "请求失败", env);
  }
  return env.data;
}

// ─── 媒体上传三步链路 ────────────────────────────────────────────
//
//   sign  → 拿 upload_url + object_key
//   PUT   → 真二进制送进 upload_url（同源时浏览器自动带 Authorization 不可能，
//           所以 H5 主动塞 Bearer + X-CSRF-Token；upload_url query 已含 sig + expires）
//   register → 用 object_key 落 media_assets，拿 media_asset_id
//
// 返回 mediaAssetId，调用方塞进 model.cover_asset_id 或 gallery_asset_ids。

interface MediaSignResponse {
  upload_url: string;
  object_key: string;
  expires_at: string;
}

interface MediaRegisterResponse {
  id: number;
  model_id: number | null;
  url: string;
  original_url: string;
  width: number | null;
  height: number | null;
}

/** SHA-256 → 64 字符小写十六进制（register 入参 hash schema）。 */
async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", buf));
  let hex = "";
  for (const b of digest) hex += b.toString(16).padStart(2, "0");
  return hex;
}

export interface UploadMediaResult {
  media_asset_id: number;
  url: string;
  width: number | null;
  height: number | null;
}

/**
 * 一次性把单文件走完三步上传：sign → PUT → register。
 *
 * 参数：
 *  - file: 浏览器 File 对象（input type=file 来）
 *  - accessToken: AuthContext.session.access_token
 *  - modelId: 可选，绑定到具体模特（register 时落进 media_assets.model_id）
 *
 * 失败：任一步抛 AdminApiError；调用方决定是否提示用户重试。
 * 注意：PUT 步骤如果 upload_url 是绝对的（含 https://api.chiyan.com），fetch 会跨源；
 * 同源 dev 时它会用相对 path：vite proxy 已经把 /api 转到本机 3000，但 upload_url 是绝对的 ——
 * 这里我们把绝对路径剥成 pathname + query 用相对地址 PUT，避开 CORS 与本地证书。
 */
export async function uploadMedia(
  file: File,
  accessToken: string,
  options: { modelId?: number; type?: "image" | "video" } = {},
): Promise<UploadMediaResult> {
  const mediaType = options.type ?? (file.type.startsWith("video/") ? "video" : "image");
  const csrf = readCsrfToken();
  if (!csrf) throw new AdminApiError(40301, "CSRF cookie 缺失，请重新登录");

  // 1) sign
  const signed = await authedPost<
    { type: string; filename: string; content_type: string; size: number },
    MediaSignResponse
  >(
    "/admin/media/sign",
    {
      type: mediaType,
      filename: file.name || "upload.bin",
      content_type: file.type || "application/octet-stream",
      size: file.size,
    },
    accessToken,
  );

  // 2) PUT 文件 —— 把绝对 upload_url 剥成相对路径走 vite proxy，避开 CORS
  const url = new URL(signed.upload_url);
  const relativeUploadPath = `${url.pathname}${url.search}`;
  const buf = await file.arrayBuffer();
  const putRes = await fetch(relativeUploadPath, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      [CSRF_HEADER]: csrf,
      "Content-Type": file.type || "application/octet-stream",
    },
    credentials: "include",
    body: buf,
  });
  if (!putRes.ok) {
    const env = (await putRes.json().catch(() => ({}))) as ApiEnvelope<unknown> &
      Record<string, unknown>;
    throw new AdminApiError(env.code ?? putRes.status, env.message ?? "上传失败", env);
  }

  // 3) register
  const hash = await sha256Hex(buf);
  const registered = await authedPost<
    {
      object_key: string;
      type: string;
      model_id?: number;
      file_size: number;
      hash: string;
    },
    MediaRegisterResponse
  >(
    "/admin/media/register",
    {
      object_key: signed.object_key,
      type: mediaType,
      ...(options.modelId !== undefined ? { model_id: options.modelId } : {}),
      file_size: file.size,
      hash,
    },
    accessToken,
  );

  return {
    media_asset_id: registered.id,
    url: registered.url,
    width: registered.width,
    height: registered.height,
  };
}

// ─── 媒体库读写（GET 列表 / PATCH is_cover / DELETE） ──────────────
//
// 字段说明：与 packages/types/src/admin.ts AdminMediaSummary 对齐。
// model_id 可空（独立素材未绑定模特时为 null）。

export interface AdminMediaSummary {
  id: number;
  model_id: number | null;
  type: "image" | "video";
  url: string;
  original_url: string | null;
  thumb_url: string | null;
  width: number | null;
  height: number | null;
  file_size: number;
  hash: string;
  has_watermark: boolean;
  is_cover: boolean | null;
  uploaded_by: number;
  uploaded_at: string;
}

export interface AdminMediaListResponse {
  items: AdminMediaSummary[];
  total: number;
  page: number;
  page_size: number;
}

export interface ListAdminMediaQuery {
  model_id?: number;
  type?: "image" | "video";
  page?: number;
  page_size?: number;
}

export function listAdminMedia(
  query: ListAdminMediaQuery,
  accessToken: string,
): Promise<AdminMediaListResponse> {
  const qs = new URLSearchParams();
  if (query.model_id !== undefined) qs.set("model_id", String(query.model_id));
  if (query.type !== undefined) qs.set("type", query.type);
  if (query.page !== undefined) qs.set("page", String(query.page));
  if (query.page_size !== undefined) qs.set("page_size", String(query.page_size));
  const tail = qs.toString();
  return authedGet<AdminMediaListResponse>(
    `/admin/media${tail ? `?${tail}` : ""}`,
    accessToken,
  );
}

export interface PatchAdminMediaInput {
  is_cover?: boolean;
  alt?: string;
}

export function patchAdminMedia(
  id: number,
  patch: PatchAdminMediaInput,
  accessToken: string,
): Promise<AdminMediaSummary> {
  return authedPatch<PatchAdminMediaInput, AdminMediaSummary>(
    `/admin/media/${id}`,
    patch,
    accessToken,
  );
}

export function deleteAdminMedia(id: number, accessToken: string): Promise<{ deleted: true }> {
  return authedDelete<{ deleted: true }>(`/admin/media/${id}`, accessToken);
}

// ─── studio-settings PATCH ────────────────────────────────────────

export interface StudioSettingsPatch {
  name?: string;
  tagline?: string | null;
  qq?: string;
  qq_group?: string | null;
  home_notice?: string | null;
  notice_enabled?: boolean;
  display_config?: Partial<{
    showBust: boolean;
    showAge: boolean;
    showDistrict: boolean;
    showStyles: boolean;
    showDescription: boolean;
    showQQNumber: boolean;
  }>;
}

export function patchStudioSettings(
  patch: StudioSettingsPatch,
  accessToken: string,
): Promise<unknown> {
  return authedPatch("/admin/studio-settings", patch, accessToken);
}

// ─── 通用 GET / DELETE helpers ─────────────────────────────────────

async function authedGet<TRes>(path: string, accessToken: string): Promise<TRes> {
  // GET 不挂 csrf middleware（见 apps/api/src/middleware/csrf.ts），只带 Bearer 即可。
  const res = await fetch(`${API_BASE}${path}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
    credentials: "include",
  });
  const env = (await res.json()) as ApiEnvelope<TRes> & Record<string, unknown>;
  if (env.code !== 0 || env.data === undefined) {
    throw new AdminApiError(env.code, env.message ?? "请求失败", env);
  }
  return env.data;
}

async function authedDelete<TRes>(path: string, accessToken: string): Promise<TRes> {
  const csrf = readCsrfToken();
  if (!csrf) throw new AdminApiError(40301, "CSRF cookie 缺失，请重新登录");
  const res = await fetch(`${API_BASE}${path}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}`, [CSRF_HEADER]: csrf },
    credentials: "include",
  });
  const env = (await res.json()) as ApiEnvelope<TRes> & Record<string, unknown>;
  if (env.code !== 0 || env.data === undefined) {
    throw new AdminApiError(env.code, env.message ?? "请求失败", env);
  }
  return env.data;
}

async function authedPut<TReq, TRes>(
  path: string,
  body: TReq,
  accessToken: string,
): Promise<TRes> {
  const csrf = readCsrfToken();
  if (!csrf) throw new AdminApiError(40301, "CSRF cookie 缺失，请重新登录");
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      [CSRF_HEADER]: csrf,
    },
    credentials: "include",
    body: JSON.stringify(body),
  });
  const env = (await res.json()) as ApiEnvelope<TRes> & Record<string, unknown>;
  if (env.code !== 0 || env.data === undefined) {
    throw new AdminApiError(env.code, env.message ?? "请求失败", env);
  }
  return env.data;
}

// ─── 模特管理 ─────────────────────────────────────────────────────
//
// 字段说明：与接口方案 §4.3 + apps/api/src/routes/admin/models.ts 的 serializeDetail 一一对应。
// 这里保留 API 原 snake_case，不做 H5 shape 转换 —— 那是 AppContext / ModelsTab 的事。

export interface AdminModelDetail {
  id: number;
  code: string;
  nickname: string;
  real_name?: string;
  height_cm?: number;
  weight_kg?: number;
  bust?: number;
  waist?: number;
  hip?: number;
  shoe_size_eu?: number;
  age_range?: string;
  age?: number;
  hometown?: string;
  city?: string;
  district?: string;
  qq?: string;
  style_tags: string[];
  available_types: string[];
  can_remote: boolean;
  is_minor: boolean;
  cover_asset_id?: number;
  gallery_asset_ids: number[];
  portfolio: Array<{ brand: string; project?: string; year?: number; cover_asset_id?: number }>;
  cooperation_history: Array<{ brand: string; project?: string; year?: number }>;
  status: "active" | "archived";
  created_at: string;
  updated_at: string;
}

interface AdminModelsListResponse {
  items: AdminModelDetail[];
  total: number;
  page: number;
  page_size: number;
}

export function fetchAdminModels(
  accessToken: string,
  opts: { status?: "active" | "archived"; page?: number; page_size?: number } = {},
): Promise<AdminModelsListResponse> {
  const qs = new URLSearchParams();
  if (opts.status) qs.set("status", opts.status);
  qs.set("page", String(opts.page ?? 1));
  qs.set("page_size", String(opts.page_size ?? 50));
  return authedGet<AdminModelsListResponse>(`/admin/models?${qs.toString()}`, accessToken);
}

/**
 * POST /admin/models 入参子集（接口方案 §4.3 AdminCreateModelRequest）。
 * code/nickname/style_tags/available_types/can_remote/is_minor/gallery_asset_ids/portfolio/cooperation_history 必填，其余可选。
 */
export interface AdminCreateModelInput {
  code: string;
  nickname: string;
  real_name?: string;
  height_cm?: number;
  weight_kg?: number;
  bust?: number;
  age?: number;
  district?: string;
  qq?: string;
  style_tags: string[];
  available_types: string[];
  can_remote: boolean;
  is_minor: boolean;
  cover_asset_id?: number;
  gallery_asset_ids: number[];
  portfolio: Array<{ brand: string; project?: string; year?: number; cover_asset_id?: number }>;
  cooperation_history: Array<{ brand: string; project?: string; year?: number }>;
}

export function createAdminModel(
  input: AdminCreateModelInput,
  accessToken: string,
): Promise<AdminModelDetail> {
  return authedPost<AdminCreateModelInput, AdminModelDetail>("/admin/models", input, accessToken);
}

export function patchAdminModel(
  id: number,
  patch: Partial<AdminCreateModelInput>,
  accessToken: string,
): Promise<AdminModelDetail> {
  return authedPatch<Partial<AdminCreateModelInput>, AdminModelDetail>(
    `/admin/models/${id}`,
    patch,
    accessToken,
  );
}

export function archiveAdminModel(
  id: number,
  accessToken: string,
): Promise<{ archived: true }> {
  return authedDelete<{ archived: true }>(`/admin/models/${id}`, accessToken);
}

// ─── Roster ───────────────────────────────────────────────────────

export interface AdminRosterResponse {
  date: string;
  model_ids: number[];
  note: string | null;
  created_by: number;
  updated_at: string;
}

export function fetchAdminRoster(date: string, accessToken: string): Promise<AdminRosterResponse> {
  return authedGet<AdminRosterResponse>(
    `/admin/roster?date=${encodeURIComponent(date)}`,
    accessToken,
  );
}

export function putAdminRoster(
  date: string,
  model_ids: number[],
  accessToken: string,
  note?: string,
): Promise<AdminRosterResponse> {
  return authedPut<
    { date: string; model_ids: number[]; note?: string },
    AdminRosterResponse
  >(
    "/admin/roster",
    { date, model_ids, ...(note !== undefined ? { note } : {}) },
    accessToken,
  );
}
