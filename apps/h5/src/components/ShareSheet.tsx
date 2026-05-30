/**
 * 分享兜底底部 Sheet。
 *
 * 触发场景（来自 lib/share.ts attemptShare 返回非 "shared"）：
 *  - navigator.share 不存在（多数 Android、所有 PC、所有内嵌 webview）
 *  - 用户取消了原生分享
 *  - 微信内嵌（直接走 fallback，因为 MM 里 navigator.share 行为不一致）
 *
 * UI 模块（按上下文裁剪）：
 *  - 链接预览（标题 + URL）
 *  - 主操作：复制链接
 *  - 次操作：
 *      QQ 内嵌：尝试 mqqbrowser:// 跳 QQ 浏览器
 *      微信内嵌：显示"右上角 ··· → 发送给朋友/朋友圈"提示
 *      PC：无 —— 复制链接即可
 *
 * 不引入 QR 码（库重 + 离线 + 业务并不需要）。
 */
import { Drawer } from "vaul";
import { useState } from "react";
import { Copy, CheckCircle, X, Share2, ExternalLink } from "lucide-react";
import { cn } from "./ui/utils";
import { copyShareUrl, openInQQBrowser, type ShareIntent } from "../lib/share";
import { detectQQContext } from "../lib/qq";

interface Props {
  open: boolean;
  intent: ShareIntent | null;
  onClose: () => void;
  onCopied?: () => void;
}

export function ShareSheet({ open, intent, onClose, onCopied }: Props) {
  const [copied, setCopied] = useState(false);
  const ctx = detectQQContext();

  const handleCopy = async () => {
    if (!intent) return;
    const ok = await copyShareUrl(intent.url);
    if (ok) {
      setCopied(true);
      onCopied?.();
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleOpenInQQ = () => {
    if (!intent) return;
    openInQQBrowser(intent.url);
  };

  if (!intent) return null;

  return (
    <Drawer.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/40 z-40" />
        <Drawer.Content
          className={cn(
            "fixed bottom-0 left-0 right-0 z-50 bg-background",
            "rounded-t-[20px] shadow-[0_-8px_24px_rgba(0,0,0,0.08)]",
            "flex flex-col pb-[env(safe-area-inset-bottom,12px)]",
          )}
        >
          <Drawer.Title className="sr-only">分享链接</Drawer.Title>

          <div className="flex justify-center pt-3 pb-1">
            <div className="w-9 h-1 rounded-full bg-border" />
          </div>

          <div className="flex items-center justify-between px-4 py-2">
            <div className="flex items-center gap-2">
              <Share2 className="w-4 h-4 text-muted-foreground" />
              <h2
                className="text-foreground"
                style={{
                  fontFamily: "'Noto Serif SC', serif",
                  fontSize: "16px",
                  fontWeight: 600,
                }}
              >
                分享
              </h2>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center"
              aria-label="关闭"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>

          {/* 链接预览卡片 */}
          <div className="mx-4 mt-1 mb-3 bg-card rounded-[14px] p-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <p className="text-sm text-foreground line-clamp-2">{intent.title}</p>
            <p className="text-[11px] text-muted-foreground mt-1 break-all line-clamp-1">
              {intent.url}
            </p>
          </div>

          {/* 微信内嵌：用 ··· 菜单发送 */}
          {ctx === "wechat" && (
            <div className="mx-4 mb-3 rounded-[12px] border border-border/60 bg-secondary/40 px-3 py-2.5">
              <p className="text-xs text-muted-foreground leading-relaxed">
                微信内复制链接后，点右上角 <span className="font-semibold">···</span>
                {" "}菜单 → <span className="font-semibold">发送给朋友</span> /{" "}
                <span className="font-semibold">朋友圈</span>，把链接粘贴进对话框即可。
              </p>
            </div>
          )}

          {/* 主操作：复制链接 */}
          <div className="px-4 space-y-2">
            <button
              type="button"
              onClick={handleCopy}
              className={cn(
                "w-full h-12 rounded-[14px] flex items-center justify-center gap-2",
                "bg-primary text-primary-foreground text-sm font-medium",
                "active:opacity-80 transition-opacity",
              )}
            >
              {copied ? (
                <>
                  <CheckCircle className="w-4 h-4" />
                  已复制链接
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  复制链接
                </>
              )}
            </button>

            {/* QQ 内嵌：尝试切到 QQ 浏览器 */}
            {ctx === "qq" && (
              <button
                type="button"
                onClick={handleOpenInQQ}
                className={cn(
                  "w-full h-12 rounded-[14px] flex items-center justify-center gap-2",
                  "bg-secondary text-foreground text-sm",
                  "active:opacity-80 transition-opacity",
                )}
              >
                <ExternalLink className="w-4 h-4 text-muted-foreground" />
                在 QQ 浏览器中打开
              </button>
            )}
          </div>

          <div className="h-3" />
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
