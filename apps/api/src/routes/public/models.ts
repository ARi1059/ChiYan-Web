/**
 * GET /api/v1/public/models（列表，分页 + filter）
 * GET /api/v1/public/models/:code（详情，三态：200 / 41001 archived / 40401 not_found）
 *
 * Cache-Control：
 *  - list / detail 200 → public, max-age=600, s-maxage=600, stale-while-revalidate=120
 *  - archived 410 → no-store（业主"恢复模特"操作必须立即可见）
 *  - not_found 404 → no-store
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { pub as pubTypes } from "@chiyan/types";
import { z } from "zod";
import type { AppContext } from "../../env";
import { fail, ok } from "../../lib/api";
import {
  findActiveByCode,
  findCoverAndGalleryAssets,
  listActive,
  type ModelRecord,
} from "../../lib/models-repo";
import { cropMinor } from "../../lib/public-shape";

const app = new Hono<AppContext>();

const ModelCodeParam = z.object({
  code: z.string().regex(/^M-\d{4}-\d{4}$/),
});

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

// ─── GET /models ─────────────────────────────────────────────
app.get("/", zValidator("query", pubTypes.PublicModelsQuery), async (c) => {
  const opts = c.req.valid("query");
  const { items, total } = await listActive(opts);

  const cards: pubTypes.PublicModelCard[] = [];
  for (const m of items) {
    const { cover } = await findCoverAndGalleryAssets(m);
    if (!cover) continue;
    cards.push(cropMinor(buildCard(m, cover)));
  }

  const body: pubTypes.PublicModelsResponse = {
    items: cards,
    total,
    page: opts.page,
    page_size: opts.page_size,
  };

  c.header("Cache-Control", "public, max-age=600, s-maxage=600, stale-while-revalidate=120");
  c.header("Cache-Tag", "models-list");
  return ok(c, body);
});

// ─── GET /models/:code ──────────────────────────────────────
app.get("/:code", zValidator("param", ModelCodeParam), async (c) => {
  const { code } = c.req.valid("param");
  const r = await findActiveByCode(code);

  if (r === "not_found") {
    c.header("Cache-Control", "no-store");
    return fail(c, 40401, "模特不存在");
  }
  if (r === "archived") {
    c.header("Cache-Control", "no-store");
    return fail(c, 41001, "模特已下架", { sub_code: "archived" });
  }

  const { cover, gallery } = await findCoverAndGalleryAssets(r);
  // cover 缺失也允许返回详情：H5 用默认占位图；列表过滤是为了首页排版整齐
  const fallbackCover: pubTypes.ImageAsset = cover ?? {
    src: "",
    srcset: { "1x": "", "2x": "", "3x": "" },
    width: 1,
    height: 1,
  };

  const detail: pubTypes.PublicModelDetail = {
    ...buildCard(r, fallbackCover),
    hometown: r.hometown ?? undefined,
    gallery,
    portfolio: r.portfolio.map((p) => ({
      brand: p.brand,
      project: p.project,
      year: p.year,
      // portfolio.cover 暂不接入（mock 阶段；Step 7 接 Cloudflare Images 后补）
      cover: undefined,
    })),
    cooperation_history: r.cooperation_history.map((h) => ({
      brand: h.brand,
      project: h.project,
      year: h.year,
    })),
  };

  c.header("Cache-Control", "public, max-age=600, s-maxage=600, stale-while-revalidate=120");
  c.header("Cache-Tag", `model:${r.code}`);
  return ok(c, cropMinor(detail));
});

export default app;
