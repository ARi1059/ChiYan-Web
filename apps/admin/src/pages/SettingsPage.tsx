/**
 * /settings 工作室设置 — 桌面完整版。
 *
 * 字段对应 §4.9 PATCH /admin/studio-settings：
 *  - 机构信息：name / tagline / qq / qq_group
 *  - 首页公告：notice_enabled + home_notice
 *  - 前端展示开关：display_config 6 个 bool
 *
 * businessHours 是 jsonb 结构体（weekdays/weekends），桌面端这一轮也只读 —— H5 那边阶段 4
 * 已说明，等待后续专门 UI（time picker）落地。adminPin 是 H5 私有字段，桌面端不展示。
 *
 * 用法：GET 一次 → 本地表单 → "保存"统一发 PATCH（不像 H5 是即时 onChange 触发，
 * 桌面端审慎，admin 会一口气改完再保存）。
 */
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../store/AuthContext";
import { AdminApiError, patchStudioSettings, type StudioSettingsPatch } from "@chiyan/api-client";

interface BusinessHours {
  weekdays: { open: string; close: string };
  weekends?: { open: string; close: string };
}

interface DisplayConfig {
  showBust: boolean;
  showAge: boolean;
  showDistrict: boolean;
  showStyles: boolean;
  showDescription: boolean;
  showQQNumber: boolean;
}

interface StudioForm {
  name: string;
  tagline: string;
  qq: string;
  qq_group: string;
  home_notice: string;
  notice_enabled: boolean;
  business_hours: BusinessHours;
  display_config: DisplayConfig;
}

const EMPTY: StudioForm = {
  name: "",
  tagline: "",
  qq: "",
  qq_group: "",
  home_notice: "",
  notice_enabled: false,
  business_hours: { weekdays: { open: "09:00", close: "22:00" } },
  display_config: {
    showBust: true,
    showAge: true,
    showDistrict: true,
    showStyles: true,
    showDescription: true,
    showQQNumber: false,
  },
};

function formatBH(b: BusinessHours): string {
  const w = `${b.weekdays.open}–${b.weekdays.close}`;
  if (b.weekends) {
    return `工作日 ${w} · 周末 ${b.weekends.open}–${b.weekends.close}`;
  }
  return `每日 ${w}`;
}

const DISPLAY_LABELS: Array<[keyof DisplayConfig, string]> = [
  ["showBust", "胸围"],
  ["showAge", "年龄"],
  ["showDistrict", "所在区"],
  ["showStyles", "风格标签"],
  ["showDescription", "个人简介"],
  ["showQQNumber", "QQ 号"],
];

/** 营业时间默认值 —— 周末从无到有时给一份合理初值，避免空字符串。 */
const DEFAULT_WEEKEND = { open: "10:00", close: "22:00" };

