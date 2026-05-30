/**
 * 桌面端模特新增/编辑抽屉。
 *
 * 设计：右侧 fixed 480px Drawer + 半透明 overlay。打开/关闭由父级 ModelsPage 控制。
 * 表单一次性出全字段；保存按钮在 Drawer 顶部右侧（与 SettingsPage 风格一致）。
 *
 * 字段覆盖接口方案 §4.3 AdminCreateModelRequest 的可填子集。
 *
 * 媒体：
 *  - 单图封面：cover_asset_id，旧 uploadMedia path 保留
 *  - 多图画廊：GalleryEditor 组件管 cover 切换 + 删除 + 多文件上传
 *  - portfolio / cooperation_history：PortfolioEditor 通用 repeater
 *
 * 新建模特时 modelId 还没有，画廊编辑要灰掉（提示先保存基本信息再来编画廊）。
 * 保存：新增 createAdminModel；编辑 patchAdminModel（仅含真改了的字段）。
 */
import { useEffect, useState } from "react";
import { X, Check } from "lucide-react";
import {
  AdminApiError,
  createAdminModel,
  patchAdminModel,
  type AdminCreateModelInput,
  type AdminModelDetail,
} from "@chiyan/api-client";
import { GalleryEditor } from "./GalleryEditor";
import { PortfolioEditor, type PortfolioRow } from "./PortfolioEditor";

const DISTRICTS = [
  "锦江区",
  "武侯区",
  "成华区",
  "金牛区",
  "青羊区",
  "高新区",
  "双流区",
  "天府新区",
];
const COMMON_STYLES = [
  "清纯",
  "时尚",
  "甜美",
  "OL",
  "高冷",
  "邻家",
  "复古",
  "知性",
  "活力",
  "仙气",
  "国风",
  "运动",
];
const COMMON_TYPES = ["写真", "电商", "走秀", "广告", "活动"];

interface FormState {
  code: string;
  nickname: string;
  real_name: string;
  height_cm: string;
  weight_kg: string;
  bust: string;
  waist: string;
  hip: string;
  shoe_size_eu: string;
  age: string;
  age_range: string;
  hometown: string;
  city: string;
  district: string;
  qq: string;
  style_tags: string[];
  available_types: string[];
  can_remote: boolean;
  is_minor: boolean;
  cover_asset_id: number | undefined;
  gallery_asset_ids: number[];
  portfolio: PortfolioRow[];
  cooperation_history: PortfolioRow[];
}

const EMPTY: FormState = {
  code: "",
  nickname: "",
  real_name: "",
  height_cm: "",
  weight_kg: "",
  bust: "",
  waist: "",
  hip: "",
  shoe_size_eu: "",
  age: "",
  age_range: "",
  hometown: "",
  city: "",
  district: "",
  qq: "",
  style_tags: [],
  available_types: ["写真"],
  can_remote: false,
  is_minor: false,
  cover_asset_id: undefined,
  gallery_asset_ids: [],
  portfolio: [],
  cooperation_history: [],
};

function detailToForm(d: AdminModelDetail): FormState {
  return {
    code: d.code,
    nickname: d.nickname,
    real_name: d.real_name ?? "",
    height_cm: d.height_cm?.toString() ?? "",
    weight_kg: d.weight_kg?.toString() ?? "",
    bust: d.bust?.toString() ?? "",
    waist: d.waist?.toString() ?? "",
    hip: d.hip?.toString() ?? "",
    shoe_size_eu: d.shoe_size_eu?.toString() ?? "",
    age: d.age?.toString() ?? "",
    age_range: d.age_range ?? "",
    hometown: d.hometown ?? "",
    city: d.city ?? "",
    district: d.district ?? "",
    qq: d.qq ?? "",
    style_tags: [...d.style_tags],
    available_types: [...d.available_types],
    can_remote: d.can_remote,
    is_minor: d.is_minor,
    cover_asset_id: d.cover_asset_id,
    gallery_asset_ids: [...d.gallery_asset_ids],
    portfolio: d.portfolio.map((p) => ({ ...p })),
    cooperation_history: d.cooperation_history.map((p) => ({ ...p })),
  };
}

