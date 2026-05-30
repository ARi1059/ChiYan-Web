/**
 * /auth/totp/setup | /auth/totp/verify
 *
 * setup：authRequired + csrf。生成新 base32 secret，存 totp-setup-store（TTL 5min，按 admin_id），
 *   返回 secret + otpauth_url（仅供前端二维码渲染）。**不**落 admins.totp_secret_enc。
 *
 * verify：authRequired + csrf。body 也带 secret（接口方案 schema 要求）— 校对其与 store 内的 secret，
 *   防客户端篡改后蒙混过关。一致 + verifyCode(code, secret) 通过 → 加密落库 + totp_enrolled=true。
 *
 * 不强制要求 setup 之后 verify 之前 access token 必须维持同一 admin（authRequired 已保证）。
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { auth as authTypes } from "@chiyan/types";
import type { AppContext } from "../../env";
import { fail, ok } from "../../lib/api";
import { writeAudit } from "../../lib/audit";
import { encrypt } from "../../lib/crypto";
import { currentEncVersion, keyRingFromEnv } from "../../lib/keyring";
import { enrollTotp, findById } from "../../lib/admin-repo";
import { buildOtpAuthUrl, generateSecret, verifyCode } from "../../lib/totp";
import { clearSecret, getSecret, putSecret } from "../../lib/totp-setup-store";
import { authRequired } from "../../middleware/auth-required";
import { csrf } from "../../middleware/csrf";
import { keyFromAdmin, rateLimit } from "../../middleware/rate-limit";

const ISSUER = "ChiYan Studio";

const app = new Hono<AppContext>();

// 整组限流：10/h/admin_id（setup + verify 共享桶，防爆破）。
app.use(
  "*",
  authRequired,
  rateLimit({ bucket: "sensitive_admin", windowMs: 60 * 60 * 1000, max: 10, key: keyFromAdmin }),
);

// ─── POST /totp/setup ─────────────────────────────────────────────
app.post("/setup", csrf, async (c) => {
  const admin = c.get("admin")!;
  const record = await findById(admin.admin_id);
  if (!record) return fail(c, 40101, "未授权");

  const secret = generateSecret();
  await putSecret(admin.admin_id, secret);
  const otpauth_url = buildOtpAuthUrl({
    issuer: ISSUER,
    label: `${ISSUER}:${record.username}`,
    secret,
  });

  return ok(c, { secret, otpauth_url } satisfies authTypes.TotpSetupResponse);
});

// ─── POST /totp/verify ────────────────────────────────────────────
app.post(
  "/verify",
  authRequired,
  csrf,
  zValidator("json", authTypes.TotpVerifyRequest),
  async (c) => {
    const admin = c.get("admin")!;
    const { secret, code } = c.req.valid("json");

    const stored = await getSecret(admin.admin_id);
    if (!stored) {
      return fail(c, 40001, "TOTP 绑定已过期，请重新发起", { sub_code: "totp_setup_expired" });
    }
    // 客户端传回的 secret 必须与服务端 store 一致；不一致直接拒绝（防中间被替换）
    if (stored !== secret) {
      return fail(c, 40001, "TOTP secret 不一致，请重新发起", { sub_code: "totp_setup_invalid" });
    }
    if (!verifyCode(stored, code)) {
      await writeAudit({
        admin_id: admin.admin_id,
        action: "auth.totp.setup_failed",
        target_type: "admin",
        target_id: String(admin.admin_id),
        payload: null,
        ip: c.req.header("CF-Connecting-IP") ?? null,
        ua: c.req.header("User-Agent") ?? null,
      });
      return fail(c, 40001, "TOTP 校验失败", { sub_code: "totp_code_invalid" });
    }

    const ring = keyRingFromEnv(c.env);
    const version = currentEncVersion(c.env);
    const enc = await encrypt(stored, version, ring[version]!);

    await enrollTotp(admin.admin_id, enc);
    await clearSecret(admin.admin_id);

    await writeAudit({
      admin_id: admin.admin_id,
      action: "auth.totp.enrolled",
      target_type: "admin",
      target_id: String(admin.admin_id),
      payload: { key_version: version },
      ip: c.req.header("CF-Connecting-IP") ?? null,
      ua: c.req.header("User-Agent") ?? null,
    });

    return ok(c, { enrolled: true });
  },
);

export default app;
