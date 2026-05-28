/**
 * Workers Bindings 类型。Phase 1 起按 wrangler.toml 同步扩展：
 * - DATABASE_URL (Neon, secret)
 * - UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN (secret)
 * - R2 buckets
 * - JWT_SECRET / ENC_KEY_V1 等
 */
export type Env = {
  ENV?: "dev" | "staging" | "production";
};
