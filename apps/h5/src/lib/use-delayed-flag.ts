import { useEffect, useState } from "react";

/**
 * 延迟门控：避免 loading 闪烁。
 *
 * 当 flag=true 持续超过 delayMs 才把 visible 置 true；flag 在 delayMs 内回 false → visible 始终 false。
 * SWR 命中（fetch < delayMs）时不会渲染 loading UI，体验上像"瞬时返回"。
 *
 * 用法：
 *   const showSkeleton = useDelayedFlag(state.phase === "loading", 150);
 */
export function useDelayedFlag(flag: boolean, delayMs: number): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!flag) {
      setVisible(false);
      return;
    }
    const t = setTimeout(() => setVisible(true), delayMs);
    return () => clearTimeout(t);
  }, [flag, delayMs]);
  return visible;
}
