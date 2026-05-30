/**
 * 桌面 admin 主框架：左侧 sidebar 导航 + 右侧 Outlet 渲染当前路由页面。
 *
 * 设计点：
 *  - sidebar 固定 240px；内容区 flex-1，scroll 独立
 *  - 退出按钮：reset auth state → Navigate /login（access_token 内存清空）
 *  - 导航项激活态用 NavLink active class
 */
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { LogOut, Users, ListChecks, CalendarDays, Settings, FileClock } from "lucide-react";
import { useAuth } from "../store/AuthContext";

const NAV = [
  { to: "/models", label: "模特管理", icon: Users },
  { to: "/roster", label: "今日名单", icon: ListChecks },
  { to: "/schedule", label: "档期日历", icon: CalendarDays },
  { to: "/audit-logs", label: "审计日志", icon: FileClock },
  { to: "/settings", label: "工作室设置", icon: Settings },
];

export function Layout() {
  const { reset } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    reset();
    navigate("/login", { replace: true });
  };

  return (
    <div className="flex h-screen">
      <aside className="w-60 flex-shrink-0 border-r border-[var(--border)] bg-[var(--card)] flex flex-col">
        <div className="px-5 py-4 border-b border-[var(--border)]">
          <h1 className="text-base font-semibold">ChiYan Admin</h1>
          <p className="text-xs text-[var(--muted)] mt-0.5">桌面管理控制台</p>
        </div>

        <nav className="flex-1 py-3">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                [
                  "flex items-center gap-3 px-5 py-2.5 text-sm transition-colors",
                  isActive
                    ? "bg-[var(--bg)] text-[var(--fg)] font-medium border-l-2 border-[var(--accent)]"
                    : "text-[var(--muted)] hover:bg-[var(--bg)] hover:text-[var(--fg)]",
                ].join(" ")
              }
            >
              <Icon className="w-4 h-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        <button
          onClick={handleLogout}
          className="flex items-center gap-2 px-5 py-3 text-sm text-[var(--muted)] hover:text-[var(--danger)] border-t border-[var(--border)] transition-colors"
        >
          <LogOut className="w-4 h-4" />
          退出登录
        </button>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
