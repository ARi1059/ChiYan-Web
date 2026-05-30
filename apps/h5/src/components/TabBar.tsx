import { NavLink } from "react-router-dom";
import { Home, CalendarDays, Users, MessageCircle } from "lucide-react";
import { cn } from "./ui/utils";

const TABS = [
  { to: "/", label: "首页", Icon: Home, end: true },
  { to: "/today", label: "当日", Icon: CalendarDays, end: false },
  { to: "/roster", label: "全部", Icon: Users, end: false },
  { to: "/contact", label: "联系", Icon: MessageCircle, end: false },
];

/**
 * 底部 4 Tab。用 NavLink 直接读 pathname 做激活态，避免 prop 驱动 ——
 * 这样 URL ?m=XXX query 变化时 active 状态自然保持。
 */
export function TabBar() {
  return (
    <div className="flex bg-card/80 backdrop-blur-md border-t border-border pb-safe">
      {TABS.map(({ to, label, Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className="flex-1 flex flex-col items-center py-2 gap-0.5 transition-opacity duration-120"
        >
          {({ isActive }) => (
            <>
              <Icon
                className={cn(
                  "w-6 h-6 transition-colors duration-120",
                  isActive ? "text-primary" : "text-muted-foreground",
                )}
                strokeWidth={isActive ? 2.2 : 1.8}
              />
              <span
                className={cn(
                  "text-[10px] transition-colors duration-120",
                  isActive ? "text-primary" : "text-muted-foreground",
                )}
              >
                {label}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </div>
  );
}
