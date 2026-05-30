/**
 * /admin/studio-settings — 工作室全局设置（接口方案 §4.9）。
 *
 * 路由：
 *  - GET  / → 当前 settings 完整记录（含 display_config、notice、qq_group）
 *  - PATCH / → 部分更新，display_config 子部分合并
 *
 * 角色：
 *  - 读：owner / admin / operator
 *  - 写：owner / admin（operator 在 SettingsTab 见到但禁改）
 *
 * 写后：写审计 + purgeByTags("studio-info")（H5 的 /public/studio-info 1h 缓存即时失效）。
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { admin as adminTypes } from "@chiyan/types";
import type { AppContext } from "../../env";
import { ok } from "../../lib/api";
import { writeAudit } from "../../lib/audit";
import { purgeByTags } from "../../lib/cf-cache";
import {
  getSettings,
  updateSettings,
  type StudioSettingsPatch,
  type StudioSettingsRecord,
} from "../../lib/studio-info-repo";
import { csrf } from "../../middleware/csrf";
import { fullyOnboarded } from "../../middleware/fully-onboarded";
import { roleRequired } from "../../middleware/role-required";

const app = new Hono<AppContext>();

app.use("*", fullyOnboarded);

function serialize(s: StudioSettingsRecord): adminTypes.AdminStudioSettings {
  return {
    name: s.name,
    tagline: s.tagline,
    address: s.address,
    qq: s.qq,
    qq_group: s.qq_group,
    phone: s.phone,
    business_hours: s.business_hours,
    about: s.about,
    home_notice: s.home_notice,
    notice_enabled: s.notice_enabled,
    display_config: s.display_config,
    is_studio_open: s.is_studio_open,
    resume_at: s.resume_at ? s.resume_at.toISOString() : null,
    updated_at: s.updated_at.toISOString(),
  };
}

app.get("/", roleRequired("owner", "admin", "operator"), async (c) => {
  const s = await getSettings();
  return ok(c, serialize(s));
});

app.patch(
  "/",
  roleRequired("owner", "admin"),
  csrf,
  zValidator("json", adminTypes.AdminUpdateStudioSettingsRequest),
  async (c) => {
    const body = c.req.valid("json");
    const patch: StudioSettingsPatch = {};
    if (body.name !== undefined) patch.name = body.name;
    if (body.tagline !== undefined) patch.tagline = body.tagline;
    if (body.address !== undefined) patch.address = body.address;
    if (body.qq !== undefined) patch.qq = body.qq;
    if (body.qq_group !== undefined) patch.qq_group = body.qq_group;
    if (body.phone !== undefined) patch.phone = body.phone;
    if (body.about !== undefined) patch.about = body.about;
    if (body.business_hours !== undefined) patch.business_hours = body.business_hours;
    if (body.home_notice !== undefined) patch.home_notice = body.home_notice;
    if (body.notice_enabled !== undefined) patch.notice_enabled = body.notice_enabled;
    if (body.display_config !== undefined) patch.display_config = body.display_config;
    if (body.is_studio_open !== undefined) patch.is_studio_open = body.is_studio_open;
    if (body.resume_at !== undefined) {
      patch.resume_at = body.resume_at ? new Date(body.resume_at) : null;
    }
    const updated = await updateSettings(patch);
    const operator = c.get("admin")!;
    await writeAudit({
      admin_id: operator.admin_id,
      action: "admin.studio_settings.updated",
      target_type: "studio_settings",
      target_id: "1",
      payload: { fields: Object.keys(body) },
      ip: c.req.header("CF-Connecting-IP") ?? null,
      ua: c.req.header("User-Agent") ?? null,
    });
    await purgeByTags(c.env, ["studio-info"]);
    return ok(c, serialize(updated));
  },
);

export default app;
