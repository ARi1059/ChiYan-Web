import { ModelCard } from "./ModelCard";
import { useApp } from "../store/AppContext";
import type { Model } from "../data/models";

interface HomeSectionProps {
  onSelectModel: (model: Model) => void;
  onBrandTap?: () => void;
}

function getTodayGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "早安";
  if (h < 18) return "午安";
  return "晚安";
}

function formatDate(): string {
  const now = new Date();
  const days = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return `${now.getMonth() + 1}月${now.getDate()}日 ${days[now.getDay()]}`;
}

export function HomeSection({ onSelectModel, onBrandTap }: HomeSectionProps) {
  const { models, settings, studioOpen } = useApp();

  const todayActive = models.filter((m) => m.status === "在班");
  const available = models.filter((m) => m.status === "空闲");
  const featured = models.filter((m) => m.featured);

  return (
    <div className="min-h-full pb-4">
      <div className="px-5 pt-14 pb-6">
        <p className="text-muted-foreground text-sm">{formatDate()} · {getTodayGreeting()}</p>
        <h1
          className="mt-1 text-foreground cursor-default select-none"
          style={{ fontFamily: "'Noto Serif SC', serif", fontSize: "34px", fontWeight: 700, lineHeight: 1.2 }}
          onClick={onBrandTap}
        >
          {settings.agencyName}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">{settings.agencySlogan}</p>
      </div>

      {settings.noticeEnabled && settings.homeNotice && (
        <div className="mx-5 mb-4 bg-primary/10 rounded-[12px] px-4 py-3">
          <p className="text-xs text-primary leading-relaxed">{settings.homeNotice}</p>
        </div>
      )}

      <div className="px-5 mb-6">
        <div className="bg-card rounded-[20px] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex items-stretch">
          <div className="flex-1 flex flex-col items-center justify-center py-2">
            <span
              className="text-primary"
              style={{ fontFamily: "'Noto Serif SC', serif", fontSize: "32px", fontWeight: 700, lineHeight: 1 }}
            >
              {studioOpen ? todayActive.length : "—"}
            </span>
            <span className="text-xs text-muted-foreground mt-1">
              {studioOpen ? "今日在班" : "今日休息"}
            </span>
          </div>
          <div className="w-px bg-border self-stretch mx-1" />
          <div className="flex-1 flex flex-col items-center justify-center py-2">
            <span
              className="text-foreground"
              style={{ fontSize: "32px", fontWeight: 600, lineHeight: 1 }}
            >
              {available.length}
            </span>
            <span className="text-xs text-muted-foreground mt-1">空闲可约</span>
          </div>
          <div className="w-px bg-border self-stretch mx-1" />
          <div className="flex-1 flex flex-col items-center justify-center py-2">
            <span
              className="text-foreground"
              style={{ fontSize: "32px", fontWeight: 600, lineHeight: 1 }}
            >
              {models.length}
            </span>
            <span className="text-xs text-muted-foreground mt-1">全部模特</span>
          </div>
        </div>
      </div>

      {studioOpen && todayActive.length > 0 && (
        <div className="mb-6">
          <div className="px-5 flex items-baseline justify-between mb-3">
            <h2
              className="text-foreground"
              style={{ fontFamily: "'Noto Serif SC', serif", fontSize: "18px", fontWeight: 600 }}
            >
              今日推荐
            </h2>
            <span className="text-xs text-muted-foreground">{todayActive.length} 位在班</span>
          </div>
          <div className="flex gap-3 overflow-x-auto pl-5 pr-5 pb-1 scrollbar-none">
            {todayActive.map((model) => (
              <ModelCard
                key={model.id}
                model={model}
                onClick={() => onSelectModel(model)}
                compact
              />
            ))}
          </div>
        </div>
      )}

      {featured.length > 0 && (
        <div className="px-5">
          <div className="flex items-baseline justify-between mb-3">
            <h2
              className="text-foreground"
              style={{ fontFamily: "'Noto Serif SC', serif", fontSize: "18px", fontWeight: 600 }}
            >
              人气模特
            </h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {featured.map((model) => (
              <ModelCard
                key={model.id}
                model={model}
                onClick={() => onSelectModel(model)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
