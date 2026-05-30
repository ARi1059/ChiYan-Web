/**
 * /schedule —— 模特档期日历（接口方案 §4.10）。
 *
 * 视图：模特 × 日期 矩阵网格（行=active 模特，列=当月每一天）。
 *  - 顶部：月份导航（上一月 / {y}年{m}月 / 下一月 / 今天）+ 刷新
 *  - 网格：左列模特（横向 sticky），每格按状态着色；有备注的格右上角加点
 *  - 点格 → 编辑弹层：三态切换（可约 / 已约 / 待定）+ 备注 + 保存(upsert) / 清除(delete)
 *
 * 数据：
 *  - fetchAdminModels(active, 100) 拿行
 *  - listAdminSchedule({from,to}) 拿当月全模特档期，按 `${model_id}:${date}` 建索引
 *  - 改动后用 upsert/delete 返回值就地更新索引，不整页重拉
 *
 * 鉴权：GET 三角色可读；PUT/DELETE owner/admin（operator 写会被 API 403）。
 * 日期一律本地构造 + 手动 pad，避开 toISOString 的 UTC 偏移把日子挪错一天。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, RefreshCw, Trash2, X } from "lucide-react";
import { useAuth } from "../store/AuthContext";
import {
  AdminApiError,
  deleteAdminSchedule,
  fetchAdminModels,
  listAdminSchedule,
  upsertAdminSchedule,
  type AdminModelDetail,
  type AdminScheduleEntry,
  type AdminScheduleStatus,
} from "@chiyan/api-client";

const STATUSES: AdminScheduleStatus[] = ["available", "booked", "tentative"];

const STATUS_META: Record<
  AdminScheduleStatus,
  { label: string; char: string; cell: string; solid: string; dot: string }
> = {
  available: {
    label: "可约",
    char: "可",
    cell: "bg-emerald-100 text-emerald-700 hover:bg-emerald-200",
    solid: "bg-emerald-600 text-white border-emerald-600",
    dot: "bg-emerald-500",
  },
  booked: {
    label: "已约",
    char: "约",
    cell: "bg-red-100 text-red-700 hover:bg-red-200",
    solid: "bg-red-600 text-white border-red-600",
    dot: "bg-red-500",
  },
  tentative: {
    label: "待定",
    char: "待",
    cell: "bg-amber-100 text-amber-800 hover:bg-amber-200",
    solid: "bg-amber-500 text-white border-amber-500",
    dot: "bg-amber-500",
  },
};

const WEEKDAY = ["日", "一", "二", "三", "四", "五", "六"];

const pad2 = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m0: number, d: number) => `${y}-${pad2(m0 + 1)}-${pad2(d)}`;
const daysInMonth = (y: number, m0: number) => new Date(y, m0 + 1, 0).getDate();

function localToday(): string {
  const n = new Date();
  return ymd(n.getFullYear(), n.getMonth(), n.getDate());
}

interface DayCol {
  date: string;
  day: number;
  weekday: number; // 0=Sun..6=Sat
  weekend: boolean;
}

function buildDays(y: number, m0: number): DayCol[] {
  const count = daysInMonth(y, m0);
  const out: DayCol[] = [];
  for (let d = 1; d <= count; d++) {
    const weekday = new Date(y, m0, d).getDay();
    out.push({ date: ymd(y, m0, d), day: d, weekday, weekend: weekday === 0 || weekday === 6 });
  }
  return out;
}

const keyOf = (modelId: number, date: string) => `${modelId}:${date}`;

interface EditTarget {
  model: AdminModelDetail;
  day: DayCol;
  entry: AdminScheduleEntry | null;
}

export function SchedulePage() {
  const { session } = useAuth();
  const today = localToday();

  const [cursor, setCursor] = useState(() => {
    const n = new Date();
    return { y: n.getFullYear(), m0: n.getMonth() };
  });
  const [models, setModels] = useState<AdminModelDetail[]>([]);
  const [byKey, setByKey] = useState<Record<string, AdminScheduleEntry>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditTarget | null>(null);

  const days = useMemo(() => buildDays(cursor.y, cursor.m0), [cursor]);

  const refresh = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    const from = ymd(cursor.y, cursor.m0, 1);
    const to = ymd(cursor.y, cursor.m0, daysInMonth(cursor.y, cursor.m0));
    try {
      const [list, range] = await Promise.all([
        fetchAdminModels(session.access_token, { status: "active", page: 1, page_size: 100 }),
        listAdminSchedule({ from, to }, session.access_token),
      ]);
      setModels(list.items);
      const map: Record<string, AdminScheduleEntry> = {};
      for (const e of range.items) map[keyOf(e.model_id, e.date)] = e;
      setByKey(map);
    } catch (e) {
      setError(e instanceof AdminApiError ? `${e.message}（${e.code}）` : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [session, cursor]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Esc 关编辑弹层
  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setEditing(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing]);

  const gotoMonth = (delta: number) => {
    setCursor((c) => {
      const m = c.m0 + delta;
      if (m < 0) return { y: c.y - 1, m0: 11 };
      if (m > 11) return { y: c.y + 1, m0: 0 };
      return { y: c.y, m0: m };
    });
  };

  const gotoToday = () => {
    const n = new Date();
    setCursor({ y: n.getFullYear(), m0: n.getMonth() });
  };

  const applyEntry = (e: AdminScheduleEntry) =>
    setByKey((prev) => ({ ...prev, [keyOf(e.model_id, e.date)]: e }));

  const dropEntry = (modelId: number, date: string) =>
    setByKey((prev) => {
      const next = { ...prev };
      delete next[keyOf(modelId, date)];
      return next;
    });

  const entriesCount = useMemo(() => Object.keys(byKey).length, [byKey]);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <CalendarDays className="w-5 h-5" />
            档期日历
          </h2>
          <p className="text-sm text-[var(--muted)] mt-0.5">
            共 {models.length} 位模特 · 当月 {entriesCount} 条档期 · 点格编辑
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-md border border-[var(--border)] bg-[var(--card)]">
            <button
              onClick={() => gotoMonth(-1)}
              className="p-2 text-[var(--muted)] hover:text-[var(--fg)] hover:bg-[var(--bg)] rounded-l-md"
              aria-label="上一月"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 text-sm font-medium tabular-nums min-w-[92px] text-center">
              {cursor.y}年{cursor.m0 + 1}月
            </span>
            <button
              onClick={() => gotoMonth(1)}
              className="p-2 text-[var(--muted)] hover:text-[var(--fg)] hover:bg-[var(--bg)] rounded-r-md"
              aria-label="下一月"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <button
            onClick={gotoToday}
            className="px-3 py-1.5 rounded-md border border-[var(--border)] text-sm hover:bg-[var(--card)]"
          >
            今天
          </button>
          <button
            onClick={() => void refresh()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[var(--border)] text-sm hover:bg-[var(--card)] disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            刷新
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mb-3 text-xs text-[var(--muted)]">
        {STATUSES.map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span className={`w-3 h-3 rounded-sm ${STATUS_META[s].dot}`} />
            {STATUS_META[s].label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm border border-[var(--border)] bg-[var(--card)]" />
          未设
        </span>
      </div>

      {error && (
        <div className="mb-3 rounded-md bg-[var(--danger)]/10 px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </div>
      )}

      {/* Grid */}
      <div className="rounded-md border border-[var(--border)] bg-[var(--card)] overflow-x-auto">
        <div className="min-w-max">
          {/* header row */}
          <div className="flex border-b border-[var(--border)] bg-[var(--bg)]">
            <div className="sticky left-0 z-20 w-44 flex-shrink-0 px-3 py-2 bg-[var(--bg)] text-xs font-medium text-[var(--muted)] border-r border-[var(--border)]">
              模特 \ 日期
            </div>
            {days.map((d) => (
              <div
                key={d.date}
                className={[
                  "w-9 flex-shrink-0 py-1 text-center leading-tight",
                  d.weekend ? "bg-[var(--bg)]" : "",
                  d.date === today ? "bg-[var(--accent)]/15" : "",
                ].join(" ")}
              >
                <div className="text-xs font-medium tabular-nums">{d.day}</div>
                <div
                  className={`text-[10px] ${d.weekend ? "text-[var(--danger)]" : "text-[var(--muted)]"}`}
                >
                  {WEEKDAY[d.weekday]}
                </div>
              </div>
            ))}
          </div>

          {/* model rows */}
          {models.length === 0 ? (
            <div className="px-3 py-12 text-center text-sm text-[var(--muted)]">
              {loading ? "加载中…" : "没有可用模特"}
            </div>
          ) : (
            models.map((m) => (
              <div key={m.id} className="flex border-b border-[var(--border)] last:border-b-0">
                <div className="sticky left-0 z-10 w-44 flex-shrink-0 px-3 py-2 bg-[var(--card)] border-r border-[var(--border)]">
                  <p className="text-sm font-medium truncate">{m.nickname}</p>
                  <p className="text-[11px] text-[var(--muted)] font-mono truncate">{m.code}</p>
                </div>
                {days.map((d) => {
                  const entry = byKey[keyOf(m.id, d.date)] ?? null;
                  const meta = entry ? STATUS_META[entry.status] : null;
                  return (
                    <button
                      key={d.date}
                      onClick={() => setEditing({ model: m, day: d, entry })}
                      title={
                        entry
                          ? `${STATUS_META[entry.status].label}${entry.note ? ` · ${entry.note}` : ""}`
                          : "未设"
                      }
                      className={[
                        "w-9 h-10 flex-shrink-0 relative flex items-center justify-center text-xs border-r border-[var(--border)] last:border-r-0 transition-colors",
                        meta ? meta.cell : "hover:bg-[var(--bg)]",
                        !entry && d.weekend ? "bg-[var(--bg)]/60" : "",
                        d.date === today ? "ring-1 ring-inset ring-[var(--accent)]/40" : "",
                      ].join(" ")}
                    >
                      {meta && <span className="font-medium">{meta.char}</span>}
                      {entry?.note && (
                        <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-current opacity-70" />
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>

      {editing && (
        <CellEditor
          target={editing}
          accessToken={session?.access_token ?? ""}
          onClose={() => setEditing(null)}
          onSaved={(e) => {
            applyEntry(e);
            setEditing(null);
          }}
          onCleared={() => {
            dropEntry(editing.model.id, editing.day.date);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

// ─── 单格编辑弹层 ───────────────────────────────────────────────────

function CellEditor({
  target,
  accessToken,
  onClose,
  onSaved,
  onCleared,
}: {
  target: EditTarget;
  accessToken: string;
  onClose: () => void;
  onSaved: (e: AdminScheduleEntry) => void;
  onCleared: () => void;
}) {
  const { model, day, entry } = target;
  const [status, setStatus] = useState<AdminScheduleStatus>(entry?.status ?? "available");
  const [note, setNote] = useState(entry?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleSave = async () => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const trimmed = note.trim();
      const saved = await upsertAdminSchedule(
        {
          model_id: model.id,
          date: day.date,
          status,
          note: trimmed ? trimmed : null,
        },
        accessToken,
      );
      onSaved(saved);
    } catch (e) {
      setErr(e instanceof AdminApiError ? `${e.message}（${e.code}）` : "保存失败");
      setBusy(false);
    }
  };

  const handleClear = async () => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      await deleteAdminSchedule(model.id, day.date, accessToken);
      onCleared();
    } catch (e) {
      setErr(e instanceof AdminApiError ? `${e.message}（${e.code}）` : "清除失败");
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={() => (busy ? null : onClose())} />
      <div className="relative w-[360px] bg-[var(--card)] rounded-lg shadow-xl border border-[var(--border)]">
        <header className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <div>
            <h3 className="text-base font-semibold">{model.nickname}</h3>
            <p className="text-xs text-[var(--muted)] mt-0.5 font-mono">
              {day.date} 周{WEEKDAY[day.weekday]}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            className="p-1.5 rounded-md text-[var(--muted)] hover:bg-[var(--bg)] disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs text-[var(--muted)] mb-1.5">状态</label>
            <div className="grid grid-cols-3 gap-2">
              {STATUSES.map((s) => {
                const meta = STATUS_META[s];
                const active = status === s;
                return (
                  <button
                    key={s}
                    onClick={() => setStatus(s)}
                    disabled={busy}
                    className={[
                      "py-2 rounded-md text-sm font-medium border transition-colors disabled:opacity-50",
                      active
                        ? meta.solid
                        : "bg-[var(--bg)] text-[var(--muted)] border-[var(--border)] hover:text-[var(--fg)]",
                    ].join(" ")}
                  >
                    {meta.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs text-[var(--muted)] mb-1.5">备注（可选）</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={200}
              placeholder="客户 / 场地 / 时间段…"
              className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
            />
          </div>

          {err && (
            <div className="rounded-md bg-[var(--danger)]/10 px-3 py-2 text-sm text-[var(--danger)]">
              {err}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between px-5 py-3 border-t border-[var(--border)]">
          {entry ? (
            <button
              onClick={handleClear}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm text-[var(--danger)] hover:bg-[var(--danger)]/10 disabled:opacity-40"
            >
              <Trash2 className="w-3.5 h-3.5" />
              清除
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={busy}
              className="px-3 py-1.5 rounded-md text-sm text-[var(--muted)] hover:bg-[var(--bg)] disabled:opacity-40"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={busy}
              className="px-4 py-1.5 rounded-md bg-[var(--primary)] text-[var(--primary-fg)] text-sm font-medium disabled:opacity-50"
            >
              {busy ? "保存中…" : "保存"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
