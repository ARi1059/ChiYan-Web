/**
 * portfolio + cooperation_history 通用 repeater。
 *
 * 两者数据 shape 类似（brand + project + year + 可选 cover_asset_id），
 * 但 cooperation_history 无 cover，所以用 showCover prop 控制是否渲染那一栏。
 *
 * cover_asset_id 暂时只展示当前值，未做 picker —— Phase 3 可再开一个 MediaPicker 弹窗。
 * 现在 cover 字段以纯数字 input 暴露，新增模特后可手动填 gallery 中某项的 media_asset_id。
 */
import { Plus, Trash2, ChevronUp, ChevronDown } from "lucide-react";

export interface PortfolioRow {
  brand: string;
  project?: string;
  year?: number;
  cover_asset_id?: number;
}

interface Props {
  label: string;
  items: PortfolioRow[];
  showCover: boolean;
  onChange: (next: PortfolioRow[]) => void;
}

export function PortfolioEditor({ label, items, showCover, onChange }: Props) {
  const update = (idx: number, patch: Partial<PortfolioRow>) => {
    const next = items.map((it, i) => (i === idx ? { ...it, ...patch } : it));
    onChange(next);
  };
  const remove = (idx: number) => {
    onChange(items.filter((_, i) => i !== idx));
  };
  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= items.length) return;
    const next = items.slice();
    const tmp = next[idx]!;
    next[idx] = next[j]!;
    next[j] = tmp;
    onChange(next);
  };
  const add = () => {
    onChange([...items, { brand: "" }]);
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">{label}</div>
        <button
          type="button"
          onClick={add}
          className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs hover:bg-[var(--bg)]"
        >
          <Plus size={12} />
          新增一行
        </button>
      </div>
      {items.length === 0 && (
        <div className="rounded-md border border-dashed border-[var(--border)] px-3 py-2 text-xs text-[var(--muted)]">
          暂无记录
        </div>
      )}
      {items.map((it, idx) => (
        <div
          key={idx}
          className="rounded-md border border-[var(--border)] bg-[var(--card)] p-2 space-y-1.5"
        >
          <div className="flex items-center justify-between text-xs text-[var(--muted)]">
            <span>#{idx + 1}</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => move(idx, -1)}
                disabled={idx === 0}
                className="rounded p-0.5 hover:bg-[var(--bg)] disabled:opacity-30"
                title="上移"
              >
                <ChevronUp size={12} />
              </button>
              <button
                type="button"
                onClick={() => move(idx, 1)}
                disabled={idx === items.length - 1}
                className="rounded p-0.5 hover:bg-[var(--bg)] disabled:opacity-30"
                title="下移"
              >
                <ChevronDown size={12} />
              </button>
              <button
                type="button"
                onClick={() => remove(idx)}
                className="rounded p-0.5 text-[var(--danger)] hover:bg-[var(--danger)]/10"
                title="删除"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <input
              type="text"
              value={it.brand}
              onChange={(e) => update(idx, { brand: e.target.value })}
              placeholder="品牌 *"
              className="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-sm"
            />
            <input
              type="text"
              value={it.project ?? ""}
              onChange={(e) => update(idx, { project: e.target.value || undefined })}
              placeholder="项目（可选）"
              className="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-sm"
            />
            <input
              type="number"
              value={it.year ?? ""}
              onChange={(e) =>
                update(idx, { year: e.target.value ? Number(e.target.value) : undefined })
              }
              placeholder="年份（可选）"
              className="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-sm"
            />
            {showCover && (
              <input
                type="number"
                value={it.cover_asset_id ?? ""}
                onChange={(e) =>
                  update(idx, {
                    cover_asset_id: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
                placeholder="cover media_asset_id（可选）"
                className="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-sm"
              />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
