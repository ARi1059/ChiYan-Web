/**
 * /login 桌面版两步登录。
 *
 * 流程与 H5 LoginScreen 等价（接口方案 §4.2 两步状态机）：
 *   credentials → /auth/login → challenge_token → totp → /auth/login/totp → access_token
 * 不同点：桌面布局是水平大表单 + 居中卡片；H5 是手机全屏。
 *
 * 登录成功后用 useNavigate 跳回 location.state.from（ProtectedRoute 记的）或 /models。
 */
import { useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "../store/AuthContext";
import { AuthError } from "@chiyan/api-client";

type Stage = "credentials" | "totp";

interface LocationState {
  from?: string;
}

function describeError(e: unknown): string {
  if (e instanceof AuthError) {
    if (e.code === 40301) {
      const sub = e.extra?.sub_code as string | undefined;
      if (sub === "locked") {
        const until = e.extra?.locked_until as string | undefined;
        return until
          ? `账号已锁定，请于 ${new Date(until).toLocaleString()} 后再试`
          : "账号已锁定";
      }
      if (sub === "account_disabled") return "账号已停用";
      return e.message;
    }
    if (e.code === 40101) return e.message || "用户名或密码错误";
    return e.message || `登录失败（${e.code}）`;
  }
  return "网络错误，请稍后重试";
}

export function LoginPage() {
  const { login, verifyTotp, reset } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as LocationState | null)?.from ?? "/models";

  const [stage, setStage] = useState<Stage>("credentials");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitCredentials = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      await login(username.trim(), password);
      setStage("totp");
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  const submitTotp = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      await verifyTotp(code);
      navigate(from, { replace: true });
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-[var(--card)] rounded-xl border border-[var(--border)] p-7 shadow-sm">
        <div className="text-center mb-6">
          <h1 className="text-lg font-semibold">ChiYan Admin</h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            {stage === "credentials" ? "请输入账号与密码" : "请输入 6 位动态验证码"}
          </p>
        </div>

        {stage === "credentials" ? (
          <form onSubmit={submitCredentials} className="flex flex-col gap-3">
            <input
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="账号"
              className="h-10 rounded-lg border border-[var(--border)] px-3 text-sm outline-none focus:border-[var(--fg)]"
              autoFocus
            />
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="密码（至少 12 位）"
              className="h-10 rounded-lg border border-[var(--border)] px-3 text-sm outline-none focus:border-[var(--fg)]"
            />
            {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
            <button
              type="submit"
              disabled={busy || !username || password.length < 12}
              className="h-10 rounded-lg bg-[var(--primary)] text-[var(--primary-fg)] text-sm font-medium disabled:opacity-50 mt-1"
            >
              {busy ? "登录中…" : "下一步"}
            </button>
          </form>
        ) : (
          <form onSubmit={submitTotp} className="flex flex-col gap-3">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              className="h-12 rounded-lg border border-[var(--border)] px-3 text-center font-mono text-lg tracking-widest outline-none focus:border-[var(--fg)]"
              autoFocus
            />
            {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
            <button
              type="submit"
              disabled={busy || code.length !== 6}
              className="h-10 rounded-lg bg-[var(--primary)] text-[var(--primary-fg)] text-sm font-medium disabled:opacity-50"
            >
              {busy ? "验证中…" : "登录"}
            </button>
            <button
              type="button"
              onClick={() => {
                reset();
                setStage("credentials");
                setCode("");
                setError(null);
              }}
              className="text-xs text-[var(--muted)] flex items-center justify-center gap-1 mt-1"
            >
              <ArrowLeft className="w-3 h-3" />
              返回上一步
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
