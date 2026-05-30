/**
 * /accounts — 账号管理（接口方案 §4.7，Owner-only）。
 *
 * 后端 7 端口全就绪：list / create / patch / disable(DELETE) / unlock / reset-password / reset-2fa。
 * 本页只做 UI；服务端已强制 owner-only + 防"自我降级 / 禁用 / 重置密码"（40001 self_lock / self_reset），
 * UI 在自己这一行镜像 ban，并把服务端错误透传给 owner。
 *
 * 一次性密码：创建账号 / 重置密码后明文仅返回一次 —— 用 reveal 弹窗展示 + 一键复制，
 * 关掉就再也拿不到（要重新 reset）。绝不写日志、不进 audit payload（服务端已 sanitize 兜底）。
 *
 * 角色显隐：本页只在 useAuth().session.role === 'owner' 时由 Layout 暴露入口；
 * 非 owner 即便直接敲 /accounts 也会被 API 403（fail-safe）。
 */
import { useCallback, useEffect, useState } from "react";
import {
  RefreshCw,
  UserPlus,
  Pencil,
  KeyRound,
  Smartphone,
  Unlock,
  Ban,
  Copy,
  Check,
  X,
} from "lucide-react";
import { useAuth } from "../store/AuthContext";
import {
  AdminApiError,
  createAdminAccount,
  disableAdminAccount,
  listAdminAccounts,
  resetAdminAccount2fa,
  resetAdminAccountPassword,
  unlockAdminAccount,
  updateAdminAccount,
  type AdminAccountRole,
  type AdminAccountStatus,
  type AdminAccountSummary,
} from "@chiyan/api-client";

const PAGE_SIZE = 50;

const ROLE_OPTIONS: Array<{ value: AdminAccountRole; label: string }> = [
  { value: "owner", label: "拥有者" },
  { value: "admin", label: "管理员" },
  { value: "operator", label: "运营" },
];
const ROLE_LABEL: Record<AdminAccountRole, string> = {
  owner: "拥有者",
  admin: "管理员",
  operator: "运营",
};

