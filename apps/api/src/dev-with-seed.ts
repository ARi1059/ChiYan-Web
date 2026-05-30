/**
 * E2E 测试专用入口：复用主 app，但启动前往 in-memory mock repos 种一个 owner 账号。
 *
 * - totp_enrolled = false → 走 bootstrap 路径，/auth/login/totp 不校验 6 位 code（任何 6 位数字都过）
 * - password = "ChiYan-Test-Password-1!" 满足 LoginRequest schema (min 12)
 * - role = owner → 所有 admin 接口都能写
 *
 * 仅 ENV=dev 时启用；prod 用 server.ts，不会执行 seed。
 */
import "dotenv/config";
import { serve } from "@hono/node-server";
import { createDb } from "@chiyan/db";
import app from "./index";
import { loadEnv } from "./env";
import { _insertForTests as _insertAdminForTests } from "./lib/admin-repo";
import { encrypt } from "./lib/crypto";
import { setDb } from "./lib/db";
import { currentEncVersion, keyRingFromEnv } from "./lib/keyring";
import { hashPassword } from "./lib/password";
import { ensureStudioSettingsSeed } from "./lib/studio-info-repo";

// 与 e2e/totp-secret.ts 必须一致 —— 那边用同 secret 算当下 6 位 code 输进 LoginScreen
const E2E_TOTP_SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";

const env = loadEnv(process.env);
const port = env.PORT ? Number(env.PORT) : 3000;

setDb(createDb(env.DATABASE_URL));
await ensureStudioSettingsSeed();

async function seed() {
  const password_hash = await hashPassword("ChiYan-Test-Password-1!");
  // 用真 TOTP secret 加密落库；fullyOnboarded 中间件要 totp_enrolled=true 才放行 /admin/*。
  // e2e 测试 import 同一 secret 算当下 6 位 code。
  const v = currentEncVersion(env);
  const ring = keyRingFromEnv(env);
  const totp_secret_enc = await encrypt(E2E_TOTP_SECRET, v, ring[v]!);
  await _insertAdminForTests({
    username: "owner",
    display_name: "e2e-owner",
    role: "owner",
    status: "active",
    password_hash,
    totp_secret_enc,
    totp_enrolled: true,
    must_change_password: false,
    failed_login_count: 0,
    locked_until: null,
    last_login_at: null,
  });
  // eslint-disable-next-line no-console
  console.log("[e2e seed] owner / ChiYan-Test-Password-1! / TOTP enrolled");
}

await seed();

serve(
  {
    fetch: (req) => app.fetch(req, env),
    port,
  },
  ({ port: listenPort }) => {
    // eslint-disable-next-line no-console
    console.log(`[e2e api] listening on :${listenPort} (env=${env.ENV})`);
  },
);
