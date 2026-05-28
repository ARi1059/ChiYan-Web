import { Home, CalendarDays, Users, MessageCircle } from "lucide-react";
import { cn } from "./ui/utils";

type Tab = "home" | "today" | "roster" | "contact";

interface TabBarProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

const TABS = [
  { id: "home" as Tab, label: "首页", Icon: Home },
  { id: "today" as Tab, label: "当日", Icon: CalendarDays },
  { id: "roster" as Tab, label: "全部", Icon: Users },
  { id: "contact" as Tab, label: "联系", Icon: MessageCircle },
];

export function TabBar({ activeTab, onTabChange }: TabBarProps) {
  return (
    <div className="flex bg-card/80 backdrop-blur-md border-t border-border pb-safe">
      {TABS.map(({ id, label, Icon }) => {
        const active = activeTab === id;
        return (
          <button
            key={id}
            onClick={() => onTabChange(id)}
            className="flex-1 flex flex-col items-center py-2 gap-0.5 transition-opacity duration-120"
          >
            <Icon
              className={cn(
                "w-6 h-6 transition-colors duration-120",
                active ? "text-primary" : "text-muted-foreground"
              )}
              strokeWidth={active ? 2.2 : 1.8}
            />
            <span
              className={cn(
                "text-[10px] transition-colors duration-120",
                active ? "text-primary" : "text-muted-foreground"
              )}
            >
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
