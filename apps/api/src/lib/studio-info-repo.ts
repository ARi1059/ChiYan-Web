/**
 * Studio Settings 仓储 — drizzle 实现（单行表 id=1）。
 *
 * 写路径（PATCH /admin/studio-settings）+ 读路径（GET /public/studio-info、/public/today）
 * 全部走 drizzle/node-postgres。
 *
 * 单例约束：`studio_settings.id = 1` CHECK 约束。第一次 `getSettings()` 找不到行会调
 * `ensureStudioSettingsSeed()`（INSERT ... ON CONFLICT DO NOTHING）补一行，避免并发 startup race。
 *
 * display_config 是 jsonb，drizzle schema 已 $type 标好，select/insert 直接传对象。
 * business_hours 同理。
 */

import { eq, sql } from "drizzle-orm";
import { schema } from "@chiyan/db";
import { getDb } from "./db";
import type { pub } from "@chiyan/types";
type BusinessHours = pub.BusinessHours;
type DisplayConfig = pub.DisplayConfig;

const studioSettings = schema.studioSettings;

export interface StudioSettingsRecord {
  id: number; // 永远 1
  name: string;
  tagline: string | null;
  address: string | null;
  qq: string;
  qq_group: string | null;
  phone: string | null;
  about: string | null;
  business_hours: BusinessHours;
  home_notice: string | null;
  notice_enabled: boolean;
  display_config: DisplayConfig;
  is_studio_open: boolean;
  resume_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export const DEFAULT_DISPLAY_CONFIG: DisplayConfig = {
  showBust: true,
  showAge: true,
  showDistrict: true,
  showStyles: true,
  showDescription: true,
  showQQNumber: false,
};

const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  weekdays: { open: "09:00", close: "22:00" },
};

/**
 * 把 drizzle 的 camelCase row 翻译成 repo domain shape（snake_case）。
 * 返回值结构与 mock 时代等价，handler 侧零感知。
 */
type Row = typeof studioSettings.$inferSelect;

function toDomain(r: Row): StudioSettingsRecord {
  return {
    id: r.id,
    name: r.name,
    tagline: r.tagline,
    address: r.address,
    qq: r.qq,
    qq_group: r.qqGroup,
    phone: r.phone,
    about: r.about,
    business_hours: r.businessHours,
    home_notice: r.homeNotice,
    notice_enabled: r.noticeEnabled,
    display_config: r.displayConfig,
    is_studio_open: r.isStudioOpen,
    resume_at: r.resumeAt,
    created_at: r.createdAt,
    updated_at: r.updatedAt,
  };
}

/**
 * 启动时一次性保证 id=1 行存在（INSERT ... ON CONFLICT DO NOTHING）。
 * server.ts / dev-with-seed.ts / vitest.setup.ts 各调一次。
 * 注意 CHECK 约束强制 id=1，必须显式赋值绕开 bigserial 自增。
 */
export async function ensureStudioSettingsSeed(): Promise<void> {
  const db = getDb();
  await db
    .insert(studioSettings)
    .values({
      id: 1,
      name: "ChiYan Studio",
      qq: "88888888",
      businessHours: DEFAULT_BUSINESS_HOURS,
      displayConfig: DEFAULT_DISPLAY_CONFIG,
      isStudioOpen: true,
      noticeEnabled: false,
    })
    .onConflictDoNothing({ target: studioSettings.id });
}

export async function getSettings(): Promise<StudioSettingsRecord> {
  const db = getDb();
  const r = await db.query.studioSettings.findFirst({
    where: eq(studioSettings.id, 1),
  });
  if (!r) {
    // 兜底：如果上游忘了 seed（理论上不该走到），seed 一次再查一次
    await ensureStudioSettingsSeed();
    const r2 = await db.query.studioSettings.findFirst({
      where: eq(studioSettings.id, 1),
    });
    if (!r2) throw new Error("[studio-info-repo] seed failed unexpectedly");
    return toDomain(r2);
  }
  return toDomain(r);
}

/**
 * PATCH /admin/studio-settings 入口。
 * display_config 是子部分（partial merge）；其他字段整体覆盖（undefined = 不动，null = 清空）。
 * 返回更新后的完整记录。
 */
