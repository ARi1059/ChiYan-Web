import { describe, expect, it } from "vitest";
import type { pub } from "@chiyan/types";
type PublicModelCard = pub.PublicModelCard;
import { cropMinor } from "./public-shape";

function makeCard(over: Partial<PublicModelCard> = {}): PublicModelCard {
  return {
    code: "M-2026-0001",
    nickname: "Aiko",
    cover: {
      src: "https://cdn/c.jpg",
      srcset: { "1x": "https://cdn/c.jpg", "2x": "https://cdn/c.jpg", "3x": "https://cdn/c.jpg" },
      width: 1200,
      height: 1600,
    },
    height_cm: 170,
    weight_kg: 52,
    bust: 84,
    waist: 60,
    hip: 88,
    shoe_size_eu: 38,
    age_range: "20-25",
    city: "Shanghai",
    style_tags: ["御姐"],
    available_types: ["写真"],
    can_remote: false,
    is_minor: false,
    ...over,
  };
}

describe("cropMinor", () => {
  it("成年（is_minor=false）→ 全字段保留", () => {
    const c = makeCard();
    const r = cropMinor(c);
    expect(r.weight_kg).toBe(52);
    expect(r.bust).toBe(84);
    expect(r.waist).toBe(60);
    expect(r.hip).toBe(88);
    expect(r.shoe_size_eu).toBe(38);
    expect(r.height_cm).toBe(170);
  });

  it("未成年（is_minor=true）→ 5 字段删除，height_cm 保留", () => {
    const c = makeCard({ is_minor: true });
    const r = cropMinor(c) as PublicModelCard & Record<string, unknown>;
    expect(r.weight_kg).toBeUndefined();
    expect(r.bust).toBeUndefined();
    expect(r.waist).toBeUndefined();
    expect(r.hip).toBeUndefined();
    expect(r.shoe_size_eu).toBeUndefined();
    expect(r.height_cm).toBe(170);
    expect(r.nickname).toBe("Aiko");
    expect(r.is_minor).toBe(true);
  });

  it("未成年 + 5 字段已为 undefined → 仍然不抛 + 不出现在 keys 里", () => {
    const c = makeCard({
      is_minor: true,
      weight_kg: undefined,
      bust: undefined,
      waist: undefined,
      hip: undefined,
      shoe_size_eu: undefined,
    });
    const r = cropMinor(c);
    const keys = Object.keys(r);
    expect(keys).not.toContain("weight_kg");
    expect(keys).not.toContain("bust");
    expect(keys).not.toContain("waist");
    expect(keys).not.toContain("hip");
    expect(keys).not.toContain("shoe_size_eu");
  });

  it("不修改原对象", () => {
    const c = makeCard({ is_minor: true });
    cropMinor(c);
    expect(c.weight_kg).toBe(52);
  });

  it("JSON.stringify 后 body 不含 5 字段名（防御 grep 单测）", () => {
    const c = makeCard({ is_minor: true });
    const json = JSON.stringify(cropMinor(c));
    expect(json).not.toContain("weight_kg");
    expect(json).not.toContain("bust");
    expect(json).not.toContain("waist");
    expect(json).not.toContain('"hip"');
    expect(json).not.toContain("shoe_size_eu");
  });
});
