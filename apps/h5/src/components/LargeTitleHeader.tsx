/**
 * iOS Large Title 顶栏：
 *  - 初始：标题在 section 顶部内联渲染（34px / serif / bold），上面无 nav 占位
 *  - 滚动到大字底部出顶后：sticky compact bar 淡入（44px 高 / backdrop-blur / 显示同名标题）
 *  - 滚回顶：compact 淡出，大字回归
 *
 * 实现：
 *  - sentinel 放大字下面一格；IntersectionObserver 以最近 `[data-scroll-root]` 为 root
 *  - compact bar 用 sticky top-0 永远在 flow 里；大字块 -mt-11 压在它下面（z-index 区分），
 *    这样 compact 透明态时大字看起来就在顶部，不透明态时大字滚过去 compact 罩住它
 *
 * 4 个 section 用法：
 *   Home:    <LargeTitleHeader eyebrow={greeting} title={agencyName} subline={slogan} variant="large" onTitleTap={...} />
 *   Today:   <LargeTitleHeader title="当日通告" subline={dateLine} variant="title-1" />
 *   Roster:  <LargeTitleHeader title="全部模特" subline={`共 ${n} 位`} variant="title-1" />
 *   Contact: <LargeTitleHeader title="联系我们" subline={...} variant="title-1" />
 *
 * 没用单独的 store/context —— title 由 section 自己决定，避免跨 section 同步状态。
 */
import { useEffect, useRef, useState } from "react";

interface Props {
  /** 小字位于标题上方（如 Home 的日期+问候）。 */
  eyebrow?: string;
  title: string;
  /** 小字位于标题下方（slogan / 计数 / 副标题）。 */
  subline?: string;
  variant?: "large" | "title-1";
  /** 大字标题的点击行为（Home 5 连击进 admin）；compact bar 不触发，避误触。 */
  onTitleTap?: () => void;
  /** 大字右侧 + compact bar 右侧的 accessory（如关闭按钮 / 通知点）。 */
  accessory?: React.ReactNode;
}

export function LargeTitleHeader({
  eyebrow,
  title,
  subline,
  variant = "large",
  onTitleTap,
  accessory,
}: Props) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const root = sentinel.closest("[data-scroll-root]") as HTMLElement | null;
    if (!root) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        // sentinel 在 root 视口内：大字还看得到 → scrolled=false
        // sentinel 被顶上去出顶：!isIntersecting && top < rootTop → scrolled=true
        const topGone =
          !entry.isIntersecting &&
          entry.boundingClientRect.top < (entry.rootBounds?.top ?? 0);
        setScrolled(topGone);
      },
      { root, threshold: 0 },
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, []);

  const titleFontSize = variant === "large" ? 34 : 28;

  return (
    <>
      {/* Compact sticky bar —— 永远在 flow 里占位（44px 高），透明态时不挡点击 */}
      <div
        className="sticky top-0 z-20 h-11 transition-opacity duration-150 ease-out"
        style={{
          opacity: scrolled ? 1 : 0,
          pointerEvents: scrolled ? "auto" : "none",
          backdropFilter: "saturate(180%) blur(14px)",
          WebkitBackdropFilter: "saturate(180%) blur(14px)",
          backgroundColor: "color-mix(in srgb, var(--background) 78%, transparent)",
          borderBottom: "0.5px solid color-mix(in srgb, var(--border) 70%, transparent)",
        }}
      >
        <div className="flex h-full items-center justify-between px-5">
          <span className="text-[15px] font-semibold text-foreground truncate">
            {title}
          </span>
          {accessory ? <span className="ml-2 shrink-0">{accessory}</span> : null}
        </div>
      </div>

      {/* Large title 块 —— -mt-11 把它压回 compact bar 槽里 */}
      <div
        className={[
          "-mt-11 px-5 relative z-10",
          variant === "large" ? "pt-6 pb-6" : "pt-6 pb-4",
        ].join(" ")}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {eyebrow ? (
              <p className="text-muted-foreground text-sm">{eyebrow}</p>
            ) : null}
            <h1
              className={[
                eyebrow ? "mt-1" : "",
                "text-foreground cursor-default select-none",
              ].join(" ")}
              style={{
                fontFamily: "'Noto Serif SC', serif",
                fontSize: `${titleFontSize}px`,
                fontWeight: 700,
                lineHeight: 1.2,
              }}
              onClick={onTitleTap}
            >
              {title}
            </h1>
            {subline ? (
              <p className="text-muted-foreground text-sm mt-1">{subline}</p>
            ) : null}
          </div>
          {accessory ? <div className="pt-1 shrink-0">{accessory}</div> : null}
        </div>
      </div>

      <div ref={sentinelRef} className="h-px -mt-px" aria-hidden />
    </>
  );
}