export interface StudioSettingsPatch {
  name?: string;
  tagline?: string | null;
  address?: string | null;
  qq?: string;
  qq_group?: string | null;
  phone?: string | null;
  about?: string | null;
  business_hours?: BusinessHours;
  home_notice?: string | null;
  notice_enabled?: boolean;
  display_config?: Partial<DisplayConfig>;
  is_studio_open?: boolean;
  resume_at?: Date | null;
}

export async function updateSettings(patch: StudioSettingsPatch): Promise<StudioSettingsRecord> {
  const db = getDb();

  // display_config 是 partial merge：先拉当前值，浅 merge 后整体写回。
  // 其它 jsonb / 标量字段走标准 column update。
  let mergedDisplay: DisplayConfig | undefined;
  if (patch.display_config !== undefined) {
    const current = await getSettings();
    mergedDisplay = { ...current.display_config, ...patch.display_config };
  }

  const set: Partial<typeof studioSettings.$inferInsert> = { updatedAt: new Date() };
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.tagline !== undefined) set.tagline = patch.tagline;
  if (patch.address !== undefined) set.address = patch.address;
  if (patch.qq !== undefined) set.qq = patch.qq;
  if (patch.qq_group !== undefined) set.qqGroup = patch.qq_group;
  if (patch.phone !== undefined) set.phone = patch.phone;
  if (patch.about !== undefined) set.about = patch.about;
  if (patch.business_hours !== undefined) set.businessHours = patch.business_hours;
  if (patch.home_notice !== undefined) set.homeNotice = patch.home_notice;
  if (patch.notice_enabled !== undefined) set.noticeEnabled = patch.notice_enabled;
  if (mergedDisplay !== undefined) set.displayConfig = mergedDisplay;
  if (patch.is_studio_open !== undefined) set.isStudioOpen = patch.is_studio_open;
  if (patch.resume_at !== undefined) set.resumeAt = patch.resume_at;

  const updated = await db
    .update(studioSettings)
    .set(set)
    .where(eq(studioSettings.id, 1))
    .returning();
  if (updated.length === 0) {
    throw new Error("[studio-info-repo] update affected 0 rows — was seed skipped?");
  }
  return toDomain(updated[0]!);
}

// ─── 测试 helpers（保留接口名，内部走 drizzle TRUNCATE + insert default） ──────

/**
 * 让某些字段（business_hours / display_config / 标志位等）在测试里设特定值。
 * 不存在的列保留默认。
 */
export async function _setForTests(
  partial: Partial<Omit<StudioSettingsRecord, "id" | "created_at" | "updated_at">>,
): Promise<void> {
  await ensureStudioSettingsSeed();
  await updateSettings({
    ...(partial.name !== undefined ? { name: partial.name } : {}),
    ...(partial.tagline !== undefined ? { tagline: partial.tagline } : {}),
    ...(partial.address !== undefined ? { address: partial.address } : {}),
    ...(partial.qq !== undefined ? { qq: partial.qq } : {}),
    ...(partial.qq_group !== undefined ? { qq_group: partial.qq_group } : {}),
    ...(partial.phone !== undefined ? { phone: partial.phone } : {}),
    ...(partial.about !== undefined ? { about: partial.about } : {}),
    ...(partial.business_hours !== undefined ? { business_hours: partial.business_hours } : {}),
    ...(partial.home_notice !== undefined ? { home_notice: partial.home_notice } : {}),
    ...(partial.notice_enabled !== undefined ? { notice_enabled: partial.notice_enabled } : {}),
    ...(partial.display_config !== undefined ? { display_config: partial.display_config } : {}),
    ...(partial.is_studio_open !== undefined ? { is_studio_open: partial.is_studio_open } : {}),
    ...(partial.resume_at !== undefined ? { resume_at: partial.resume_at } : {}),
  });
}

/**
 * beforeEach 调；TRUNCATE 后立刻 re-seed 默认行（很多 test 直接 GET）。
 * RESTART IDENTITY 重置 bigserial 序列（避免 id 累加污染）。
 */
export async function _resetStudioInfoRepoForTests(): Promise<void> {
  const db = getDb();
  await db.execute(sql`TRUNCATE TABLE studio_settings RESTART IDENTITY CASCADE`);
  await ensureStudioSettingsSeed();
}
