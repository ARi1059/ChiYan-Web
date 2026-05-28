/**
 * Workers Bindings + Variables 类型。
 *
 * **secrets**（wrangler secret put 注入，不写在 wrangler.toml 里）：
 *   DATABASE_URL / UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN /
 *   JWT_SECRET / ENC_KEY_V1 / ENC_KEY_V2?
 *
 * **vars**（wrangler.toml [vars] 块；本地 .dev.vars 也读这些）：
 *   ENV / ALLOWED_ORIGINS
 *
 * **格式约定**：
 *   - ALLOWED_ORIGINS：**JSON 数组字符串**，例 `'["https://chiyan.com","https://admin.chiyan.com"]'`
 *     dev 填 `'["http://localhost:5173","http://localhost:5174","http://localhost:8787"]'`
 *   - ENC_KEY_V1/V2：base64 编码的 32 字节，crypto lib 解码后用
 *   - JWT_SECRET：至少 32 字节随机字符串
 *
 * Variables 收口 middleware 在 c.set(...) 注入的 context 变量。
 */

import type { Claims } from "./lib/jwt";

export type Env = {
  ENV: "dev" | "staging" | "production";
  ALLOWED_ORIGINS: string;

  DATABASE_URL: string;
  UPSTASH_REDIS_REST_URL: string;
  UPSTASH_REDIS_REST_TOKEN: string;
  JWT_SECRET: string;
  ENC_KEY_V1: string;
  ENC_KEY_V2?: string;
};

export type Variables = {
  request_id: string;
  /** auth-required middleware 注入；未鉴权路由没有。 */
  admin?: Claims & { admin_id: number };
  /** challenge-required middleware（/auth/login/totp 用）注入。 */
  challenge_admin_id?: number;
};

export type AppContext = {
  Bindings: Env;
  Variables: Variables;
};
