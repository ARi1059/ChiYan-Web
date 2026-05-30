/**
 * Playwright e2e 配置：双 webServer（API + H5），单 baseURL 指向 vite dev。
 *
 * env 透传：API 进程需要 dotenv 字段的占位值；mock repos 不真连 Postgres/Redis，所以
 * DATABASE_URL/REDIS_URL 给"看起来像 URL"的字符串就行（zod 只校验 min(1)）。
 *
 * API 入口用 dev-with-seed.ts —— 启动前 seed 一个 owner 账号（见该文件）：
 *   username: owner
 *   password: ChiYan-Test-Password-1!
 *   totp_enrolled: false（bootstrap，任何 6 位 code 都过）
 *
 * 启动顺序：playwright 同时拉起两个 webServer，等各自 ready URL 200 后跑测试。
 */
import { defineConfig } from "@playwright/test";

const SHARED_ENV = {
  ENV: "dev",
  PORT: "3000",
  ALLOWED_ORIGINS: '["http://localhost:5173"]',
  DATABASE_URL: "postgres://e2e-mock-not-used",
  REDIS_URL: "redis://e2e-mock-not-used",
  MEDIA_ROOT: "/tmp/chiyan-e2e-media",
  API_PUBLIC_URL: "http://localhost:3000",
  JWT_SECRET: "e2e-jwt-secret-at-least-32-bytes-padding-padding-padding",
  ENC_KEY_V1: Buffer.from(new Uint8Array(32).fill(7)).toString("base64"),
};

export default defineConfig({
  testDir: "./e2e/tests",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false, // mock repos 全局共享，禁并行避免互相打架
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
