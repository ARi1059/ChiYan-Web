import { cn } from "./ui/utils";
import { useApp } from "../store/AppContext";
import type { Model } from "../data/models";

interface ModelCardProps {
  model: Model;
  onClick: () => void;
  compact?: boolean;
}

const statusStyles: Record<Model["status"], string> = {
  在班: "bg-emerald-50 text-emerald-700",
  空闲: "bg-amber-50 text-amber-700",
  休息: "bg-gray-100 text-gray-400",
};

export function ModelCard({ model, onClick, compact = false }: ModelCardProps) {
  const { display } = useApp();

  return (
    <button
      onClick={onClick}
      className={cn(
        "relative bg-card rounded-[14px] overflow-hidden text-left block",
        "shadow-[0_1px_3px_rgba(0,0,0,0.04)]",
        "active:scale-[0.97] transition-transform duration-[120ms]",
        compact ? "w-[140px] flex-shrink-0" : "w-full"
      )}
    >
      <div className={cn("relative bg-muted", compact ? "aspect-[2/3]" : "aspect-[3/4]")}>
        <img
          src={model.photo}
          alt={model.alias}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent" />
        <div className="absolute top-2 right-2">
          <span className={cn("text-[10px] px-2 py-0.5 rounded-full", statusStyles[model.status])}>
            {model.status}
          </span>
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-3">
          <p className="text-white font-semibold text-sm leading-tight">{model.alias}</p>
          <p className="text-white/70 text-[11px] mt-0.5">
            {model.height}cm
            {display.showDistrict && ` · ${model.district}`}
          </p>
        </div>
      </div>
      {!compact && display.showStyles && (
        <div className="px-3 py-2">
          <div className="flex flex-wrap gap-1">
            {model.styles.map((s) => (
              <span
                key={s}
                className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground"
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      )}
    </button>
  );
}