interface AdminUpdateModelInput {
  nickname?: string;
  real_name?: string;
  height_cm?: number;
  weight_kg?: number;
  bust?: number;
  waist?: number;
  hip?: number;
  shoe_size_eu?: number;
  age?: number;
  age_range?: string;
  hometown?: string;
  city?: string;
  district?: string;
  qq?: string;
  style_tags?: string[];
  available_types?: string[];
  can_remote?: boolean;
  is_minor?: boolean;
  cover_asset_id?: number;
  gallery_asset_ids?: number[];
  portfolio?: PortfolioRow[];
  cooperation_history?: PortfolioRow[];
}

function numOrUndef(s: string): number | undefined {
  if (!s.trim()) return undefined;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function strOrUndef(s: string): string | undefined {
  return s.trim() ? s : undefined;
}

function formToCreate(f: FormState): AdminCreateModelInput {
  const input: AdminCreateModelInput = {
    code: f.code,
    nickname: f.nickname,
    style_tags: f.style_tags,
    available_types: f.available_types,
    can_remote: f.can_remote,
    is_minor: f.is_minor,
    gallery_asset_ids: [...f.gallery_asset_ids],
    portfolio: f.portfolio.map((p) => ({ ...p })),
    cooperation_history: f.cooperation_history.map((p) => ({ ...p })),
  };
  const h = numOrUndef(f.height_cm);
  if (h !== undefined) input.height_cm = h;
  const w = numOrUndef(f.weight_kg);
  if (w !== undefined) input.weight_kg = w;
  const b = numOrUndef(f.bust);
  if (b !== undefined) input.bust = b;
  const age = numOrUndef(f.age);
  if (age !== undefined) input.age = age;
  const district = strOrUndef(f.district);
  if (district) input.district = district;
  const qq = strOrUndef(f.qq);
  if (qq) input.qq = qq;
  if (f.cover_asset_id !== undefined) input.cover_asset_id = f.cover_asset_id;
  return input;
}

/**
 * 仅写真改了的字段进 patch。
 * 之所以不直接发整份：API zod undefined 跳过保持原值；空串若被传成空 string 反而清掉了原值。
 */
function diffPatch(initial: FormState, current: FormState): Partial<AdminUpdateModelInput> {
  const p: Partial<AdminUpdateModelInput> = {};
  if (current.nickname !== initial.nickname) p.nickname = current.nickname;
  if (current.real_name !== initial.real_name) p.real_name = current.real_name;
  const numFields: Array<[keyof FormState, keyof AdminUpdateModelInput]> = [
    ["height_cm", "height_cm"],
    ["weight_kg", "weight_kg"],
    ["bust", "bust"],
    ["waist", "waist"],
    ["hip", "hip"],
    ["shoe_size_eu", "shoe_size_eu"],
    ["age", "age"],
  ];
  for (const [from, to] of numFields) {
    if (current[from] !== initial[from]) {
      const n = numOrUndef(current[from] as string);
      if (n !== undefined) (p as Record<string, unknown>)[to] = n;
    }
  }
  const strFields: Array<[keyof FormState, keyof AdminUpdateModelInput]> = [
    ["age_range", "age_range"],
    ["hometown", "hometown"],
    ["city", "city"],
    ["district", "district"],
    ["qq", "qq"],
  ];
  for (const [from, to] of strFields) {
    if (current[from] !== initial[from]) {
      const s = strOrUndef(current[from] as string);
      if (s) (p as Record<string, unknown>)[to] = s;
    }
  }
  if (
    current.style_tags.length !== initial.style_tags.length ||
    current.style_tags.some((s, i) => s !== initial.style_tags[i])
  ) {
    p.style_tags = current.style_tags;
  }
  if (
    current.available_types.length !== initial.available_types.length ||
    current.available_types.some((s, i) => s !== initial.available_types[i])
  ) {
    p.available_types = current.available_types;
  }
  if (current.can_remote !== initial.can_remote) p.can_remote = current.can_remote;
  if (current.is_minor !== initial.is_minor) p.is_minor = current.is_minor;
  if (current.cover_asset_id !== initial.cover_asset_id && current.cover_asset_id !== undefined) {
    p.cover_asset_id = current.cover_asset_id;
  }
  // 数组对比：长度变或内容不同就整发新数组（API 写整覆盖语义）。
  if (!sameNumberArray(initial.gallery_asset_ids, current.gallery_asset_ids)) {
    p.gallery_asset_ids = current.gallery_asset_ids;
  }
  if (!samePortfolioArray(initial.portfolio, current.portfolio)) {
    p.portfolio = current.portfolio;
  }
  if (!samePortfolioArray(initial.cooperation_history, current.cooperation_history)) {
    p.cooperation_history = current.cooperation_history;
  }
  return p;
}

function sameNumberArray(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function samePortfolioArray(a: PortfolioRow[], b: PortfolioRow[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    if (x.brand !== y.brand) return false;
    if (x.project !== y.project) return false;
    if (x.year !== y.year) return false;
    if (x.cover_asset_id !== y.cover_asset_id) return false;
  }
  return true;
}

interface Props {
  open: boolean;
  mode: "new" | "edit";
  initial: AdminModelDetail | null;
  accessToken: string;
  onClose: () => void;
  onSaved: () => void;
}

export function ModelEditDrawer({ open, mode, initial, accessToken, onClose, onSaved }: Props) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [snapshot, setSnapshot] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const next = mode === "edit" && initial ? detailToForm(initial) : EMPTY;
    setForm(next);
    setSnapshot(next);
    setError(null);
  }, [open, mode, initial]);

  if (!open) return null;

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const toggleArr = (k: "style_tags" | "available_types", v: string) =>
    setForm((p) => ({
      ...p,
      [k]: p[k].includes(v) ? p[k].filter((x) => x !== v) : [...p[k], v],
    }));

  const handleSave = async () => {
    if (saving) return;
    setError(null);
    if (!form.nickname.trim()) {
      setError("化名不能为空");
      return;
    }
    if (mode === "new" && !/^M-\d{4}-\d{4}$/.test(form.code.trim())) {
      setError("编号格式应为 M-YYYY-NNNN");
      return;
    }
    if (form.style_tags.length === 0) {
      setError("至少选一个风格标签");
      return;
    }
    setSaving(true);
    try {
      if (mode === "new") {
        await createAdminModel(formToCreate(form), accessToken);
      } else if (initial) {
        const patch = diffPatch(snapshot, form);
        if (Object.keys(patch).length > 0) {
          await patchAdminModel(initial.id, patch, accessToken);
        }
      }
      onSaved();
    } catch (err) {
      setError(
        err instanceof AdminApiError ? `保存失败：${err.message}（${err.code}）` : "保存失败",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-30">
      <div className="absolute inset-0 bg-black/30" onClick={() => (saving ? null : onClose())} />
      <aside className="absolute top-0 right-0 h-full w-[480px] bg-[var(--card)] shadow-xl flex flex-col">
        <header className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <h3 className="text-base font-semibold">{mode === "new" ? "新增模特" : "编辑模特"}</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={saving}
              className="px-3 py-1.5 rounded-md text-sm text-[var(--muted)] hover:bg-[var(--bg)] disabled:opacity-40"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-3 py-1.5 rounded-md bg-[var(--primary)] text-[var(--primary-fg)] text-sm font-medium disabled:opacity-50"
            >
              {saving ? "保存中…" : "保存"}
            </button>
            <button
              onClick={onClose}
              disabled={saving}
              className="p-1.5 rounded-md text-[var(--muted)] hover:bg-[var(--bg)]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {error && (
            <div className="rounded-md bg-[var(--danger)]/10 px-3 py-2 text-sm text-[var(--danger)]">
              {error}
            </div>
          )}

          <Section title="基本信息">
            <Field label="编号">
              {mode === "edit" ? (
                <p className="text-sm font-mono text-[var(--muted)]">{form.code}</p>
              ) : (
                <Input
                  value={form.code}
                  onChange={(v) => set("code", v)}
                  placeholder="M-2026-0001"
                />
              )}
            </Field>
            <Field label="化名 *">
              <Input value={form.nickname} onChange={(v) => set("nickname", v)} />
            </Field>
            <Field label="真名">
              <Input
                value={form.real_name}
                onChange={(v) => set("real_name", v)}
                placeholder="（加密落库，不对外公开）"
              />
            </Field>
            <Field label="QQ">
              <Input value={form.qq} onChange={(v) => set("qq", v)} />
            </Field>
          </Section>

          <Section title="身体数据（未成年模特对外自动隐藏）">
            <div className="grid grid-cols-2 gap-3">
              <Field label="身高 (cm)">
                <Input type="number" value={form.height_cm} onChange={(v) => set("height_cm", v)} />
              </Field>
              <Field label="体重 (kg)">
                <Input type="number" value={form.weight_kg} onChange={(v) => set("weight_kg", v)} />
              </Field>
              <Field label="胸围">
                <Input type="number" value={form.bust} onChange={(v) => set("bust", v)} />
              </Field>
              <Field label="腰围">
                <Input type="number" value={form.waist} onChange={(v) => set("waist", v)} />
              </Field>
              <Field label="臀围">
                <Input type="number" value={form.hip} onChange={(v) => set("hip", v)} />
              </Field>
              <Field label="鞋码 (EU)">
                <Input
                  type="number"
                  value={form.shoe_size_eu}
                  onChange={(v) => set("shoe_size_eu", v)}
                />
              </Field>
              <Field label="年龄">
                <Input type="number" value={form.age} onChange={(v) => set("age", v)} />
              </Field>
              <Field label="年龄段（如 20-25）">
                <Input value={form.age_range} onChange={(v) => set("age_range", v)} />
              </Field>
            </div>
          </Section>

          <Section title="所在地">
            <Field label="所在区">
              <ChipRow
                options={DISTRICTS}
                value={form.district ? [form.district] : []}
                onToggle={(d) => set("district", form.district === d ? "" : d)}
                single
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="城市">
                <Input value={form.city} onChange={(v) => set("city", v)} />
              </Field>
              <Field label="籍贯">
                <Input value={form.hometown} onChange={(v) => set("hometown", v)} />
              </Field>
            </div>
          </Section>

          <Section title="标签 *">
            <Field label="风格">
              <ChipRow
                options={COMMON_STYLES}
                value={form.style_tags}
                onToggle={(v) => toggleArr("style_tags", v)}
              />
            </Field>
            <Field label="可接类型">
              <ChipRow
                options={COMMON_TYPES}
                value={form.available_types}
                onToggle={(v) => toggleArr("available_types", v)}
              />
            </Field>
            <div className="flex gap-4 pt-1">
              <CheckBox
                label="可异地"
                value={form.can_remote}
                onChange={(v) => set("can_remote", v)}
              />
              <CheckBox
                label="未成年（隐去身体数据）"
                value={form.is_minor}
                onChange={(v) => set("is_minor", v)}
              />
            </div>
          </Section>

          <Section title="画廊">
            <GalleryEditor
              modelId={initial?.id}
              coverAssetId={form.cover_asset_id}
              galleryAssetIds={form.gallery_asset_ids}
              accessToken={accessToken}
              onChange={(next) => {
                setForm((p) => ({
                  ...p,
                  cover_asset_id: next.coverAssetId,
                  gallery_asset_ids: next.galleryAssetIds,
                }));
              }}
              onError={(msg) => setError(msg)}
            />
          </Section>

          <Section title="作品集（Portfolio）">
            <PortfolioEditor
              label="商业合作"
              items={form.portfolio}
              showCover={true}
              onChange={(next) => setForm((p) => ({ ...p, portfolio: next }))}
            />
          </Section>

          <Section title="合作历史">
            <PortfolioEditor
              label="过往项目"
              items={form.cooperation_history}
              showCover={false}
              onChange={(next) => setForm((p) => ({ ...p, cooperation_history: next }))}
            />
          </Section>
        </div>
      </aside>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">
        {title}
      </h4>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-[var(--muted)] mb-1">{label}</label>
      {children}
    </div>
  );
}

