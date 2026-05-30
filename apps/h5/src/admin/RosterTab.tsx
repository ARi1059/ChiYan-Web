/**
 * 今日名单（Daily Roster）。
 *
 * 与原 Figma 版的差异：
 *  - 旧版按"在班/空闲/休息"改单个 model.status（H5 局部状态）；
 *  - 新版对应 API §4.4 PUT /admin/roster?date=YYYY-MM-DD 集合语义：
 *    选中的 model_ids 即"今日在班"，未选中的 = "空闲"，无第三态。
 *
 * 流程：
 *   mount → fetchAdminRoster(today, token) → 初始化 selectedApiIds
 *   勾选 → 本地切换；底部"保存"按钮 putAdminRoster(date, ids)
 *   保存成功 → 同步本地 model.status，让 HomeSection / ModelDetailSheet 立即反映
 *
 * 未登录态 / 无 apiId 的 model：禁掉，提示需登录后使用真实数据。
 */
import { useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import { useApp } from "../store/AppContext";
import { useAuth } from "../store/AuthContext";
import {
  fetchAdminRoster,
  putAdminRoster,
  AdminApiError,
} from "@chiyan/api-client";
import { cn } from "../components/ui/utils";

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export function RosterTab() {
  const { models, updateModel } = useApp();
  const { session } = useAuth();
  const date = todayUtc();

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  // mount：拉今日 roster 初始化勾选集合
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchAdminRoster(date, session.access_token)
      .then((r) => {
        if (cancelled) return;
        setSelected(new Set(r.model_ids));
        setDirty(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const msg = e instanceof AdminApiError ? e.message : "拉取今日名单失败";
        setError(msg);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [date, session]);

  const modelsWithApiId = useMemo(
    () => models.filter((m) => m.apiId !== undefined),
    [models],
  );

  const toggle = (apiId: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(apiId)) next.delete(apiId);
      else next.add(apiId);
      return next;
    });
    setDirty(true);
  };

  const handleSave = async () => {
    if (!session || saving) return;
    setSaving(true);
    setError(null);
    try {
      const ids = Array.from(selected);
      await putAdminRoster(date, ids, session.access_token);
      // 同步本地 model.status，让 HomeSection 立即反映
      for (const m of models) {
        if (m.apiId === undefined) continue;
        const want: typeof m.status = selected.has(m.apiId) ? "在班" : "空闲";
        if (m.status !== want) {
          // 不发 API（roster 是集合，model 级别不发 PATCH）；只改本地
          updateModel(m.id, { status: want }).catch(() => {
            // updateModel 已登录态会触发 PATCH /admin/models/:id —— 但 status
            // 在 server 端没有这字段，所以 PATCH 是 noop。失败也无所谓，UI 已更新。
          });
        }
      }
      setDirty(false);
    } catch (err) {
      const msg =
        err instanceof AdminApiError ? `${err.message}（${err.code}）` : "保存失败";
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  if (!session) {
    return (
      <div className="p-5 text-sm text-muted-foreground">
        请先登录管理员账号以管理今日名单。
      </div>
    );
  }

  return (
    <div className="p-5 space-y-4" data-testid="roster-tab">
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-sm text-foreground">
            <span className="font-mono">{date}</span> 今日名单
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            勾选今日在班模特；未勾选即为空闲
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          已选 <span className="text-foreground">{selected.size}</span> /{" "}
          {modelsWithApiId.length}
        </p>
      </div>

      {error && (
        <div className="rounded-[10px] bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading && modelsWithApiId.length === 0 ? (
        <p className="text-sm text-muted-foreground">加载中…</p>
      ) : modelsWithApiId.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          还没有可用模特。请先到"模特"标签添加。
        </p>
      ) : (
        <div className="space-y-2">
          {modelsWithApiId.map((model) => {
            const isSel = model.apiId !== undefined && selected.has(model.apiId);
            return (
              <button
                key={model.id}
                onClick={() => model.apiId !== undefined && toggle(model.apiId)}
                className={cn(
                  "w-full bg-card rounded-[12px] p-3 flex items-center gap-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]",
                  "border-2 transition-colors",
                  isSel ? "border-primary" : "border-transparent",
                )}
              >
                <img
                  src={model.photo}
                  alt={model.alias}
                  className="w-10 h-10 rounded-full object-cover flex-shrink-0 bg-secondary"
                />
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-sm text-foreground">{model.alias}</p>
                  <p className="text-xs text-muted-foreground">
                    {model.district || "—"} · {model.height || "?"}cm
                  </p>
                </div>
                <div
                  className={cn(
                    "w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0",
                    isSel
                      ? "bg-primary border-primary"
                      : "bg-transparent border-border",
                  )}
                >
                  {isSel && <Check className="w-3.5 h-3.5 text-primary-foreground" />}
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div className="sticky bottom-0 bg-background pt-3 pb-2">
        <button
          onClick={handleSave}
          disabled={!dirty || saving || loading}
          className={cn(
            "w-full py-3 rounded-[12px] text-sm font-medium",
            "bg-primary text-primary-foreground active:scale-[0.99] transition-transform",
            (!dirty || saving || loading) && "opacity-50 cursor-not-allowed active:scale-100",
          )}
        >
          {saving
            ? "保存中…"
            : dirty
              ? `保存 (${selected.size} 位在班)`
              : "已是最新"}
        </button>
      </div>
    </div>
  );
}
