import { useState, useMemo } from "react";
import { Search, X } from "lucide-react";
import { ModelCard } from "./ModelCard";
import { MODELS } from "../data/models";
import { cn } from "./ui/utils";
import type { Model } from "../data/models";

interface RosterSectionProps {
  onSelectModel: (model: Model) => void;
}

export function RosterSection({ onSelectModel }: RosterSectionProps) {
  const [query, setQuery] = useState("");
  const [activeLocation, setActiveLocation] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return MODELS.filter((m) => {
      const q = query.trim().toLowerCase();
      const matchQ =
        !q ||
        m.alias.toLowerCase().includes(q) ||
        m.styles.some((s) => s.includes(q)) ||
        m.location.includes(q);
      const matchLoc = !activeLocation || m.location === activeLocation;
      return matchQ && matchLoc;
    });
  }, [query, activeLocation]);

  const locations = Array.from(new Set(MODELS.map((m) => m.location)));

  return (
    <div className="min-h-full pb-4">
      <div className="px-5 pt-14 pb-4">
        <h1
          className="text-foreground"
          style={{ fontFamily: "'Noto Serif SC', serif", fontSize: "28px", fontWeight: 700, lineHeight: 1.2 }}
        >
          全部模特
        </h1>
        <p className="text-sm text-muted-foreground mt-1">共 {MODELS.length} 位</p>
      </div>

      <div className="px-5 mb-3">
        <div className="flex items-center gap-2 bg-card rounded-[12px] px-3 py-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索化名、风格、城市…"
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
          {query && (
            <button onClick={() => setQuery("")}>
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto px-5 pb-3 scrollbar-none">
        <button
          onClick={() => setActiveLocation(null)}
          className={cn(
            "flex-shrink-0 px-3 py-1 rounded-full text-xs border transition-colors duration-150",
            !activeLocation
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-card text-foreground border-border"
          )}
        >
          全部城市
        </button>
        {locations.map((loc) => (
          <button
            key={loc}
            onClick={() => setActiveLocation(activeLocation === loc ? null : loc)}
            className={cn(
              "flex-shrink-0 px-3 py-1 rounded-full text-xs border transition-colors duration-150",
              activeLocation === loc
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-foreground border-border"
            )}
          >
            {loc}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <span className="text-4xl mb-3">🔍</span>
          <p className="text-sm">未找到匹配的模特</p>
          <button
            onClick={() => { setQuery(""); setActiveLocation(null); }}
            className="mt-3 text-xs text-primary"
          >
            清除筛选
          </button>
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
