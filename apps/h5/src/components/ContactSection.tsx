import { useState } from "react";
import { Copy, MessageCircle, Users, Clock, MapPin, CheckCircle } from "lucide-react";
import { useApp } from "../store/AppContext";
import { useToast } from "./ToastProvider";
import { WechatHintSheet } from "./WechatHintSheet";
import { LargeTitleHeader } from "./LargeTitleHeader";
import { buildContactMessage, checkRateLimit, copyAndContactQQ, detectQQContext } from "../lib/qq";
import { cn } from "./ui/utils";

export function ContactSection() {
  const { settings } = useApp();
  const toast = useToast();
  const [copiedQQ, setCopiedQQ] = useState(false);
  const [copiedGroup, setCopiedGroup] = useState(false);
  const [wechatHintOpen, setWechatHintOpen] = useState(false);

  const handleCopy = (text: string, type: "qq" | "group") => {
    navigator.clipboard.writeText(text).catch(() => {});
    if (type === "qq") {
      setCopiedQQ(true);
      setTimeout(() => setCopiedQQ(false), 2000);
    } else {
      setCopiedGroup(true);
      setTimeout(() => setCopiedGroup(false), 2000);
    }
  };

  /**
   * 联系工作室：与 ModelDetailSheet handleContactQQ 同模式 ——
   * user gesture 同步：限流 → 微信引导 → 复制话术 → 唤起 scheme。
   */
  const handleContactQQ = () => {
    const rate = checkRateLimit();
    if (!rate.allowed) {
      toast.show("操作过于频繁，请稍后再试", { tone: "warn" });
      return;
    }
    const ctx = detectQQContext();
    if (ctx === "wechat") {
      setWechatHintOpen(true);
      return;
    }
    const message = buildContactMessage(settings.agencyName, settings.agencyQQ);
    const r = copyAndContactQQ(settings.agencyQQ, message);
    if (r.copied) {
      toast.show(ctx === "pc" ? "QQ 号已复制，已新窗口打开" : "QQ 号已复制，正在打开 QQ…", {
        tone: "success",
      });
    } else {
      toast.show("复制失败，请长按 QQ 号手动复制", { tone: "warn" });
    }
  };

  return (
    <div className="min-h-full pb-8">
      <LargeTitleHeader
        title="联系我们"
        subline={`${settings.agencyName} · ${settings.agencySlogan}`}
        variant="title-1"
      />

      <div className="px-5 space-y-3">
        <div className="bg-card rounded-[16px] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <MessageCircle className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-foreground">经纪人 QQ</p>
              <p
                className="text-primary"
                style={{ fontFamily: "DM Mono, monospace", fontSize: "18px", fontWeight: 500 }}
              >
                {settings.agencyQQ}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleCopy(settings.agencyQQ, "qq")}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-[10px] text-sm border transition-colors duration-200",
                copiedQQ
                  ? "bg-secondary text-primary border-primary/20"
                  : "bg-card text-foreground border-border",
              )}
            >
              {copiedQQ ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copiedQQ ? "已复制" : "复制号码"}
            </button>
            <button
              onClick={handleContactQQ}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-[10px] bg-primary text-primary-foreground text-sm"
            >
              <MessageCircle className="w-4 h-4" />
              立即联系
            </button>
          </div>
        </div>

        {settings.agencyQQGroup && (
          <div className="bg-card rounded-[16px] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center">
                <Users className="w-5 h-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm text-foreground">官方 QQ 群</p>
                <p
                  className="text-foreground"
                  style={{ fontFamily: "DM Mono, monospace", fontSize: "18px", fontWeight: 500 }}
                >
                  {settings.agencyQQGroup}
                </p>
              </div>
            </div>
            <button
              onClick={() => handleCopy(settings.agencyQQGroup, "group")}
              className={cn(
                "w-full flex items-center justify-center gap-1.5 py-2.5 rounded-[10px] text-sm border transition-colors duration-200",
                copiedGroup
                  ? "bg-secondary text-primary border-primary/20"
                  : "bg-card text-foreground border-border",
              )}
            >
              {copiedGroup ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copiedGroup ? "已复制群号" : "复制群号"}
            </button>
          </div>
        )}

        <div className="bg-card rounded-[16px] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] space-y-3">
          <p
            className="text-sm text-foreground"
            style={{ fontFamily: "'Noto Serif SC', serif", fontWeight: 600 }}
          >
            服务信息
          </p>
          {settings.businessHours && (
            <div className="flex items-start gap-3">
              <Clock className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm text-foreground">营业时间</p>
                <p className="text-xs text-muted-foreground mt-0.5">{settings.businessHours}</p>
              </div>
            </div>
          )}
          <div className="flex items-start gap-3">
            <MapPin className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm text-foreground">服务城市</p>
              <p className="text-xs text-muted-foreground mt-0.5">成都</p>
            </div>
          </div>
        </div>

        <div className="bg-secondary/60 rounded-[16px] p-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            所有模特资料仅供参考，实际接单以当日通告为准。如需预约请通过官方 QQ 联系，谨防冒充人员。
          </p>
        </div>
      </div>

      <WechatHintSheet open={wechatHintOpen} onClose={() => setWechatHintOpen(false)} />
    </div>
  );
}
