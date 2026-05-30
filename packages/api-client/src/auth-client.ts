/**
 * H5 鉴权 API 客户端（仅对接 /api/v1/auth/*）。
 *
 * 两步登录状态机：
 *   1) POST /auth/login   { username, password }  → { challenge_token }
 *   2) POST /auth/login/totp { challenge_token, code } → { access_token, must_change_password, totp_enrolled }
 *
 * 关键约定：
 *  - refresh cookie 是 HttpOnly + SameSite，由浏览器自动管，JS 拿不到。
 *  - access_token 由 AuthContext 内存持有（不落 localStorage，关页面就要重登）。
 *  - 所有走 cookie 的请求必须 credentials: 'include'。
 *  - 错误返回 { code, message }；handler 抛 LoginError 携带 code 让 UI 区分锁定 / 错误。
 */
const API_BASE = "/api/v1";

interface ApiEnvelope<T> {
  code: number;
  data?: T;
  message?: string;
  trace_id?: string;
}

export class AuthError extends Error {
  constructor(
    public code: number,
    message: string,
    public extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

async function call<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  const env = (await res.json()) as ApiEnvelope<T> & Record<string, unknown>;
  if (env.code !== 0 || env.data === undefined) {
    throw new AuthError(env.code, env.message ?? "未知错误", env);
  }
  return env.data;
}

export interface LoginResult {
  challenge_token: string;
}

export interface LoginTotpResult {
  access_token: string;
  must_change_password: boolean;
  totp_enrolled: boolean;
}

export function login(username: string, password: string): Promise<LoginResult> {
  return call<LoginResult>("/auth/login", { username, password });
}

export function verifyTotp(challenge_token: string, code: string): Promise<LoginTotpResult> {
  return call<LoginTotpResult>("/auth/login/totp", { challenge_token, code });
}
