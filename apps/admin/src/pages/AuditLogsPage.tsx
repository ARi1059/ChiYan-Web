/**
 * /audit-logs — 审计日志只读视图（接口方案 §4.8）。
 *
 * 用法：owner / admin 可见；operator 自动 403（API 端拒绝）。
 * 过滤：
 *  - admin_id（数字）—— 当前没接 admin 列表 select，直接 number input
 *  - action（字符串前缀）—— 实际是精确匹配 API；改 "前缀" 是 H5 视觉上不严格的要求
 *  - target_type（model / roster / media / admin / studio_settings）
 *  - 日期范围 from..to —— ISO datetime UTC；UI 接 datetime-local，提交时转 ISO
 *
 * 翻页：page + page_size。默认 page=1 / size=50。
 *
 * 单条详情：点行展开 expand，显示 payload JSON pretty print。
 */
import { useCallback, useEffect, useState } from "react";
import { RefreshCw, ChevronDown, ChevronRight, Filter, X } from "lucide-react";
import { useAuth } from "../store/AuthContext";
import {
  AdminApiError,
  listAdminAuditLogs,
  type AdminAuditLog,
} from "@chiyan/api-client";

const TARGET_TYPES = ["", "model", "roster", "media", "admin", "studio_settings"] as const;
const PAGE_SIZE = 50;