function fmtTs(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function isLocked(account: AdminAccountSummary): boolean {
  return account.locked_until !== null && new Date(account.locked_until).getTime() > Date.now();
}

type ModalState =
  | { kind: "create" }
  | { kind: "edit"; account: AdminAccountSummary }
  | { kind: "otp"; title: string; password: string }
  | {
      kind: "confirm";
      title: string;
      message: string;
      confirmLabel: string;
      danger?: boolean;
      onConfirm: () => Promise<void>;
    }
  | null;

export function AccountsPage() {
  const { session } = useAuth();
  const selfId = session?.admin_id;
  const [items, setItems] = useState<AdminAccountSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [busy, setBusy] = useState(false);

  const fetchPage = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      const r = await listAdminAccounts({ page, page_size: PAGE_SIZE }, session.access_token);
      setItems(r.items);
      setTotal(r.total);
    } catch (e: unknown) {
      setError(e instanceof AdminApiError ? `${e.message}（${e.code}）` : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [session, page]);

  useEffect(() => {
    void fetchPage();
  }, [fetchPage]);

  const flash = (msg: string) => {
    setOkMsg(msg);
    setTimeout(() => setOkMsg(null), 2500);
  };

  const runAction = async (fn: () => Promise<void>) => {
    if (!session || busy) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e: unknown) {
      setError(e instanceof AdminApiError ? `${e.message}（${e.code}）` : "操作失败");
    } finally {
      setBusy(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="p-8">
      <div className="flex items-baseline justify-between mb-5">
        <div>
          <h2 className="text-xl font-semibold">账号管理</h2>
          <p className="text-sm text-[var(--muted)] mt-1">共 {total} 个账号 · 仅拥有者可见与操作</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void fetchPage()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[var(--border)] text-sm hover:bg-[var(--bg)] disabled:opacity-50"
          >
            <RefreshCw className={["w-3.5 h-3.5", loading ? "animate-spin" : ""].join(" ")} />
            刷新
          </button>
          <button
            onClick={() => setModal({ kind: "create" })}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[var(--primary)] text-[var(--primary-fg)] text-sm font-medium"
          >
            <UserPlus className="w-3.5 h-3.5" />
            新建账号
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-3 rounded-md bg-[var(--danger)]/10 px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </div>
      )}
      {okMsg && (
        <div className="mb-3 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{okMsg}</div>
      )}

      <div className="rounded-md border border-[var(--border)] bg-[var(--card)] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[var(--bg)] text-[var(--muted)] text-xs">
            <tr>
              <th className="text-left px-3 py-2.5">账号</th>
              <th className="text-left px-3 py-2.5">角色</th>
              <th className="text-left px-3 py-2.5">状态</th>
              <th className="text-left px-3 py-2.5">2FA</th>
              <th className="text-left px-3 py-2.5">最近登录</th>
              <th className="text-right px-3 py-2.5">操作</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-10 text-[var(--muted)]">
                  {loading ? "加载中…" : "暂无账号"}
                </td>
              </tr>
            ) : (
              items.map((a) => {
                const self = selfId !== undefined && a.id === selfId;
                const locked = isLocked(a);
                return (
                  <tr key={a.id} className="border-t border-[var(--border)]">
                    <td className="px-3 py-2.5">
                      <div className="font-medium">
                        {a.display_name}
                        {self && (
                          <span className="ml-1.5 text-xs text-[var(--muted)]">（当前登录）</span>
                        )}
                      </div>
                      <div className="font-mono text-xs text-[var(--muted)]">
                        {a.username}
                        <span> · #{a.id}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">{ROLE_LABEL[a.role]}</td>
                    <td className="px-3 py-2.5">
                      {a.status === "disabled" ? (
                        <span className="text-[var(--danger)]">已停用</span>
                      ) : locked ? (
                        <span className="text-amber-600">已锁定</span>
                      ) : (
                        <span className="text-green-600">正常</span>
                      )}
                      {a.must_change_password && (
                        <span className="ml-1.5 text-xs text-[var(--muted)]">待改密</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {a.totp_enrolled ? (
                        <span className="text-green-600">已绑定</span>
                      ) : (
                        <span className="text-[var(--muted)]">未绑定</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-[var(--muted)]">
                      {fmtTs(a.last_login_at)}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <IconBtn
                          title="编辑"
                          onClick={() => setModal({ kind: "edit", account: a })}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </IconBtn>
                        {locked && (
                          <IconBtn
                            title="解锁"
                            onClick={() =>
                              setModal({
                                kind: "confirm",
                                title: "解锁账号",
                                message: `确认解锁 ${a.display_name}（${a.username}）？将清除失败计数与锁定。`,
                                confirmLabel: "解锁",
                                onConfirm: async () => {
                                  await unlockAdminAccount(a.id, session!.access_token);
                                  flash("已解锁");
                                  await fetchPage();
                                },
                              })
                            }
                          >
                            <Unlock className="w-3.5 h-3.5" />
                          </IconBtn>
                        )}
                        <IconBtn
                          title={self ? "不能重置自己的密码" : "重置密码"}
                          disabled={self}
                          onClick={() =>
                            setModal({
                              kind: "confirm",
                              title: "重置密码",
                              message: `为 ${a.display_name}（${a.username}）生成新的一次性密码？旧密码立即失效，对方下次登录须改密。`,
                              confirmLabel: "生成新密码",
                              onConfirm: async () => {
                                const r = await resetAdminAccountPassword(
                                  a.id,
                                  session!.access_token,
                                );
                                await fetchPage();
                                setModal({
                                  kind: "otp",
                                  title: "新的一次性密码",
                                  password: r.one_time_password,
                                });
                              },
                            })
                          }
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                        </IconBtn>
                        <IconBtn
                          title="重置 2FA"
                          disabled={!a.totp_enrolled}
                          onClick={() =>
                            setModal({
                              kind: "confirm",
                              title: "重置 2FA",
                              message: `清除 ${a.display_name}（${a.username}）的 TOTP 绑定？对方下次登录将重新绑定验证器。`,
                              confirmLabel: "重置 2FA",
                              onConfirm: async () => {
                                await resetAdminAccount2fa(a.id, session!.access_token);
                                flash("已重置 2FA");
                                await fetchPage();
                              },
                            })
                          }
                        >
                          <Smartphone className="w-3.5 h-3.5" />
                        </IconBtn>
                        {a.status !== "disabled" && (
                          <IconBtn
                            title={self ? "不能禁用自己" : "禁用"}
                            disabled={self}
                            danger
                            onClick={() =>
                              setModal({
                                kind: "confirm",
                                title: "禁用账号",
                                message: `禁用 ${a.display_name}（${a.username}）？该账号将无法登录，可在编辑里恢复为"正常"。`,
                                confirmLabel: "禁用",
                                danger: true,
                                onConfirm: async () => {
                                  await disableAdminAccount(a.id, session!.access_token);
                                  flash("已禁用");
                                  await fetchPage();
                                },
                              })
                            }
                          >
                            <Ban className="w-3.5 h-3.5" />
                          </IconBtn>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

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

      {modal?.kind === "create" && (
        <CreateModal
          busy={busy}
          onClose={() => setModal(null)}
          onSubmit={(input) =>
            runAction(async () => {
              const r = await createAdminAccount(input, session!.access_token);
              await fetchPage();
              setModal({
                kind: "otp",
                title: "账号已创建 · 一次性密码",
                password: r.one_time_password,
              });
            })
          }
        />
      )}

      {modal?.kind === "edit" && (
        <EditModal
          account={modal.account}
          isSelf={selfId !== undefined && modal.account.id === selfId}
          busy={busy}
          onClose={() => setModal(null)}
          onSubmit={(patch) =>
            runAction(async () => {
              await updateAdminAccount(modal.account.id, patch, session!.access_token);
              flash("已保存");
              setModal(null);
              await fetchPage();
            })
          }
        />
      )}

      {modal?.kind === "otp" && (
        <OneTimePasswordModal
          title={modal.title}
          password={modal.password}
          onClose={() => setModal(null)}
        />
      )}

      {modal?.kind === "confirm" && (
        <ConfirmModal
          title={modal.title}
          message={modal.message}
          confirmLabel={modal.confirmLabel}
          danger={modal.danger}
          busy={busy}
          onCancel={() => setModal(null)}
          onConfirm={() => runAction(modal.onConfirm)}
        />
      )}
    </div>
  );
}

// ─── 小组件 ─────────────────────────────────────────────────────────

function IconBtn({
  title,
  onClick,
  disabled,
  danger,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={[
        "p-1.5 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed",
        danger
          ? "text-[var(--muted)] hover:bg-[var(--danger)]/10 hover:text-[var(--danger)]"
          : "text-[var(--muted)] hover:bg-[var(--bg)] hover:text-[var(--fg)]",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-[var(--card)] rounded-xl border border-[var(--border)] shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border)]">
          <h3 className="text-sm font-semibold">{title}</h3>
          <button onClick={onClose} className="text-[var(--muted)] hover:text-[var(--fg)]">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block mb-3">
      <span className="block text-xs text-[var(--muted)] mb-1">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  "w-full h-9 px-3 rounded-md border border-[var(--border)] bg-[var(--bg)] text-sm outline-none focus:border-[var(--fg)]";

function CreateModal({
  busy,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: { username: string; display_name: string; role: AdminAccountRole }) => void;
}) {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<AdminAccountRole>("operator");
  const valid = username.trim().length >= 3 && displayName.trim().length >= 1;

  return (
    <Modal title="新建账号" onClose={onClose}>
      <Field label="登录用户名（≥ 3 字符，创建后不可改）">
        <input
          className={inputCls}
          value={username}
          autoFocus
          onChange={(e) => setUsername(e.target.value)}
          placeholder="如 operator_li"
        />
      </Field>
      <Field label="显示名">
        <input
          className={inputCls}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="如 小李"
        />
      </Field>
      <Field label="角色">
        <select
          className={inputCls}
          value={role}
          onChange={(e) => setRole(e.target.value as AdminAccountRole)}
        >
          {ROLE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>
      <p className="text-xs text-[var(--muted)] mb-4">
        创建后生成一次性密码（仅显示一次）；对方首次登录须改密并绑定 2FA。
      </p>
      <div className="flex justify-end gap-2">
        <button
          onClick={onClose}
          className="px-3 py-1.5 rounded-md border border-[var(--border)] text-sm hover:bg-[var(--bg)]"
        >
          取消
        </button>
        <button
          disabled={!valid || busy}
          onClick={() =>
            onSubmit({ username: username.trim(), display_name: displayName.trim(), role })
          }
          className="px-3 py-1.5 rounded-md bg-[var(--primary)] text-[var(--primary-fg)] text-sm font-medium disabled:opacity-50"
        >
          {busy ? "创建中…" : "创建"}
        </button>
      </div>
    </Modal>
  );
}

function EditModal({
  account,
  isSelf,
  busy,
  onClose,
  onSubmit,
}: {
  account: AdminAccountSummary;
  isSelf: boolean;
  busy: boolean;
  onClose: () => void;
  onSubmit: (patch: {
    display_name?: string;
    role?: AdminAccountRole;
    status?: AdminAccountStatus;
  }) => void;
}) {
  const [displayName, setDisplayName] = useState(account.display_name);
  const [role, setRole] = useState<AdminAccountRole>(account.role);
  const [status, setStatus] = useState<AdminAccountStatus>(account.status);

  const submit = () => {
    const patch: { display_name?: string; role?: AdminAccountRole; status?: AdminAccountStatus } =
      {};
    if (displayName.trim() && displayName.trim() !== account.display_name)
      patch.display_name = displayName.trim();
    if (!isSelf && role !== account.role) patch.role = role;
    if (!isSelf && status !== account.status) patch.status = status;
    onSubmit(patch);
  };

  return (
    <Modal title={`编辑 · ${account.username}`} onClose={onClose}>
      <Field label="显示名">
        <input
          className={inputCls}
          value={displayName}
          autoFocus
          onChange={(e) => setDisplayName(e.target.value)}
        />
      </Field>
      <Field label="角色">
        <select
          className={inputCls}
          value={role}
          disabled={isSelf}
          onChange={(e) => setRole(e.target.value as AdminAccountRole)}
        >
          {ROLE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="状态">
        <select
          className={inputCls}
          value={status}
          disabled={isSelf}
          onChange={(e) => setStatus(e.target.value as AdminAccountStatus)}
        >
          <option value="active">正常</option>
          <option value="disabled">已停用</option>
        </select>
      </Field>
      {isSelf && (
        <p className="text-xs text-[var(--muted)] mb-4">
          不能修改自己的角色或状态（防止误锁定唯一拥有者）。
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button
          onClick={onClose}
          className="px-3 py-1.5 rounded-md border border-[var(--border)] text-sm hover:bg-[var(--bg)]"
        >
          取消
        </button>
        <button
          disabled={busy}
          onClick={submit}
          className="px-3 py-1.5 rounded-md bg-[var(--primary)] text-[var(--primary-fg)] text-sm font-medium disabled:opacity-50"
        >
          {busy ? "保存中…" : "保存"}
        </button>
      </div>
    </Modal>
  );
}

function OneTimePasswordModal({
  title,
  password,
  onClose,
}: {
  title: string;
  password: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* 剪贴板不可用时用户可手动选中 */
    }
  };
  return (
    <Modal title={title} onClose={onClose}>
      <p className="text-sm text-[var(--muted)] mb-3">
        请立即复制并通过安全渠道交给对方。
        <strong className="text-[var(--fg)]">关闭后无法再次查看</strong>
        ，遗失只能重新重置。
      </p>
      <div className="flex items-center gap-2 mb-4">
        <code className="flex-1 px-3 py-2.5 rounded-md border border-[var(--border)] bg-[var(--bg)] font-mono text-sm break-all select-all">
          {password}
        </code>
        <button
          onClick={copy}
          className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-md border border-[var(--border)] text-sm hover:bg-[var(--bg)] shrink-0"
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-green-600" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
          {copied ? "已复制" : "复制"}
        </button>
      </div>
      <div className="flex justify-end">
        <button
          onClick={onClose}
          className="px-3 py-1.5 rounded-md bg-[var(--primary)] text-[var(--primary-fg)] text-sm font-medium"
        >
          我已记下，关闭
        </button>
      </div>
    </Modal>
  );
}

function ConfirmModal({
  title,
  message,
  confirmLabel,
  danger,
  busy,
  onCancel,
  onConfirm,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p className="text-sm text-[var(--muted)] mb-5">{message}</p>
      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 rounded-md border border-[var(--border)] text-sm hover:bg-[var(--bg)]"
        >
          取消
        </button>
        <button
          disabled={busy}
          onClick={onConfirm}
          className={[
            "px-3 py-1.5 rounded-md text-sm font-medium text-[var(--primary-fg)] disabled:opacity-50",
            danger ? "bg-[var(--danger)]" : "bg-[var(--primary)]",
          ].join(" ")}
        >
          {busy ? "处理中…" : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
