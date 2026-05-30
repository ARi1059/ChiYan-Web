/**
 * 分享 helper：navigator.share 优先；不支持就让 ShareSheet 兜底。
 *
 * 三种结果：
 *   - "shared":     navigator.share 成功（iOS Safari / 新 Android Chrome）
 *   - "fallback":   navigator.share 不存在 / 用户取消 / 抛错 —— 调用方应弹 ShareSheet
 *   - "blocked":    检测到微信内嵌（MicroMessenger）—— navigator.share 在 MM 里行为不一致，
 *                   直接走 ShareSheet 的"复制链接 + 提示粘贴"路径
 *
 * 设计：
 *   - 不接 WeChat JSSDK / QQ JSAPI（项目无微信集成；QQ JSAPI 需要域名白名单，且大多 QQ 内嵌
 *     不暴露 mqq.ui.share，best-effort 没意义）
 *   - 调用必须在 user gesture 同步路径里发起 —— navigator.share 是 promise 但 user gesture
 *     在 await 跨越后会过期；这里只走"在调用点立即开 share，不 await 任何之前的 async"
 */
import { detectQQContext } from "./qq";

export interface ShareIntent {
  title: string;
  text: string;
  url: string;
}

export type ShareResult = "shared" | "fallback" | "blocked";

/**
 * 尝试调起原生分享。
 *
 * 用法（必须在 user gesture 同步路径）：
 *   const r = await attemptShare({ title, text, url });
 *   if (r !== "shared") setShareSheetOpen(true);
 */
export async function attemptShare(intent: ShareIntent): Promise<ShareResult> {
  const ctx = detectQQContext();
  if (ctx === "wechat") return "blocked";
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
    return "fallback";
  }
  try {
    await navigator.share({
      title: intent.title,
      text: intent.text,
      url: intent.url,
    });
    return "shared";
  } catch (e: unknown) {
    // 用户取消（AbortError）也算 fallback —— 不做 UI 提示
    return "fallback";
  }
}

/** 把链接写剪贴板；返回成功失败。clipboard.writeText 已经在 user gesture 期内 fire-and-forget。 */
export async function copyShareUrl(url: string): Promise<boolean> {
  try {
    if (typeof navigator === "undefined" || !navigator.clipboard) return false;
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * QQ 浏览器内打开外链：mqq://browse?url=...（部分 QQ 浏览器支持）。
 * 不抛错；成功失败 caller 看 UI 自己判断。
 *
 * **不能在 await 之后**调用 —— 必须 user gesture 同步触发。
 */
export function openInQQBrowser(url: string): void {
  const a = document.createElement("a");
  a.href = `mqqbrowser://qb/forward?url=${encodeURIComponent(url)}`;
  a.rel = "noopener noreferrer";
  a.click();
}
