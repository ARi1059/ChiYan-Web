/**
 * 首装无缓存时显示的全屏 loading。
 *
 * 有缓存时不显示（直接渲染主 UI，loading 在背后跑）；这避免了"明明已经显示过数据"的瞬闪。
 * 用 useDelayedFlag 150ms 门控：SWR 命中（<150ms）不渲染骨架。
 */
import { useDelayedFlag } from "../../lib/use-delayed-flag";

interface Props {
  /** 调用方传 state.phase === "loading" 的判定。 */
  loading: boolean;
}

export function LoadingScreen({ loading }: Props) {
  const visible = useDelayedFlag(loading, 150);
  if (!visible) return null;
  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center gap-3">
      <div className="w-8 h-8 rounded-full border-2 border-border border-t-primary animate-spin" />
      <p className="text-sm text-muted-foreground">加载中…</p>
    </div>
  );
}
