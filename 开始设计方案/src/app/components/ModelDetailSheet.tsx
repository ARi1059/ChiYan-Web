import { useState } from "react";
import { Drawer } from "vaul";
import { X, Copy, MessageCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "./ui/utils";
import type { Model } from "../data/models";

interface ModelDetailSheetProps {
  model: Model | null;
  onClose: () => void;
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground">{value}</span>
    </div>
  );
}

export function ModelDetailSheet({ model, onClose }: ModelDetailSheetProps) {
  const [photoIndex, setPhotoIndex] = useState(0);
  const [copied, setCopied] = useState(false);

  const handleCopyQQ = () => {
    if (!model) return;
    navigator.clipboard.writeText(model.qqNumber).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenQQ = () => {
    if (!model) return;
    window.location.href = `mqqwpa://im/chat?chat_type=wpa&uin=${model.qqNumber}&version=1&src_type=web`;
  };

  if (!model) return null;

  return (
    <Drawer.Root open={!!model} onOpenChange={(open) => !open && onClose()}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-40" />
        <Drawer.Content
          className={cn(
            "fixed bottom-0 left-0 right-0 z-50",
            "bg-card rounded-t-[20px] overflow-hidden",
            "shadow-[0_-8px_24px_rgba(0,0,0,0.08)]",
            "max-h-[90vh] flex flex-col"
          )}
        >
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-9 h-1 rounded-full bg-border" />
          </div>

          <div className="flex items-center justify-between px-4 py-2">
            <h2 className="font-semibold text-foreground" style={{ fontFamily: "'Noto Serif SC', serif" }}>
              {model.alias}
            </h2>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>

          <div className="overflow-y-auto flex-1">
            <div className="relative aspect-[3/4] bg-muted mx-4 rounded-[14px] overflow-hidden">
              <img
                src={model.photos[photoIndex] || model.photo}
                alt={model.alias}
                className="w-full h-full object-cover"
              />
              {model.photos.length > 1 && (
                <>
                  <button
                    onClick={() => setPhotoIndex((i) => Math.max(0, i - 1))}
                    disabled={photoIndex === 0}
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center disabled:opacity-30"
                  >
                    <ChevronLeft className="w-4 h-4 text-white" />
                  </button>
                  <button
                    onClick={() => setPhotoIndex((i) => Math.min(model.photos.length - 1, i + 1))}
                    disabled={photoIndex === model.photos.length - 1}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center disabled:opacity-30"
                  >
                    <ChevronRight className="w-4 h-4 text-white" />
                  </button>
                  <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1">
                    {model.photos.map((_, i) => (
                      <div
                        key={i}
                        className={cn(
                          "h-1 rounded-full transition-all duration-200",
                          i === photoIndex ? "w-4 bg-white" : "w-1 bg-white/50"
                        )}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="mx-4 mt-4">
              <div className="flex items-center gap-2 mb-3">
                <span
                  className={cn(
                    "text-xs px-2.5 py-1 rounded-full",
                    model.status === "在班"
                      ? "bg-emerald-50 text-emerald-700"
                      : model.status === "空闲"
                      ? "bg-amber-50 text-amber-700"
                      : "bg-gray-100 text-gray-400"
                  )}
                >
                  {model.status}
                </span>
                <span className="text-xs text-muted-foreground">{model.location}</span>
                <div className="flex gap-1 ml-auto">
                  {model.styles.map((s) => (
                    <span key={s} className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">
                      {s}
                    </span>
                  ))}
                </div>
              </div>

              <div className="bg-secondary rounded-[12px] p-4 grid grid-cols-4 gap-3 mb-4">
                <StatItem label="身高" value={`${model.height}cm`} />
                <StatItem label="体重" value={`${model.weight}kg`} />
                <StatItem label="三围" value={`${model.bust}/${model.waist}/${model.hip}`} />
                <StatItem label="鞋码" value={`${model.shoeSize}`} />
              </div>

              <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                {model.description}
              </p>
            </div>
          </div>

          <div className="px-4 pt-3 pb-8 border-t border-border bg-card flex gap-3">
            <button
              onClick={handleCopyQQ}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-3 rounded-[12px]",
                "border border-border text-sm transition-colors duration-200",
                copied ? "bg-secondary text-primary" : "bg-card text-foreground"
              )}
            >
              <Copy className="w-4 h-4" />
              {copied ? "已复制 QQ" : `复制 QQ`}
            </button>
            <button
              onClick={handleOpenQQ}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-[12px] bg-primary text-primary-foreground text-sm"
            >
              <MessageCircle className="w-4 h-4" />
              QQ 接单
            </button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
