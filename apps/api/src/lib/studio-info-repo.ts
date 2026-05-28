/**
 * Studio Settings 仓储（单行表 id=1）。
 *
 * Phase 2 mock：返回硬编码默认值；测试用 _setForTests 覆盖。
 * Step 7 切真 Drizzle：getSettings 走 db.query.studioSettings.findFirst({where: eq(id, 1)})，
 * 若空则 seed 默认行（migration 0001 可附 INSERT，但 mock 期间不依赖）。
 *
 * 6 条约定对齐 admin-repo.ts。
 */

import type { pub } from "@chiyan/types";
type BusinessHours = pub.BusinessHours;

export interface StudioSettingsRecord {
  id: number;            // 永远 1
  name: string;
  tagline: string | null;
  address: string | null;
  qq: string;
  phone: string | null;
  about: string | null;
  business_hours: BusinessHours;
  is_studio_open: boolean;
  resume_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

const DEFAULTS: StudioSettingsRecord = {
  id: 1,
  name: "ChiYan Studio",
  tagline: null,
  address: null,
  qq: "88888888",
  phone: null,
  about: null,
  business_hours: {
    weekdays: { open: "09:00", close: "22:00" },
  },
  is_studio_open: true,
  resume_at: null,
  created_at: new Date("2026-01-01T00:00:00Z"),
  updated_at: new Date("2026-01-01T00:00:00Z"),
};

let current: StudioSettingsRecord = clone(DEFAULTS);

function clone(s: StudioSettingsRecord): StudioSettingsRecord {
  return {
    ...s,
    business_hours: {
      weekdays: { ...s.business_hours.weekdays },
      weekends: s.business_hours.weekends ? { ...s.business_hours.weekends } : undefined,
    },
  };
}

export async function getSettings(): Promise<StudioSettingsRecord> {
  return clone(current);
}

export function _setForTests(partial: Partial<Omit<StudioSettingsRecord, "id">>): void {
  current = {
    ...current,
    ...partial,
    business_hours: partial.business_hours
      ? {
          weekdays: { ...partial.business_hours.weekdays },
          weekends: partial.business_hours.weekends
            ? { ...partial.business_hours.weekends }
            : undefined,
        }
      : current.business_hours,
    updated_at: new Date(),
  };
}

export function _resetStudioInfoRepoForTests(): void {
  current = clone(DEFAULTS);
}
