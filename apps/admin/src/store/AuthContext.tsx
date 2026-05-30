/**
 * Admin 会话上下文。
 *
 * 持有当前 access_token + 当前管理员摘要。两个关键约束：
 *  1. access_token 只在内存（React state）。刷新页面、关闭 Tab 即丢失 → 重登。
 *     这是接口方案 §3.2 line 198 + 用户明确要求"JWT 内存存"。
 *  2. refresh cookie 是 HttpOnly，JS 不可见；H5 暂不主动调 /auth/refresh
 *     （AdminPanel 关闭就清 token；下次重进重走 login 流程）。
 *
 * 阶段 3 只暴露 login/verifyTotp/logout + token 读取；阶段 4 admin 写操作发起请求时
 * 用 useAuth().accessToken 拼 Authorization。
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { login as apiLogin, verifyTotp as apiVerifyTotp } from "@chiyan/api-client";

interface SessionInfo {
  access_token: string;
  must_change_password: boolean;
  totp_enrolled: boolean;
}

interface AuthContextValue {
  session: SessionInfo | null;
  isAuthed: boolean;
  challengeToken: string | null;
  login: (username: string, password: string) => Promise<void>;
  verifyTotp: (code: string) => Promise<SessionInfo>;
  reset: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [challengeToken, setChallengeToken] = useState<string | null>(null);

  const login = useCallback(async (username: string, password: string) => {
    const { challenge_token } = await apiLogin(username, password);
    setChallengeToken(challenge_token);
  }, []);

  const verifyTotp = useCallback(
    async (code: string): Promise<SessionInfo> => {
      if (!challengeToken) {
        throw new Error("missing challenge_token; call login first");
      }
      const res = await apiVerifyTotp(challengeToken, code);
      const next: SessionInfo = {
        access_token: res.access_token,
        must_change_password: res.must_change_password,
        totp_enrolled: res.totp_enrolled,
      };
      setSession(next);
      setChallengeToken(null);
      return next;
    },
    [challengeToken],
  );

  const reset = useCallback(() => {
    setSession(null);
    setChallengeToken(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      isAuthed: session !== null,
      challengeToken,
      login,
      verifyTotp,
      reset,
    }),
    [session, challengeToken, login, verifyTotp, reset],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