export function SettingsPage() {
  const { session } = useAuth();
  const [form, setForm] = useState<StudioForm>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      // /public/studio-info 公开端 + 信息更完整；不需要 token 但桌面端反正登录了
      const res = await fetch("/api/v1/public/studio-info");
      const env = (await res.json()) as { code: number; data: Record<string, unknown> };
      if (env.code !== 0) throw new Error(`API code ${env.code}`);
      const d = env.data as {
        name: string;
        tagline?: string;
        qq: string;
        qq_group?: string;
        home_notice?: string;
        notice_enabled: boolean;
        business_hours: BusinessHours;
        display_config: DisplayConfig;
      };
      setForm({
        name: d.name,
        tagline: d.tagline ?? "",
        qq: d.qq,
        qq_group: d.qq_group ?? "",
        home_notice: d.home_notice ?? "",
        notice_enabled: d.notice_enabled,
        business_hours: d.business_hours,
        display_config: d.display_config,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "拉取失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setField = <K extends keyof StudioForm>(k: K, v: StudioForm[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const toggleDisplay = (k: keyof DisplayConfig) =>
    setForm((p) => ({
      ...p,
      display_config: { ...p.display_config, [k]: !p.display_config[k] },
    }));

  const handleSave = async () => {
    if (!session || saving) return;
    setSaving(true);
    setError(null);
    setOkMsg(null);
    const patch: StudioSettingsPatch = {
      name: form.name,
      tagline: form.tagline || null,
      qq: form.qq,
      qq_group: form.qq_group || null,
      home_notice: form.home_notice || null,
      notice_enabled: form.notice_enabled,
      business_hours: form.business_hours,
      display_config: form.display_config,
    };
    try {
      await patchStudioSettings(patch, session.access_token);
      setOkMsg("已保存");
      setTimeout(() => setOkMsg(null), 2000);
    } catch (e) {
      setError(e instanceof AdminApiError ? `${e.message}（${e.code}）` : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-baseline justify-between mb-5">
        <div>
          <h2 className="text-xl font-semibold">工作室设置</h2>
          <p className="text-sm text-[var(--muted)] mt-0.5">
            统一管理首页文案、联系方式与字段显隐开关
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={loading || saving}
          className="h-9 px-4 rounded-md bg-[var(--primary)] text-[var(--primary-fg)] text-sm font-medium disabled:opacity-50"
        >
          {saving ? "保存中…" : "保存"}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-[var(--danger)]/10 px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </div>
      )}
      {okMsg && (
        <div className="mb-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{okMsg}</div>
      )}

      <Section title="机构信息">
        <Row label="机构名称">
          <Input value={form.name} onChange={(v) => setField("name", v)} />
        </Row>
        <Row label="副标语">
          <Input value={form.tagline} onChange={(v) => setField("tagline", v)} />
        </Row>
        <Row label="经纪人 QQ">
          <Input value={form.qq} onChange={(v) => setField("qq", v)} />
        </Row>
        <Row label="QQ 群号">
          <Input value={form.qq_group} onChange={(v) => setField("qq_group", v)} />
        </Row>
        <Row label="营业时间">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-[var(--muted)] w-12 shrink-0">工作日</span>
              <TimeInput
                value={form.business_hours.weekdays.open}
                onChange={(v) =>
                  setForm((p) => ({
                    ...p,
                    business_hours: {
                      ...p.business_hours,
                      weekdays: { ...p.business_hours.weekdays, open: v },
                    },
                  }))
                }
              />
              <span className="text-[var(--muted)]">至</span>
              <TimeInput
                value={form.business_hours.weekdays.close}
                onChange={(v) =>
                  setForm((p) => ({
                    ...p,
                    business_hours: {
                      ...p.business_hours,
                      weekdays: { ...p.business_hours.weekdays, close: v },
                    },
                  }))
                }
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-[var(--muted)] cursor-pointer">
              <input
                type="checkbox"
                checked={!!form.business_hours.weekends}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    business_hours: {
                      weekdays: p.business_hours.weekdays,
                      ...(e.target.checked ? { weekends: { ...DEFAULT_WEEKEND } } : {}),
                    },
                  }))
                }
              />
              周末单独设置营业时间
            </label>

            {form.business_hours.weekends && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-[var(--muted)] w-12 shrink-0">周末</span>
                <TimeInput
                  value={form.business_hours.weekends.open}
                  onChange={(v) =>
                    setForm((p) => ({
                      ...p,
                      business_hours: {
                        ...p.business_hours,
                        weekends: { open: v, close: p.business_hours.weekends?.close ?? "" },
                      },
                    }))
                  }
                />
                <span className="text-[var(--muted)]">至</span>
                <TimeInput
                  value={form.business_hours.weekends.close}
                  onChange={(v) =>
                    setForm((p) => ({
                      ...p,
                      business_hours: {
                        ...p.business_hours,
                        weekends: { open: p.business_hours.weekends?.open ?? "", close: v },
                      },
                    }))
                  }
                />
              </div>
            )}

            <p className="text-xs text-[var(--muted)]">
              H5 首页与"今日工作室"展示：{formatBH(form.business_hours)}
            </p>
          </div>
        </Row>
      </Section>

      <Section title="首页公告">
        <Row label="启用">
          <Toggle value={form.notice_enabled} onChange={(v) => setField("notice_enabled", v)} />
        </Row>
        {form.notice_enabled && (
          <Row label="公告内容">
            <textarea
              rows={3}
              value={form.home_notice}
              onChange={(e) => setField("home_notice", e.target.value)}
              className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm resize-none outline-none focus:border-[var(--fg)]"
            />
          </Row>
        )}
      </Section>

      <Section title="前端展示开关">
        <p className="text-xs text-[var(--muted)] mb-3">
          控制 H5 模特卡片 / 详情页哪些字段对游客可见
        </p>
        {DISPLAY_LABELS.map(([key, label]) => (
          <Row key={key} label={label}>
            <Toggle value={form.display_config[key]} onChange={() => toggleDisplay(key)} />
          </Row>
        ))}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[var(--card)] rounded-lg border border-[var(--border)] p-5 mb-4">
      <h3 className="text-sm font-semibold mb-3">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] items-start gap-4">
      <label className="text-sm text-[var(--muted)] pt-1.5">{label}</label>
      <div>{children}</div>
    </div>
  );
}

function Input({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full h-9 px-3 rounded-md border border-[var(--border)] text-sm outline-none focus:border-[var(--fg)]"
    />
  );
}

function TimeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="time"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 px-2 rounded-md border border-[var(--border)] text-sm outline-none focus:border-[var(--fg)]"
    />
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={[
        "relative w-10 h-6 rounded-full transition-colors",
        value ? "bg-[var(--fg)]" : "bg-[var(--border)]",
      ].join(" ")}
    >
      <span
        className={[
          "absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform",
          value ? "translate-x-5" : "translate-x-1",
        ].join(" ")}
      />
    </button>
  );
}
