import { useApp } from "../store/AppContext";
import { cn } from "../components/ui/utils";
import type { Model } from "../data/models";

const STATUS_OPTIONS: Model["status"][] = ["在班", "空闲", "休息"];

const statusStyle: Record<Model["status"], string> = {
  在班: "bg-emerald-50 text-emerald-700 border-emerald-200",
  空闲: "bg-amber-50 text-amber-700 border-amber-200",
  休息: "bg-gray-100 text-gray-400 border-gray-200",
};

export function RosterTab() {
  const { models, updateModel } = useApp();

  const counts = {
    在班: models.filter((m) => m.status === "在班").length,
    空闲: models.filter((m) => m.status === "空闲").length,
    休息: models.filter((m) => m.status === "休息").length,
  };

  return (
    <div className="p-5 space-y-4">
      <div className="grid grid-cols-3 gap-3 mb-2">
        {(["在班", "空闲", "休息"] as const).map((s) => (
          <div key={s} className={cn("rounded-[12px] p-3 border text-center", statusStyle[s])}>
            <p className="text-xl font-semibold">{counts[s]}</p>
            <p className="text-xs mt-0.5">{s}</p>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">点击状态标签切换</p>

      <div className="space-y-2">
        {models.map((model) => (
          <div
            key={model.id}
            className="bg-card rounded-[12px] p-3 flex items-center gap-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
          >
            <img
              src={model.photo}
              alt={model.alias}
              className="w-10 h-10 rounded-full object-cover flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-foreground">{model.alias}</p>
              <p className="text-xs text-muted-foreground">{model.district} · {model.height}cm</p>
            </div>
            <div className="flex gap-1.5">
              {STATUS_OPTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => updateModel(model.id, { status: s })}
                  className={cn(
                    "px-2.5 py-1 rounded-full text-[11px] border transition-all duration-150",
                    model.status === s
                      ? statusStyle[s]
                      : "bg-transparent text-muted-foreground border-border"
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
