/**
 * Cloudflare cache purge by Cache-Tag。
 *
 * Phase 2 stub：CF_API_TOKEN / CF_ZONE_ID 未配置时 no-op（console.debug 标注）。
 * Phase 3 admin 写路径触发（编辑模特 → purge tag `model:M-2026-0001`；
 * 排班 → purge tag `roster:2026-05-29`；工作室设置 → `studio-info`），
 * 配合 endpoint 响应里 `Cache-Tag` header（边缘缓存按 tag 拉黑）。
 *
 * 设计：
 * - 失败不抛：缓存清不掉是次要副作用，业务流程优先成功
 * - 调 Cloudflare v4 API（https://api.cloudflare.com/client/v4/zones/{ZONE_ID}/purge_cache）
 * - body `{ tags: [...] }`，Bearer 认证
 */

import type { Env } from "../env";

const CF_PURGE_BASE = "https://api.cloudflare.com/client/v4/zones";

export async function purgeByTags(env: Env, tags: string[]): Promise<void> {
  if (tags.length === 0) return;
  if (!env.CF_API_TOKEN || !env.CF_ZONE_ID) {
    // 开发期常态 —— 留个 debug 痕迹便于复盘
    console.debug(`[cf-cache] skip purge (token/zone 未配置): tags=${tags.join(",")}`);
    return;
  }
  const url = `${CF_PURGE_BASE}/${env.CF_ZONE_ID}/purge_cache`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.CF_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ tags }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(`[cf-cache] purge failed status=${res.status} body=${text.slice(0, 200)}`);
    }
  } catch (err) {
    console.warn(`[cf-cache] purge threw: ${String(err)}`);
  }
}
