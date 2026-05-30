/**
 * Playwright e2e 配置：双 webServer（API + H5），单 baseURL 指向 vite dev。
 *
 * env 透传：repos 已全切 drizzle/node-postgres，DATABASE_URL 必须指向**真**库；
 * 默认 chiyan_test（与 vitest 共用，跑前 TRUNCATE 即可拿到干净状态）。可用
 * E2E_DATABASE_URL 环境变量覆盖（CI 起独立库时用得上）。
 *
 * API 入口用 dev-with-seed.ts —— 启动时往 admins 表 INSERT owner：
 *   username: owner / password: ChiYan-Test-Password-1!
 *   totp_enrolled: true，secret = E2E_TOTP_SECRET（见 e2e/totp-secret.ts）
 *   登录时必须 currentTotpCode() 算出当下 6 位 code，**不是任何 6 位都过**。
 *
 * 跑前 TRUNCATE 流程：spec 一般在 globalSetup 或 beforeAll 里清 admins/models/etc.
 * 不清会让 dev-with-seed 的 owner INSERT 撞 23505 起不来。
 *
 * 启动顺序：playwright 同时拉起两个 webServer，等各自 ready URL 200 后跑测试。
 */
import { defineConfig } from "@playwright/test";

const SHARED_ENV = {
  ENV: "dev",
  PORT: "3000",
  ALLOWED_ORIGINS: '["http://localhost:5173"]',
  DATABASE_URL:
    process.env.E2E_DATABASE_URL ?? "postgresql://chiyan:dev@127.0.0.1:5432/chiyan_test",
  REDIS_URL: process.env.E2E_REDIS_URL ?? "redis://127.0.0.1:6379",
  MEDIA_ROOT: "/tmp/chiyan-e2e-media",
  API_PUBLIC_URL: "http://localhost:3000",
  JWT_SECRET: "e2e-jwt-secret-at-least-32-bytes-padding-padding-padding",
  ENC_KEY_V1: Buffer.from(new Uint8Array(32).fill(7)).toString("base64"),
};

export default defineConfig({
  testDir: "./e2e/tests",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false, // chiyan_test DB 全局共享，禁并行避免 TRUNCATE/INSERT 互相打架
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5173",
    actionTimeout: 10_000,
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "pnpm --filter @chiyan/api exec tsx src/dev-with-seed.ts",
      url: "http://localhost:3000/health",
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      env: SHARED_ENV,
    },
    {
      command: "pnpm --filter @chiyan/h5 exec vite --port 5173 --strictPort",
      url: "http://localhost:5173",
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
});