function fmtTs(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function toDatetimeLocal(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocal(s: string): string | undefined {
  if (!s) return undefined;
  // 浏览器返 "YYYY-MM-DDTHH:mm" 不带秒不带 timezone；按本地时区构 Date 再转 ISO
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

export function AuditLogsPage() {
  const { session } = useAuth();
  const [items, setItems] = useState<AdminAuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  // filter form state（只在点"应用"或回车时才生效；避免每键触发请求）
  const [adminId, setAdminId] = useState("");
  const [action, setAction] = useState("");
  const [targetType, setTargetType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  // applied filter（控制 fetch dep）
  const [applied, setApplied] = useState<{
    admin_id?: number;
    action?: string;
    target_type?: string;
    from?: string;
    to?: string;
  }>({});

  const fetchPage = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      const r = await listAdminAuditLogs(
        { ...applied, page, page_size: PAGE_SIZE },
        session.access_token,
      );
      setItems(r.items);
      setTotal(r.total);
    } catch (e: unknown) {
      setError(e instanceof AdminApiError ? `${e.message}（${e.code}）` : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [session, page, applied]);

  useEffect(() => {
    void fetchPage();
  }, [fetchPage]);

  const applyFilters = () => {
    const next: typeof applied = {};
    if (adminId.trim()) {
      const n = Number(adminId);
      if (Number.isInteger(n) && n > 0) next.admin_id = n;
    }
    if (action.trim()) next.action = action.trim();
    if (targetType.trim()) next.target_type = targetType.trim();
    const f = fromDatetimeLocal(from);
    if (f) next.from = f;
    const t = fromDatetimeLocal(to);
    if (t) next.to = t;
    setPage(1);
    setApplied(next);
  };

  const resetFilters = () => {
    setAdminId("");
    setAction("");
    setTargetType("");
    setFrom("");
    setTo("");
    setPage(1);
    setApplied({});
  };

  const toggleRow = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="p-8">
      <div className="flex items-baseline justify-between mb-5">
        <div>
          <h2 className="text-xl font-semibold">审计日志</h2>
          <p className="text-sm text-[var(--muted)] mt-1">
            共 {total} 条 · 每页 {PAGE_SIZE} 条
          </p>
        </div>
        <button
          onClick={() => void fetchPage()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[var(--border)] text-sm hover:bg-[var(--bg)] disabled:opacity-50"
        >
          <RefreshCw className={["w-3.5 h-3.5", loading ? "animate-spin" : ""].join(" ")} />
          刷新
        </button>
      </div>

      {/* Filters */}
      <div className="rounded-md border border-[var(--border)] bg-[var(--card)] p-3 mb-4">
        <div className="flex items-center gap-2 text-xs text-[var(--muted)] mb-2">
          <Filter className="w-3.5 h-3.5" />
          筛选
        </div>
        <div className="grid grid-cols-5 gap-2">
          <input
            placeholder="admin_id"
            value={adminId}
            onChange={(e) => setAdminId(e.target.value)}
            className="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-sm"
          />
          <input
            placeholder="action（精确）"
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-sm"
          />
          <select
            value={targetType}
            onChange={(e) => setTargetType(e.target.value)}
            className="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-sm"
          >
            {TARGET_TYPES.map((t) => (
              <option key={t || "any"} value={t}>
                {t || "—— target_type ——"}
              </option>
            ))}
          </select>
          <input
            type="datetime-local"
            value={toDatetimeLocal(from || undefined)}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-sm"
          />
          <input
            type="datetime-local"
            value={toDatetimeLocal(to || undefined)}
            onChange={(e) => setTo(e.target.value)}
            className="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-sm"
          />
        </div>
        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={applyFilters}
            className="px-3 py-1.5 rounded-md bg-[var(--primary)] text-[var(--primary-fg)] text-sm font-medium"
          >
            应用
          </button>
          <button
            onClick={resetFilters}
            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md text-sm text-[var(--muted)] hover:text-[var(--fg)]"
          >
            <X className="w-3.5 h-3.5" />
            清空
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-3 rounded-md bg-[var(--danger)]/10 px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="rounded-md border border-[var(--border)] bg-[var(--card)] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[var(--bg)] text-[var(--muted)] text-xs">
            <tr>
              <th className="w-6"></th>
              <th className="text-left px-3 py-2.5">时间</th>
              <th className="text-left px-3 py-2.5">操作员</th>
              <th className="text-left px-3 py-2.5">动作</th>
              <th className="text-left px-3 py-2.5">目标</th>
              <th className="text-left px-3 py-2.5">IP</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-10 text-[var(--muted)]">
                  {loading ? "加载中…" : "暂无记录"}
                </td>
              </tr>
            ) : (
              items.map((r) => {
                const isOpen = expanded.has(r.id);
                return (
                  <tr key={r.id} className="border-t border-[var(--border)] align-top">
                    <td colSpan={6} className="p-0">
                      <button
                        type="button"
                        onClick={() => toggleRow(r.id)}
                        className="w-full text-left grid grid-cols-[24px_180px_140px_220px_220px_120px] gap-2 px-3 py-2.5 hover:bg-[var(--bg)] transition-colors"
                      >
                        {isOpen ? (
                          <ChevronDown className="w-3.5 h-3.5 text-[var(--muted)] mt-0.5" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-[var(--muted)] mt-0.5" />
                        )}
                        <span className="font-mono text-xs text-[var(--muted)]">
                          {fmtTs(r.created_at)}
                        </span>
                        <span>
                          {r.admin_username ? (
                            <>
                              {r.admin_username}
                              <span className="text-[var(--muted)] text-xs"> #{r.admin_id}</span>
                            </>
                          ) : r.admin_id != null ? (
                            <span className="text-[var(--muted)]">#{r.admin_id}</span>
                          ) : (
                            <span className="text-[var(--muted)]">—</span>
                          )}
                        </span>
                        <span className="font-mono text-xs">{r.action}</span>
                        <span className="text-xs">
                          {r.target_type ? (
                            <>
                              <span className="text-[var(--muted)]">{r.target_type}</span>
                              <span> · </span>
                              <span className="font-mono">
                                {r.target_id ??
                                  ((r.payload as Record<string, unknown> | null)?.target_ref as
                                    | string
                                    | undefined) ??
                                  "—"}
                              </span>
                            </>
                          ) : (
                            <span className="text-[var(--muted)]">—</span>
                          )}
                        </span>
                        <span className="font-mono text-xs text-[var(--muted)]">{r.ip ?? "—"}</span>
                      </button>
                      {isOpen && (
                        <div className="border-t border-[var(--border)] bg-[var(--bg)] px-3 py-3 text-xs space-y-1.5">
                          <div className="grid grid-cols-[80px_1fr] gap-2">
                            <span className="text-[var(--muted)]">User-Agent</span>
                            <span className="font-mono break-all">
                              {r.user_agent ?? "—"}
                            </span>
                          </div>
                          <div className="grid grid-cols-[80px_1fr] gap-2">
                            <span className="text-[var(--muted)]">payload</span>
                            <pre className="font-mono whitespace-pre-wrap break-all bg-[var(--card)] rounded p-2 border border-[var(--border)]">
                              {r.payload ? JSON.stringify(r.payload, null, 2) : "null"}
                            </pre>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-end gap-2 mt-3 text-sm">
          <button
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="px-3 py-1 rounded border border-[var(--border)] hover:bg-[var(--bg)] disabled:opacity-40"
          >
            上一页
          </button>
          <span className="text-[var(--muted)] mx-2">
            {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1 rounded border border-[var(--border)] hover:bg-[var(--bg)] disabled:opacity-40"
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
}
