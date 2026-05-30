/**
 * 顶部网络异常 banner。
 *
 * 仅在 state.phase === "failed" && state.hasCache 时显示 ——
 * 用户能看到（旧的）数据，banner 提示"网络不稳，可能不是最新"，可点重试或手动关闭。
 *
 * 不阻塞主 UI，仅占顶部安全区下方一条；用户可关闭。
 */
import { useState } from "react";
import { X, RotateCw } from "lucide-react";

interface Props {
  onRetry: () => void;
}

export function NetworkBanner({ onRetry }: Props) {
  const [closed, setClosed] = useState(false);
  if (closed) return null;
  return (
    <div className="fixed top-0 left-0 right-0 z-40 pt-safe">
      <div className="mx-3 mt-2 rounded-[10px] bg-foreground/90 backdrop-blur-md text-background flex items-center gap-2 px-3 py-2 shadow-lg">
        <div className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
        <p className="text-xs flex-1">网络不稳，数据可能不是最新</p>
        <button
          onClick={onRetry}
          className="flex items-center gap-1 text-xs opacity-90 hover:opacity-100"
        >
          <RotateCw className="w-3 h-3" />
          重试
        </button>
        <button
          onClick={() => setClosed(true)}
          className="opacity-70 hover:opacity-100"
          aria-label="关闭"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
