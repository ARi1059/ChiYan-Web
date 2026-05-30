/**
 * /roster 今日名单。
 *
 * 与 H5 RosterTab 等价的桌面版：
 *  - 默认拉今日（YYYY-MM-DD UTC）；右上角日期选择器可换日
 *  - 列表：每行模特 + 勾选；选中加 border 高亮
 *  - 底部"保存"PUT /admin/roster?date=...
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, RefreshCw } from "lucide-react";
import { useAuth } from "../store/AuthContext";
import {
  AdminApiError,
  fetchAdminModels,
  fetchAdminRoster,
  putAdminRoster,
  type AdminModelDetail,
} from "@chiyan/api-client";

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export function RosterPage() {
  const { session } = useAuth();
  const [date, setDate] = useState<string>(todayUtc());
  const [models, setModels] = useState<AdminModelDetail[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!session) return;
    setError(null);
    setLoading(true);
    try {
      const [list, roster] = await Promise.all([
        fetchAdminModels(session.access_token, {
          status: "active",
          page: 1,
          page_size: 100,
        }),
        fetchAdminRoster(date, session.access_token).catch(() => null),
      ]);
      setModels(list.items);
      setSelected(new Set(roster?.model_ids ?? []));
      setDirty(false);
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : "拉取失败");
    } finally {
      setLoading(false);
    }
  }, [session, date]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setDirty(true);
  };

  const handleSave = async () => {
    if (!session || saving) return;
    setSaving(true);
    setError(null);
    try {
      await putAdminRoster(date, Array.from(selected), session.access_token);
      setDirty(false);
    } catch (e) {
      setError(e instanceof AdminApiError ? `${e.message}（${e.code}）` : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const selectedCount = useMemo(() => selected.size, [selected]);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-xl font-semibold">今日名单</h2>
          <p className="text-sm text-[var(--muted)] mt-0.5">
            勾选今日在班模特，保存后即时同步到 H5
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-9 px-3 rounded-md border border-[var(--border)] text-sm bg-[var(--card)]"
          />
          <button
            onClick={refresh}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[var(--border)] text-sm hover:bg-[var(--card)] disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            刷新
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-[var(--danger)]/10 px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3 mb-20">
        {models.length === 0 && !loading ? (
          <p className="text-sm text-[var(--muted)] col-span-full py-12 text-center">
            没有可用模特
          </p>
        ) : (
          models.map((m) => {
            const sel = selected.has(m.id);
            return (
              <button
                key={m.id}
                onClick={() => toggle(m.id)}
                className={[
                  "text-left bg-[var(--card)] rounded-lg p-4 flex items-center gap-3 border-2 transition-colors",
                  sel ? "border-[var(--fg)]" : "border-transparent hover:border-[var(--border)]",
                ].join(" ")}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{m.nickname}</p>
                  <p className="text-xs text-[var(--muted)] mt-0.5 font-mono">{m.code}</p>
                  <p className="text-xs text-[var(--muted)] mt-1">
                    {m.district ?? "—"}
                    {m.height_cm ? ` · ${m.height_cm}cm` : ""}
                  </p>
                </div>
                <div
                  className={[
                    "w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0",
                    sel ? "bg-[var(--fg)] border-[var(--fg)]" : "border-[var(--border)]",
                  ].join(" ")}
                >
                  {sel && <Check className="w-3.5 h-3.5 text-[var(--primary-fg)]" />}
                </div>
              </button>
            );
          })
        )}
      </div>

      <div className="fixed bottom-0 left-60 right-0 bg-[var(--card)] border-t border-[var(--border)] px-8 py-3 flex items-center justify-between">
        <p className="text-sm text-[var(--muted)]">
          {date} · 已选 <span className="text-[var(--fg)] font-medium">{selectedCount}</span> /{" "}
          {models.length}
        </p>
        <button
          onClick={handleSave}
          disabled={!dirty || saving || loading}
          className="h-9 px-4 rounded-md bg-[var(--primary)] text-[var(--primary-fg)] text-sm font-medium disabled:opacity-50"
        >
          {saving ? "保存中…" : dirty ? `保存 (${selectedCount} 位在班)` : "已是最新"}
        </button>
      </div>
    </div>
  );
}
