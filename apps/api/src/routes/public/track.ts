/**
 * POST /api/v1/public/track
 *
 * H5 埋点：路径访问 + 模特卡点击。fire-and-forget — 立刻 200，
 * 异步落 public_visits（c.executionCtx.waitUntil；测试环境无 executionCtx 时同步 await）。
 *
 * 隐私：
 *  - IP 仅 SHA-256 hash 后落库（ip-hash.ts，无盐）
 *  - 地理 country/city 取 CF 自带（c.req.raw.cf?.country/city；mock/test 环境为 undefined）
 *  - 不存原 IP / 不存 cookie / 不关联 admin
 *
 * Cache-Control: no-store（POST 本就不该缓存，header 显式以防中间件 / Cloudflare 默认值）
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { pub as pubTypes } from "@chiyan/types";
import type { AppContext } from "../../env";
import { ok } from "../../lib/api";
import { hashIp } from "../../lib/ip-hash";
import { findActiveByCode } from "../../lib/models-repo";
import { recordVisit } from "../../lib/visits-repo";

const app = new Hono<AppContext>();

app.post("/", zValidator("json", pubTypes.PublicTrackRequest), async (c) => {
  const { path, referrer, model_code } = c.req.valid("json");

  const ip = c.req.header("CF-Connecting-IP") ?? null;
  const ua = c.req.header("User-Agent") ?? null;

  // CF runtime 注入；mock/test 环境读不到，安全返回 null
  const cfData = (c.req.raw as { cf?: { country?: string; city?: string } }).cf;
  const country = cfData?.country ?? null;
  const city = cfData?.city ?? null;

  // 反查 model_id（model_code 可选；不存在的 code 也照样落访问记录，仅 model_id=null）
  let model_id: number | null = null;
  if (model_code) {
    const r = await findActiveByCode(model_code);
    if (typeof r !== "string") model_id = r.id;
  }

  const ip_hash = await hashIp(ip);

  const writePromise = recordVisit({
    path,
    referrer: referrer ?? null,
    model_id,
    ip_hash,
    ua,
    country,
    city,
  });

  // executionCtx 在 Workers 运行时可用；vitest 默认 Node 环境下 Hono 的 getter 会抛
  let waitUntil: ((p: Promise<unknown>) => void) | undefined;
  try {
    waitUntil = c.executionCtx.waitUntil.bind(c.executionCtx);
  } catch {
    waitUntil = undefined;
  }
  if (waitUntil) {
    waitUntil(writePromise);
  } else {
    await writePromise;
  }

  c.header("Cache-Control", "no-store");
  return ok(c, { recorded: true });
});

export default app;
