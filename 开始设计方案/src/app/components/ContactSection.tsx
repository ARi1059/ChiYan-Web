import { useState } from "react";
import { Copy, MessageCircle, Users, Clock, MapPin, CheckCircle } from "lucide-react";
import { AGENCY_QQ, AGENCY_QQ_GROUP } from "../data/models";
import { cn } from "./ui/utils";

export function ContactSection() {
  const [copiedQQ, setCopiedQQ] = useState(false);
  const [copiedGroup, setCopiedGroup] = useState(false);

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

  const handleOpenQQ = () => {
    window.location.href = `mqqwpa://im/chat?chat_type=wpa&uin=${AGENCY_QQ}&version=1&src_type=web`;
  };

  return (
    <div className="min-h-full pb-8">
      <div className="px-5 pt-14 pb-6">
        <h1
          className="text-foreground"
          style={{ fontFamily: "'Noto Serif SC', serif", fontSize: "28px", fontWeight: 700, lineHeight: 1.2 }}
        >
          联系我们
        </h1>
        <p className="text-sm text-muted-foreground mt-1">赤颜模特经纪 · 专业团队服务</p>
      </div>

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
                {AGENCY_QQ}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleCopy(AGENCY_QQ, "qq")}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-[10px] text-sm border transition-colors duration-200",
                copiedQQ
                  ? "bg-secondary text-primary border-primary/20"
                  : "bg-card text-foreground border-border"
              )}
            >
              {copiedQQ ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copiedQQ ? "已复制" : "复制号码"}
            </button>
            <button
              onClick={handleOpenQQ}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-[10px] bg-primary text-primary-foreground text-sm"
            >
              <MessageCircle className="w-4 h-4" />
              立即联系
            </button>
          </div>
        </div>

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
                {AGENCY_QQ_GROUP}
              </p>
            </div>
          </div>
          <button
            onClick={() => handleCopy(AGENCY_QQ_GROUP, "group")}
            className={cn(
              "w-full flex items-center justify-center gap-1.5 py-2.5 rounded-[10px] text-sm border transition-colors duration-200",
              copiedGroup
                ? "bg-secondary text-primary border-primary/20"
                : "bg-card text-foreground border-border"
            )}
          >
            {copiedGroup ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copiedGroup ? "已复制群号" : "复制群号"}
          </button>
        </div>

        <div className="bg-card rounded-[16px] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] space-y-3">
          <p className="text-sm text-foreground" style={{ fontFamily: "'Noto Serif SC', serif", fontWeight: 600 }}>
            服务信息
          </p>
          <div className="flex items-start gap-3">
            <Clock className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm text-foreground">营业时间</p>
              <p className="text-xs text-muted-foreground mt-0.5">每日 10:00 – 22:00 · 节假日不休</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <MapPin className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm text-foreground">服务城市</p>
              <p className="text-xs text-muted-foreground mt-0.5">上海 · 北京 · 广州 · 成都 · 深圳 · 杭州</p>
            </div>
          </div>
        </div>

        <div className="bg-secondary/60 rounded-[16px] p-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            所有模特资料仅供参考，实际接单以当日通告为准。如需预约请通过官方 QQ 联系，谨防冒充人员。
          </p>
        </div>
      </div>
    </div>
  );
}
