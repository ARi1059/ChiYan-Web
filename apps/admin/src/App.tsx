/**
 * Admin 桌面 console 路由表。
 *
 * 路由：
 *   /login        → LoginPage（账密 → TOTP 两步）
 *   /models       → 模特列表（默认进站）
 *   /roster       → 今日名单
 *   /schedule     → 档期日历（模特 × 日期网格）
 *   /audit-logs   → 审计日志（owner / admin 可见，operator 看到也会被 API 403）
 *   /settings     → 工作室设置
 *
 * 鉴权守卫：除 /login 外其他路由要求 useAuth().isAuthed；否则 <Navigate to="/login" replace />。
 * H5 那边 access_token 内存存；桌面端同样策略 —— 刷新页面会回 /login（与移动端体验一致）。
 */
import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AccountsPage } from "./pages/AccountsPage";
import { AuditLogsPage } from "./pages/AuditLogsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { ModelsPage } from "./pages/ModelsPage";
import { RosterPage } from "./pages/RosterPage";
import { SchedulePage } from "./pages/SchedulePage";
import { SettingsPage } from "./pages/SettingsPage";
import { useAuth } from "./store/AuthContext";

/** owner/admin 默认进数据看板；operator（看板对其 403）回落到模特管理。role 未知时也回落 /models。 */
function HomeRedirect() {
  const { session } = useAuth();
  const role = session?.role;
  const to = role === "owner" || role === "admin" ? "/dashboard" : "/models";
  return <Navigate to={to} replace />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<HomeRedirect />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/models" element={<ModelsPage />} />
        <Route path="/roster" element={<RosterPage />} />
        <Route path="/schedule" element={<SchedulePage />} />
        <Route path="/audit-logs" element={<AuditLogsPage />} />
        <Route path="/accounts" element={<AccountsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