function Input({
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full h-9 px-3 rounded-md border border-[var(--border)] text-sm outline-none focus:border-[var(--fg)] bg-[var(--card)]"
    />
  );
}

function ChipRow({
  options,
  value,
  onToggle,
  single = false,
}: {
  options: string[];
  value: string[];
  onToggle: (v: string) => void;
  single?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const active = value.includes(o);
        return (
          <button
            key={o}
            type="button"
            onClick={() => onToggle(o)}
            className={[
              "px-2.5 py-1 rounded-full text-xs border transition-colors",
              active
                ? "bg-[var(--primary)] text-[var(--primary-fg)] border-[var(--primary)]"
                : "bg-[var(--card)] text-[var(--fg)] border-[var(--border)] hover:border-[var(--fg)]",
            ].join(" ")}
          >
            {single && active ? "✓ " : ""}
            {o}
          </button>
        );
      })}
    </div>
  );
}

function CheckBox({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="flex items-center gap-1.5 text-sm"
    >
      <span
        className={[
          "w-4 h-4 rounded border flex items-center justify-center",
          value
            ? "bg-[var(--primary)] border-[var(--primary)]"
            : "bg-[var(--card)] border-[var(--border)]",
        ].join(" ")}
      >
        {value && <Check className="w-3 h-3 text-[var(--primary-fg)]" />}
      </span>
      <span>{label}</span>
    </button>
  );
}
