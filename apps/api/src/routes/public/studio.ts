/**
 * GET /api/v1/public/studio-info
 *
 * 工作室静态信息（name / tagline / address / qq / phone / about / business_hours）。
 * is_studio_open / resume_at 不在这里 —— 那俩是 today 的"当下状态"字段，由 today endpoint 负责。
 *
 * Cache-Control: public, max-age=3600, s-maxage=3600, stale-while-revalidate=300
 *   变更频率极低（业主一年改几次 qq/about），1h 缓存合理；
 *   Admin 写路径走 cf-cache.purgeByTags("studio-info") 边缘失效。
 */
import { Hono } from "hono";
import { pub as pubTypes } from "@chiyan/types";
import type { AppContext } from "../../env";
import { ok } from "../../lib/api";
import { getSettings } from "../../lib/studio-info-repo";

const app = new Hono<AppContext>();

app.get("/", async (c) => {
  const s = await getSettings();
  const body: pubTypes.PublicStudioInfoResponse = {
    name: s.name,
    tagline: s.tagline ?? undefined,
    address: s.address ?? undefined,
    qq: s.qq,
    phone: s.phone ?? undefined,
    business_hours: s.business_hours,
    about: s.about ?? undefined,
  };
  c.header("Cache-Control", "public, max-age=3600, s-maxage=3600, stale-while-revalidate=300");
  c.header("Cache-Tag", "studio-info");
  return ok(c, body);
});

export default app;
