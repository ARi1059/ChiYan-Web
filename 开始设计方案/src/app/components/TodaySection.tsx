import { useState } from "react";
import { ModelCard } from "./ModelCard";
import { useApp } from "../store/AppContext";
import { cn } from "./ui/utils";
import type { Model } from "../data/models";

type Segment = "全部" | "在班" | "空闲";

interface TodaySectionProps {
  onSelectModel: (model: Model) => void;
}

function formatToday(): string {
  const now = new Date();
  const days = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return `${now.getMonth() + 1}月${now.getDate()}日 ${days[now.getDay()]} 通告`;
}

export function TodaySection({ onSelectModel }: TodaySectionProps) {
  const { models } = useApp();
  const [segment, setSegment] = useState<Segment>("全部");
  const [activeStyle, setActiveStyle] = useState<string | null>(null);

  const todayModels = models.filter((m) => m.status !== "休息");
  const allStyles = Array.from(new Set(todayModels.flatMap((m) => m.styles)));

  const filtered = todayModels.filter((m) => {
    const segMatch = segment === "全部" || m.status === segment;
    const styleMatch = !activeStyle || m.styles.includes(activeStyle);
    return segMatch && styleMatch;
  });

  return (
    <div className="min-h-full pb-4">
      <div className="px-5 pt-14 pb-4">
        <h1
          className="text-foreground"
          style={{ fontFamily: "'Noto Serif SC', serif", fontSize: "28px", fontWeight: 700, lineHeight: 1.2 }}
        >
          当日通告
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{formatToday()}</p>
      </div>

      <div className="px-5 mb-4">
        <div className="flex bg-secondary rounded-[10px] p-1 gap-0.5">
          {(["全部", "在班", "空闲"] as Segment[]).map((s) => (
            <button
              key={s}
              onClick={() => setSegment(s)}
              className={cn(
                "flex-1 py-1.5 rounded-[8px] text-sm transition-all duration-200",
                segment === s
                  ? "bg-card text-foreground shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
                  : "text-muted-foreground"
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {allStyles.length > 0 && (
        <div className="flex gap-2 overflow-x-auto px-5 pb-3 scrollbar-none">
          <button
            onClick={() => setActiveStyle(null)}
            className={cn(
              "flex-shrink-0 px-3 py-1 rounded-full text-xs border transition-colors duration-150",
              !activeStyle
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-foreground border-border"
            )}
          >
            全部风格
          </button>
          {allStyles.map((s) => (
            <button
              key={s}
              onClick={() => setActiveStyle(activeStyle === s ? null : s)}
              className={cn(
                "flex-shrink-0 px-3 py-1 rounded-full text-xs border transition-colors duration-150",
                activeStyle === s
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-foreground border-border"
              )}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <span className="text-4xl mb-3">☁️</span>
          <p className="text-sm">暂无符合条件的模特</p>
        </div>
      ) : (
        <div className="px-5 grid grid-cols-2 gap-3">
          {filtered.map((model) => (
            <ModelCard
              key={model.id}
              model={model}
              onClick={() => onSelectModel(model)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
