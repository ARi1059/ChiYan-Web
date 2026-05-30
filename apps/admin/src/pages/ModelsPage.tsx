/**
 * /models 模特管理列表页。
 *
 * 覆盖：
 *  - GET /admin/models?status=active → 表格（封面 / 编号 / 化名 / 区 / 身高 / 风格 / 创建时间 / 操作）
 *  - POST /admin/models（新增，走 ModelEditDrawer）
 *  - PATCH /admin/models/:id（编辑，同上）
 *  - DELETE /admin/models/:id（归档）
 *  - 头像上传：ModelEditDrawer 内调 uploadMedia
 *
 * 封面缩略图：admin endpoint 不直接出 url，并行拉 /public/models?page_size=100 用 code 关联 cover.src；
 * 找不到则显示灰块。这与 H5 的 fetchAdminSnapshot 思路一致。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Trash2, RefreshCw, Plus, Pencil } from "lucide-react";
import { useAuth } from "../store/AuthContext";
import {
  AdminApiError,
  archiveAdminModel,
  fetchAdminModels,
  type AdminModelDetail,
} from "@chiyan/api-client";
import { ModelEditDrawer } from "../components/ModelEditDrawer";

interface PublicCardLite {
  code: string;
  cover: { src: string };
}

async function fetchPublicCovers(): Promise<Map<string, string>> {
  // 公开端不需鉴权；CSP / Cache-Control 走 vite proxy。失败时返回空 Map（封面列降级为灰块）。
  try {
    const res = await fetch("/api/v1/public/models?page=1&page_size=100");
    if (!res.ok) return new Map();
    const env = (await res.json()) as { code: number; data?: { items: PublicCardLite[] } };
    if (env.code !== 0 || !env.data) return new Map();
    const map = new Map<string, string>();
    for (const c of env.data.items) map.set(c.code, c.cover.src);
    return map;
  } catch {
    return new Map();
  }
}

export function ModelsPage() {
  const { session } = useAuth();
  const [rows, setRows] = useState<AdminModelDetail[]>([]);
  const [covers, setCovers] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);
  const [drawerMode, setDrawerMode] = useState<"new" | "edit" | null>(null);
  const [editingRow, setEditingRow] = useState<AdminModelDetail | null>(null);

  const refresh = useCallback(async () => {
    if (!session) return;
    setError(null);
    setLoading(true);
    try {
      const [list, coverMap] = await Promise.all([
        fetchAdminModels(session.access_token, { status: "active", page: 1, page_size: 100 }),
        fetchPublicCovers(),
      ]);
      setRows(list.items);
      setCovers(coverMap);
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : "拉取失败");
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleDelete = async (id: number) => {
    if (!session) return;
    setError(null);
    try {
      await archiveAdminModel(id, session.access_token);
      setRows((prev) => prev.filter((r) => r.id !== id));
      setPendingDelete(null);
    } catch (e) {
      setError(e instanceof AdminApiError ? `${e.message}（${e.code}）` : "删除失败");
    }
  };

  const editingCoverUrl = useMemo(
    () => (editingRow ? covers.get(editingRow.code) : undefined),
    [editingRow, covers],
  );

  return (
    <div className="p-8">
      <div className="flex items-baseline justify-between mb-5">
        <div>
          <h2 className="text-xl font-semibold">模特管理</h2>
          <p className="text-sm text-[var(--muted)] mt-0.5">
            共 {rows.length} 位在册模特
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setEditingRow(null);
              setDrawerMode("new");
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[var(--primary)] text-[var(--primary-fg)] text-sm font-medium"
          >
            <Plus className="w-3.5 h-3.5" />
            新增模特
          </button>
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

      <div className="bg-[var(--card)] rounded-lg border border-[var(--border)] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[var(--bg)] text-left text-xs text-[var(--muted)] uppercase">
            <tr>
              <th className="px-4 py-3 font-medium w-16">封面</th>
              <th className="px-4 py-3 font-medium">编号</th>
              <th className="px-4 py-3 font-medium">化名</th>
              <th className="px-4 py-3 font-medium">区</th>
              <th className="px-4 py-3 font-medium">身高</th>
              <th className="px-4 py-3 font-medium">风格</th>
              <th className="px-4 py-3 font-medium">创建时间</th>
              <th className="px-4 py-3 font-medium text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-[var(--muted)]">
                  加载中…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-[var(--muted)]">
                  暂无模特。点右上"新增模特"添加。
                </td>
              </tr>
            ) : (
              rows.map((m) => {
                const cover = covers.get(m.code);
                return (
                  <tr key={m.id} className="border-t border-[var(--border)]">
                    <td className="px-4 py-2">
                      {cover ? (
                        <img
                          src={cover}
                          alt={m.nickname}
                          className="w-8 h-10 object-cover rounded bg-[var(--bg)]"
                        />
                      ) : (
                        <div className="w-8 h-10 rounded bg-[var(--bg)] border border-[var(--border)]" />
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{m.code}</td>
                    <td className="px-4 py-3">{m.nickname}</td>
                    <td className="px-4 py-3 text-[var(--muted)]">{m.district ?? "—"}</td>
                    <td className="px-4 py-3 text-[var(--muted)]">
                      {m.height_cm ? `${m.height_cm}cm` : "—"}
                    </td>
                    <td className="px-4 py-3 text-[var(--muted)]">
                      {m.style_tags.join("、") || "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--muted)]">
                      {new Date(m.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {pendingDelete === m.id ? (
                        <span className="inline-flex gap-2">
                          <button
                            onClick={() => handleDelete(m.id)}
                            className="text-xs px-2 py-1 rounded bg-[var(--danger)] text-white"
                          >
                            确认归档
                          </button>
                          <button
                            onClick={() => setPendingDelete(null)}
                            className="text-xs px-2 py-1 rounded border border-[var(--border)]"
                          >
                            取消
                          </button>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <button
                            onClick={() => {
                              setEditingRow(m);
                              setDrawerMode("edit");
                            }}
                            className="inline-flex items-center gap-1 text-xs text-[var(--muted)] hover:text-[var(--fg)] px-1.5 py-1"
                          >
                            <Pencil className="w-3 h-3" />
                            编辑
                          </button>
                          <button
                            onClick={() => setPendingDelete(m.id)}
                            className="inline-flex items-center gap-1 text-xs text-[var(--muted)] hover:text-[var(--danger)] px-1.5 py-1"
                          >
                            <Trash2 className="w-3 h-3" />
                            归档
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {session && drawerMode && (
        <ModelEditDrawer
          open={drawerMode !== null}
          mode={drawerMode}
          initial={editingRow}
          initialCoverUrl={editingCoverUrl}
          accessToken={session.access_token}
          onClose={() => {
            setDrawerMode(null);
            setEditingRow(null);
          }}
          onSaved={() => {
            setDrawerMode(null);
            setEditingRow(null);
            void refresh();
          }}
        />
      )}
    </div>
  );
}
