/**
 * GET /api/v1/public/today
 *
 * H5 首页"今日工作室"数据。拼装 = studio_settings 状态 + daily_roster.model_ids → models 列表（cropMinor）。
 *
 * Cache-Control: public, max-age=300, s-maxage=300, stale-while-revalidate=60
 *   今日名单变化频率：业主早晨改一次，CDN 5 分钟缓存可接受；
 *   写路径走 cf-cache.purgeByTags("roster:YYYY-MM-DD") 让边缘即时失效。
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { pub as pubTypes } from "@chiyan/types";
import type { AppContext } from "../../env";
import { ok } from "../../lib/api";
import { findActiveByIds, findCoverAndGalleryAssets, type ModelRecord } from "../../lib/models-repo";
import { cropMinor } from "../../lib/public-shape";
import { findByDate } from "../../lib/rosters-repo";
import { getSettings } from "../../lib/studio-info-repo";

const app = new Hono<AppContext>();

/** ISO date 'YYYY-MM-DD'（UTC；H5 默认按用户本地 date 传，server 不强转时区）。 */
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function buildCard(m: ModelRecord, cover: pubTypes.ImageAsset): pubTypes.PublicModelCard {
  return {
    code: m.code,
    nickname: m.nickname,
    cover,
    height_cm: m.height_cm ?? undefined,
    weight_kg: m.weight_kg ?? undefined,
    bust: m.bust ?? undefined,
    waist: m.waist ?? undefined,
    hip: m.hip ?? undefined,
    shoe_size_eu: m.shoe_size_eu ?? undefined,
    age_range: m.age_range ?? undefined,
    age: m.age ?? undefined,
    city: m.city ?? undefined,
    district: m.district ?? undefined,
    qq: m.qq ?? undefined,
    style_tags: m.style_tags,
    available_types: m.available_types,
    can_remote: m.can_remote,
    is_minor: m.is_minor,
  };
}

app.get("/", zValidator("query", pubTypes.PublicTodayQuery), async (c) => {
  const { date } = c.req.valid("query");
  const targetDate = date ?? todayUtc();

  const settings = await getSettings();
  const roster = await findByDate(targetDate);
  const modelIds = roster?.model_ids ?? [];
  const models = await findActiveByIds(modelIds);

  const cards: pubTypes.PublicModelCard[] = [];
  for (const m of models) {
    const { cover } = await findCoverAndGalleryAssets(m);
    if (!cover) continue; // 无封面的不显示在首页（业主写路径应保证封面存在）
    cards.push(cropMinor(buildCard(m, cover)));
  }

  const body: pubTypes.PublicTodayResponse = {
    date: targetDate,
    is_studio_open: settings.is_studio_open,
    business_hours: settings.business_hours,
    resume_at: settings.resume_at ? settings.resume_at.toISOString() : undefined,
    note: roster?.note ?? undefined,
    models: cards,
  };

  c.header("Cache-Control", "public, max-age=300, s-maxage=300, stale-while-revalidate=60");
  c.header("Cache-Tag", `roster:${targetDate},studio-info`);
  return ok(c, body);
});

export default app;
