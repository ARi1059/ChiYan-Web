/**
 * 鉴权守卫：访问受保护路由时检查 useAuth().isAuthed。
 * 未登录 → Navigate /login 并记忆 from（登录成功后跳回原路径）。
 */
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../store/AuthContext";
import type { ReactNode } from "react";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthed } = useAuth();
  const location = useLocation();
  if (!isAuthed) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  return <>{children}</>;
}
