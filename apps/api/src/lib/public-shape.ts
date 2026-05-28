/**
 * 公开 endpoint 响应裁剪 helper（跨 today/models/detail 复用）。
 *
 * cropMinor: H5 §四 + 接口方案 §4.9 要求未成年模特不下发身体数据
 * （weight_kg / bust / waist / hip / shoe_size_eu），height_cm 保留。
 *
 * 强制在 handler 出口处调，禁止"按 schema optional 就放心给"。
 */

import type { pub } from "@chiyan/types";
type PublicModelCard = pub.PublicModelCard;
type PublicModelDetail = pub.PublicModelDetail;

const MINOR_STRIPPED_FIELDS = [
  "weight_kg",
  "bust",
  "waist",
  "hip",
  "shoe_size_eu",
] as const satisfies readonly (keyof PublicModelCard)[];

export function cropMinor<T extends PublicModelCard>(card: T): T {
  if (!card.is_minor) return card;
  const out = { ...card } as T;
  for (const k of MINOR_STRIPPED_FIELDS) {
    delete (out as Record<string, unknown>)[k];
  }
  return out;
}

export function cropMinorDetail(detail: PublicModelDetail): PublicModelDetail {
  return cropMinor(detail);
}
