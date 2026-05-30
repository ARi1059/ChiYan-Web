import { useState } from "react";
import { Plus, Pencil, Trash2, ChevronRight, X, Check } from "lucide-react";
import { useApp } from "../store/AppContext";
import { cn } from "../components/ui/utils";
import type { Model } from "../data/models";

type EditingModel = Omit<Model, "id" | "photos"> & { id?: string };

const BLANK: EditingModel = {
  alias: "",
  height: 165,
  weight: 48,
  bust: 86,
  age: 22,
  district: "锦江区",
  styles: [],
  status: "在班",
  photo: "",
  qqNumber: "",
  description: "",
  featured: false,
};

const DISTRICTS = ["锦江区", "武侯区", "成华区", "金牛区", "青羊区", "高新区", "双流区", "天府新区"];
const COMMON_STYLES = ["清纯", "时尚", "甜美", "OL", "高冷", "邻家", "复古", "知性", "活力", "仙气", "国风", "运动"];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  value: string | number;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-secondary rounded-[10px] px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/30"
    />
  );
}

function ModelForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: EditingModel;
  onSave: (m: EditingModel) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<EditingModel>(initial);
  const [stylesInput, setStylesInput] = useState(initial.styles.join("、"));

  const set = (key: keyof EditingModel, value: unknown) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = () => {
    const styles = stylesInput
      .split(/[、,，\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    onSave({ ...form, styles });
  };

  const toggleStyle = (s: string) => {
    const current = stylesInput
      .split(/[、,，\s]+/)
      .map((x) => x.trim())
      .filter(Boolean);
    const next = current.includes(s)
      ? current.filter((x) => x !== s)
      : [...current, s];
    setStylesInput(next.join("、"));
  };

  const currentStyles = stylesInput
    .split(/[、,，\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <div className="fixed inset-0 bg-background z-30 flex flex-col">
      <div className="flex items-center justify-between px-5 pt-12 pb-4 border-b border-border">
        <button onClick={onCancel}>
          <X className="w-5 h-5 text-muted-foreground" />
        </button>
        <h2 className="text-sm font-semibold">{form.id ? "编辑模特" : "新增模特"}</h2>
        <button onClick={handleSave} className="text-primary text-sm font-semibold">
          保存
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        <Field label="化名">
          <TextInput
            value={form.alias}
            onChange={(v) => set("alias", v)}
            placeholder="模特化名"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="身高 (cm)">
            <TextInput type="number" value={form.height} onChange={(v) => set("height", Number(v))} />
          </Field>
          <Field label="体重 (kg)">
            <TextInput type="number" value={form.weight} onChange={(v) => set("weight", Number(v))} />
          </Field>
          <Field label="胸围 (cm)">
            <TextInput type="number" value={form.bust} onChange={(v) => set("bust", Number(v))} />
          </Field>
          <Field label="年龄">
            <TextInput type="number" value={form.age} onChange={(v) => set("age", Number(v))} />
          </Field>
        </div>

        <Field label="所在区">
          <div className="flex flex-wrap gap-2">
            {DISTRICTS.map((d) => (
              <button
                key={d}
                onClick={() => set("district", d)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs border transition-colors",
                  form.district === d
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-foreground border-border"
                )}
              >
                {d}
              </button>
            ))}
          </div>
        </Field>

        <Field label="状态">
          <div className="flex gap-2">
            {(["在班", "空闲", "休息"] as const).map((s) => (
              <button
                key={s}
                onClick={() => set("status", s)}
                className={cn(
                  "flex-1 py-2 rounded-[10px] text-sm border transition-colors",
                  form.status === s
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-foreground border-border"
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </Field>

        <Field label="风格标签（快捷选择）">
          <div className="flex flex-wrap gap-2 mb-2">
            {COMMON_STYLES.map((s) => (
              <button
                key={s}
                onClick={() => toggleStyle(s)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs border transition-colors",
                  currentStyles.includes(s)
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-foreground border-border"
                )}
              >
                {s}
              </button>
            ))}
          </div>
          <TextInput
            value={stylesInput}
            onChange={setStylesInput}
            placeholder="或手动输入，用顿号/逗号分隔"
          />
        </Field>

        <Field label="QQ 号">
          <TextInput
            value={form.qqNumber}
            onChange={(v) => set("qqNumber", v)}
            placeholder="模特 QQ 号"
          />
        </Field>

        <Field label="照片链接">
          <TextInput
            value={form.photo}
            onChange={(v) => set("photo", v)}
            placeholder="https://..."
          />
          {form.photo && (
            <img
              src={form.photo}
              alt="preview"
              className="mt-2 w-full h-40 object-cover rounded-[10px] bg-secondary"
            />
          )}
        </Field>

        <Field label="简介">
          <textarea
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="个人简介…"
            rows={3}
            className="w-full bg-secondary rounded-[10px] px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/30 resize-none"
          />
        </Field>

        <Field label="推荐">
          <button
            onClick={() => set("featured", !form.featured)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-[10px] text-sm border transition-colors",
              form.featured
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-foreground border-border"
            )}
          >
            {form.featured && <Check className="w-4 h-4" />}
            {form.featured ? "已设为推荐" : "设为推荐模特"}
          </button>
        </Field>
      </div>
    </div>
  );
}

export function ModelsTab() {
  const { models, updateModel, addModel, deleteModel } = useApp();
  const [editing, setEditing] = useState<EditingModel | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const handleSave = (m: EditingModel) => {
    if (m.id) {
      updateModel(m.id, {
        alias: m.alias,
        height: m.height,
        weight: m.weight,
        bust: m.bust,
        age: m.age,
        district: m.district,
        styles: m.styles,
        status: m.status,
        photo: m.photo,
        photos: [m.photo],
        qqNumber: m.qqNumber,
        description: m.description,
        featured: m.featured,
      });
    } else {
      addModel({
        ...m,
        id: Date.now().toString(),
        photos: [m.photo],
      } as Model);
    }
    setEditing(null);
  };

  if (editing) {
    return (
      <ModelForm
        initial={editing}
        onSave={handleSave}
        onCancel={() => setEditing(null)}
      />
    );
  }

  return (
    <div className="p-5 space-y-3">
      <button
        onClick={() => setEditing({ ...BLANK })}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-[12px] border-2 border-dashed border-border text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors"
      >
        <Plus className="w-4 h-4" />
        新增模特
      </button>

      {models.map((model) => (
        <div
          key={model.id}
          className="bg-card rounded-[12px] flex items-center gap-3 px-3 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
        >
          <img
            src={model.photo}
            alt={model.alias}
            className="w-12 h-12 rounded-[8px] object-cover flex-shrink-0 bg-secondary"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm text-foreground">{model.alias}</p>
              {model.featured && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">推荐</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {model.district} · {model.height}cm · {model.age}岁 · {model.status}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setEditing({ ...model })}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-secondary transition-colors"
            >
              <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
            {confirmDelete === model.id ? (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => { deleteModel(model.id); setConfirmDelete(null); }}
                  className="px-2 py-1 bg-destructive text-destructive-foreground rounded-full text-[11px]"
                >
                  确认
                </button>
                <button
                  onClick={() => setConfirmDelete(null)}
                  className="px-2 py-1 bg-secondary text-foreground rounded-full text-[11px]"
                >
                  取消
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(model.id)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-secondary transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
