/**
 * 首装无缓存 + 拉取失败时的全屏错误屏。
 *
 * 仅在 state.phase === "failed" && !state.hasCache 时显示。
 * 有缓存的失败走 NetworkBanner（顶部 banner，不打断主 UI）。
 */
import { AlertCircle, RotateCw } from "lucide-react";

interface Props {
  error: string;
  onRetry: () => void;
}

export function ErrorScreen({ error, onRetry }: Props) {
  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center px-8 text-center">
      <AlertCircle className="w-12 h-12 text-destructive mb-4" />
      <h2 className="text-base font-semibold text-foreground mb-2">加载失败</h2>
      <p className="text-xs text-muted-foreground mb-6 break-all">{error || "网络请求失败"}</p>
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-[10px] bg-primary text-primary-foreground text-sm"
      >
        <RotateCw className="w-4 h-4" />
        重试
      </button>
    </div>
  );
}
