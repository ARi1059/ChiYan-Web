/**
 * 认证相关 schema（接口方案 §4.2）。
 *
 * 两步登录状态机：
 *   POST /auth/login → { challenge_token }   （仅当账密通过）
 *   POST /auth/login/totp → { access_token, must_change_password, totp_enrolled }
 *
 * 关键约定：
 * - 密码 12-128 字符；服务端二次校验复杂度（3 类）
 * - TOTP code 严格 6 位数字
 * - 一次性密码 20 字符 URL-safe，仅响应一次
 * - access_token 在响应里；refresh 走 HttpOnly Cookie，前端拿不到
 */
import { z } from "zod";
import { adminRoleValues } from "./enums";

const password = z.string().min(12).max(128);
const totpCode = z.string().regex(/^\d{6}$/, "TOTP code 必须是 6 位数字");

// ─── /auth/login ───────────────────────────────────────────────
export const LoginRequest = z.object({
  username: z.string().min(1).max(64),
  password,
});
export type LoginRequest = z.infer<typeof LoginRequest>;

export const LoginResponse = z.object({
  challenge_token: z.string(),
});
export type LoginResponse = z.infer<typeof LoginResponse>;

// ─── /auth/login/totp ──────────────────────────────────────────
export const LoginTotpRequest = z.object({
  challenge_token: z.string().min(1),
  code: totpCode,
});
export type LoginTotpRequest = z.infer<typeof LoginTotpRequest>;

export const LoginTotpResponse = z.object({
  access_token: z.string(),
  must_change_password: z.boolean(),
  totp_enrolled: z.boolean(),
});
export type LoginTotpResponse = z.infer<typeof LoginTotpResponse>;

// ─── /auth/refresh ─────────────────────────────────────────────
export const RefreshResponse = z.object({
  access_token: z.string(),
});
export type RefreshResponse = z.infer<typeof RefreshResponse>;

// ─── /auth/me ──────────────────────────────────────────────────
export const MeResponse = z.object({
  id: z.number().int(),
  username: z.string(),
  display_name: z.string(),
  role: z.enum(adminRoleValues),
  must_change_password: z.boolean(),
  totp_enrolled: z.boolean(),
  last_login_at: z.string().datetime().nullable(),
});
export type MeResponse = z.infer<typeof MeResponse>;

// ─── /auth/change-password ─────────────────────────────────────
export const ChangePasswordRequest = z.object({
  old_password: password,
  new_password: password,
});
export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequest>;

// ─── /auth/totp/setup ──────────────────────────────────────────
/** 注意：response 含 secret 明文（仅传给绑定中的用户，不落库直到 verify）。 */
export const TotpSetupResponse = z.object({
  secret: z.string(),
  otpauth_url: z.string().url(),
});
export type TotpSetupResponse = z.infer<typeof TotpSetupResponse>;

// ─── /auth/totp/verify ─────────────────────────────────────────
export const TotpVerifyRequest = z.object({
  secret: z.string(),
  code: totpCode,
});
export type TotpVerifyRequest = z.infer<typeof TotpVerifyRequest>;
