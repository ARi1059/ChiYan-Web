/**
 * Admin 真鉴权登录页。
 *
 * 两阶段：
 *   stage='credentials' → 用户名 + 密码 → POST /auth/login → challenge_token → 进入下一阶段
 *   stage='totp'        → 6 位 code → POST /auth/login/totp → access_token → onSuccess()
 *
 * 错误码（接口方案 §4.2）：
 *   40101 → 账密 / TOTP 错误
 *   40301 sub_code=locked → 账号锁定（展示 locked_until）
 *   40301 sub_code=account_disabled → 账号停用
 */
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "../store/AuthContext";
import { AuthError } from "@chiyan/api-client";

interface LoginScreenProps {
  onSuccess: () => void;
}

type Stage = "credentials" | "totp";

function describeError(e: unknown): string {
  if (e instanceof AuthError) {
    if (e.code === 40301) {
      const sub = e.extra?.sub_code as string | undefined;
      if (sub === "locked") {
        const until = e.extra?.locked_until as string | undefined;
        return until ? `账号已锁定，请于 ${new Date(until).toLocaleString()} 后再试` : "账号已锁定";
      }
      if (sub === "account_disabled") return "账号已停用";
      return e.message;
    }
    if (e.code === 40101) return e.message || "用户名或密码错误";
    return e.message || `登录失败（${e.code}）`;
  }
  return "网络错误，请稍后重试";
}

export function LoginScreen({ onSuccess }: LoginScreenProps) {
  const { login, verifyTotp, reset } = useAuth();
  const [stage, setStage] = useState<Stage>("credentials");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitCredentials = async (e: React.FormEvent) => {
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

  const submitTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      await verifyTotp(code);
      onSuccess();
    } catch (err) {
      setError(describeError(err));
      // TOTP 失败保持 stage，让用户重输；若 challenge 已过期回头 credentials 也是合理的，
      // 但 challenge 5min TTL 用户感知不到，这里不主动回退。
    } finally {
      setBusy(false);
    }
  };

  if (stage === "totp") {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 px-8">
        <div className="text-center">
          <p
            className="text-foreground"
            style={{ fontFamily: "'Noto Serif SC', serif", fontSize: "22px", fontWeight: 600 }}
          >
            两步验证
          </p>
          <p className="text-sm text-muted-foreground mt-1">请输入 6 位动态验证码</p>
        </div>

        <form onSubmit={submitTotp} className="w-full max-w-[280px] flex flex-col gap-3">
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000"
            className="h-12 rounded-[14px] bg-card shadow-[0_1px_3px_rgba(0,0,0,0.06)] px-4 text-center text-foreground text-xl tracking-widest font-mono"
            autoFocus
          />
          {error && <p className="text-sm text-destructive text-center">{error}</p>}
          <button
            type="submit"
            disabled={busy || code.length !== 6}
            className="h-12 rounded-[14px] bg-primary text-primary-foreground text-sm disabled:opacity-50 active:scale-[0.99] transition-transform"
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
            className="text-xs text-muted-foreground flex items-center justify-center gap-1"
          >
            <ArrowLeft className="w-3 h-3" />
            返回上一步
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 px-8">
      <div className="text-center">
        <p
          className="text-foreground"
          style={{ fontFamily: "'Noto Serif SC', serif", fontSize: "22px", fontWeight: 600 }}
        >
          管理员登录
        </p>
        <p className="text-sm text-muted-foreground mt-1">请输入账号与密码</p>
      </div>

      <form onSubmit={submitCredentials} className="w-full max-w-[280px] flex flex-col gap-3">
        <input
          type="text"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="账号"
          className="h-11 rounded-[14px] bg-card shadow-[0_1px_3px_rgba(0,0,0,0.06)] px-4 text-foreground text-sm"
          autoFocus
        />
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="密码"
          className="h-11 rounded-[14px] bg-card shadow-[0_1px_3px_rgba(0,0,0,0.06)] px-4 text-foreground text-sm"
        />
        {error && <p className="text-sm text-destructive text-center">{error}</p>}
        <button
          type="submit"
          disabled={busy || !username || password.length < 12}
          className="h-12 rounded-[14px] bg-primary text-primary-foreground text-sm disabled:opacity-50 active:scale-[0.99] transition-transform"
        >
          {busy ? "登录中…" : "下一步"}
        </button>
        <p className="text-[11px] text-muted-foreground text-center mt-1">密码长度至少 12 位</p>
      </form>
    </div>
  );
}
