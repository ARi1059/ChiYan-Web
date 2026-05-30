/**
 * 微信内置浏览器引导卡（自绘底部 Sheet）。
 *
 * 微信浏览器不会触发 mqq://、mqqwpa://，且会拦截外部 scheme 跳转。
 * 显示提示让用户复制 URL 到 Safari/Chrome/QQ 打开，避免静默失败。
 *
 * 触发：detectQQContext() === "wechat" 时由 ModelDetailSheet / ContactSection 调起。
 */
import { Drawer } from "vaul";
import { Copy, CheckCircle, X } from "lucide-react";
import { useState } from "react";
import { cn } from "./ui/utils";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function WechatHintSheet({ open, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const url = typeof window === "undefined" ? "" : window.location.href;

  const copyUrl = () => {
    void navigator.clipboard?.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Drawer.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-40" />
        <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 bg-card rounded-t-[20px] shadow-[0_-8px_24px_rgba(0,0,0,0.08)] pb-safe">
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-9 h-1 rounded-full bg-border" />
          </div>
          <div className="flex items-center justify-between px-4 py-2">
            <h2 className="text-base font-semibold text-foreground">请在外部浏览器打开</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>

          <div className="px-5 pt-2 pb-6 space-y-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              微信浏览器不支持唤起 QQ。请按下方步骤在 Safari / Chrome / QQ 中打开本页面再联系。
            </p>

            <div className="bg-secondary/60 rounded-[12px] p-4 space-y-2 text-sm">
              <p className="text-foreground">
                <span className="text-primary mr-2">1.</span>
                点击下方"复制链接"
              </p>
              <p className="text-foreground">
                <span className="text-primary mr-2">2.</span>
                打开 Safari / Chrome / QQ
              </p>
              <p className="text-foreground">
                <span className="text-primary mr-2">3.</span>
                粘贴到地址栏访问
              </p>
            </div>

            <button
              onClick={copyUrl}
              className={cn(
                "w-full flex items-center justify-center gap-2 py-3 rounded-[12px] text-sm border transition-colors",
                copied
                  ? "bg-secondary text-primary border-primary/20"
                  : "bg-primary text-primary-foreground border-primary",
              )}
            >
              {copied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? "已复制链接" : "复制链接"}
            </button>

            <p className="text-[11px] text-muted-foreground text-center break-all">
              {url}
            </p>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
