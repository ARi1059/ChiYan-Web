/**
 * API 进程的环境变量模型与解析器。
 *
 * 单一来源：apps/api/.env（dev）或 systemd EnvironmentFile=/etc/chiyan/secrets.env（prod）。
 * 入口在 server.ts 调 loadEnv(process.env)，把校验过的对象作为 Hono Bindings 传进 app.fetch。
 *
 * 业务/中间件继续读 c.env.X（与 tests 第三参数 ENV 字面量保持同形），
 * 不直接消费 process.env，便于 tests 注入定制 env。
 *
 * **格式约定**：
 *   - ALLOWED_ORIGINS：JSON 数组字符串，例 '["https://chiyan.com","https://admin.chiyan.com"]'
 *     dev 默认 '["http://localhost:5173","http://localhost:5174","http://localhost:3000"]'
 *   - ENC_KEY_V1/V2：base64 编码的 32 字节，crypto lib 解码后用
 *   - JWT_SECRET：至少 32 字节随机字符串
 *   - REDIS_URL：redis://[:password@]host:port[/db]
 *   - DATABASE_URL：postgresql://user:pass@host:port/db
 *   - MEDIA_ROOT：绝对路径，dev 可指本仓库内 .media/ 目录
 *   - API_PUBLIC_URL：媒体 sign 拼绝对 upload_url 用，例 https://api.chiyan.com
 *
 * Variables 收口 middleware 在 c.set(...) 注入的 context 变量。
 */

import { z } from "zod";
import type { BaseClaims } from "./lib/jwt";

const envSchema = z.object({
  ENV: z.enum(["dev", "staging", "production"]).default("dev"),
  ALLOWED_ORIGINS: z.string().default("[]"),

  PORT: z.string().optional(),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  MEDIA_ROOT: z.string().min(1),
  API_PUBLIC_URL: z.string().url(),

  JWT_SECRET: z.string().min(32, "JWT_SECRET 至少 32 字节"),
  ENC_KEY_V1: z.string().min(1),
  ENC_KEY_V2: z.string().optional(),

  /** Cloudflare cache purge（DNS 走 proxied，写路径触发 purge_cache by Cache-Tag）。未配置时 cf-cache 自动 no-op。 */
  CF_API_TOKEN: z.string().optional(),
  CF_ZONE_ID: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(raw: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    console.error(`[env] 配置校验失败:\n${issues}`);
    process.exit(1);
  }
  return result.data;
}

export type Variables = {
  request_id: string;
  /** auth-required middleware 注入；未鉴权路由没有。 */
  admin?: BaseClaims & { admin_id: number };
  /** challenge-required middleware（/auth/login/totp 用）注入。 */
  challenge_admin_id?: number;
};

export type AppContext = {
  Bindings: Env;
  Variables: Variables;
};
