/**
 * /dashboard — 数据看板（接口方案 §4.10，owner + admin）。
 *
 * 数据全来自 GET /admin/stats（单请求聚合）：
 *  - 今日 PV / UV（UTC 当天）
 *  - 今日在班模特数
 *  - 待补资料模特数（缺封面或画廊为空）→ 点击跳模特管理
 *  - 在册 / 已归档模特数
 *  - 近 N 天访问热度榜
 *
 * 非 owner/admin 直接敲 /dashboard 会被 API 403，这里转成错误条提示（nav 已对其隐藏）。
 */
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { RefreshCw, Eye, Users, CalendarCheck, AlertTriangle, Flame } from "lucide-react";
import { useAuth } from "../store/AuthContext";
import { AdminApiError, fetchAdminStats, type AdminStatsResponse } from "@chiyan/api-client";

export function DashboardPage() {
  const { session } = useAuth();
  const [stats, setStats] = useState<AdminStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetchAdminStats(session.access_token);
      setStats(r);
    } catch (e: unknown) {
      setError(e instanceof AdminApiError ? `${e.message}（${e.code}）` : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const maxVisits = stats?.top_models.reduce((m, t) => Math.max(m, t.visits), 0) ?? 0;

  return (
    <div className="p-8">
      <div className="flex items-baseline justify-between mb-5">
        <div>
          <h2 className="text-xl font-semibold">数据看板</h2>
          <p className="text-sm text-[var(--muted)] mt-1">
            {stats ? `今日 ${stats.today}（UTC）` : "概览今日访问与模特资料状态"}
          </p>
        </div>
        <button
          onClick={() => void refresh()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[var(--border)] text-sm hover:bg-[var(--bg)] disabled:opacity-50"
        >
          <RefreshCw className={["w-3.5 h-3.5", loading ? "animate-spin" : ""].join(" ")} />
          刷新
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-[var(--danger)]/10 px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </div>
      )}

      {/* 指标卡 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard
          icon={<Eye className="w-4 h-4" />}
          label="今日浏览量 PV"
          value={stats?.visits_today.pv}
          loading={loading}
        />
        <StatCard
          icon={<Users className="w-4 h-4" />}
          label="今日访客 UV"
          value={stats?.visits_today.uv}
          loading={loading}
        />
        <StatCard
          icon={<CalendarCheck className="w-4 h-4" />}
          label="今日在班"
          value={stats?.on_duty_today}
          loading={loading}
          hint={stats ? `在册 ${stats.models.active} 人` : undefined}
        />
        <StatCard
          icon={<AlertTriangle className="w-4 h-4" />}
          label="待补资料"
          value={stats?.models.incomplete}
          loading={loading}
          accent={stats && stats.models.incomplete > 0 ? "warn" : undefined}
          to={stats && stats.models.incomplete > 0 ? "/models" : undefined}
          hint={stats && stats.models.incomplete > 0 ? "去补封面 / 画廊 →" : "资料齐全"}
        />
      </div>

      {/* 热度榜 */}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
        <div className="flex items-center gap-2 mb-4">
          <Flame className="w-4 h-4 text-[var(--accent)]" />
          <h3 className="text-sm font-semibold">访问热度榜</h3>
          {stats && (
            <span className="text-xs text-[var(--muted)]">
              近 {stats.top_models_window_days} 天
            </span>
          )}
        </div>
        {!stats || stats.top_models.length === 0 ? (
          <p className="text-sm text-[var(--muted)] py-6 text-center">
            {loading ? "加载中…" : "暂无访问数据"}
          </p>
        ) : (
          <ol className="space-y-2.5">
            {stats.top_models.map((t, i) => (
              <li key={t.model_id} className="flex items-center gap-3">
                <span
                  className={[
                    "w-5 text-center text-xs font-mono shrink-0",
                    i < 3 ? "text-[var(--accent)] font-semibold" : "text-[var(--muted)]",
                  ].join(" ")}
                >
                  {i + 1}
                </span>
                <div className="w-40 shrink-0 truncate">
                  <span className="text-sm">{t.nickname}</span>
                  {t.code && (
                    <span className="ml-1.5 font-mono text-xs text-[var(--muted)]">{t.code}</span>
                  )}
                </div>
                <div className="flex-1 h-2 rounded-full bg-[var(--bg)] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[var(--accent)]"
                    style={{ width: maxVisits > 0 ? `${(t.visits / maxVisits) * 100}%` : "0%" }}
                  />
                </div>
                <span className="w-12 text-right text-sm font-mono text-[var(--muted)] shrink-0">
                  {t.visits}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  loading,
  hint,
  accent,
  to,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | undefined;
  loading: boolean;
  hint?: string;
  accent?: "warn";
  to?: string;
}) {
  const body = (
    <div
      className={[
        "rounded-lg border bg-[var(--card)] p-4 h-full transition-colors",
        accent === "warn" ? "border-amber-300" : "border-[var(--border)]",
        to ? "hover:bg-[var(--bg)]" : "",
      ].join(" ")}
    >
      <div className="flex items-center gap-2 text-[var(--muted)] text-xs mb-2">
        <span className={accent === "warn" ? "text-amber-600" : ""}>{icon}</span>
        {label}
      </div>
      <div className="text-2xl font-semibold tabular-nums">
        {loading && value === undefined ? "—" : (value ?? 0)}
      </div>
      {hint && <div className="text-xs text-[var(--muted)] mt-1">{hint}</div>}
    </div>
  );
  return to ? (
    <Link to={to} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}
