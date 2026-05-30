import { useState } from "react";
import { ArrowLeft, Delete } from "lucide-react";
import { useApp } from "../store/AppContext";
import { useAuth } from "../store/AuthContext";
import { RosterTab } from "../admin/RosterTab";
import { ModelsTab } from "../admin/ModelsTab";
import { SettingsTab } from "../admin/SettingsTab";
import { LoginScreen } from "../admin/LoginScreen";
import { cn } from "./ui/utils";

type AdminTab = "roster" | "models" | "settings";

interface AdminPanelProps {
  onClose: () => void;
}

const TABS: { id: AdminTab; label: string }[] = [
  { id: "roster", label: "名单" },
  { id: "models", label: "模特" },
  { id: "settings", label: "设置" },
];

function PinScreen({ onSuccess }: { onSuccess: () => void }) {
  const { settings } = useApp();
  const [input, setInput] = useState("");
  const [error, setError] = useState(false);

  const handleKey = (k: string) => {
    if (input.length >= 4) return;
    const next = input + k;
    setInput(next);
    setError(false);
    if (next.length === 4) {
      if (next === settings.adminPin) {
        onSuccess();
      } else {
        setTimeout(() => {
          setError(true);
          setInput("");
        }, 300);
      }
    }
  };

  const handleDel = () => {
    setInput((p) => p.slice(0, -1));
    setError(false);
  };

  return (
    <div className="flex flex-col items-center justify-center h-full gap-8 px-8">
      <div className="text-center">
        <p
          className="text-foreground"
          style={{ fontFamily: "'Noto Serif SC', serif", fontSize: "22px", fontWeight: 600 }}
        >
          管理后台
        </p>
        <p className="text-sm text-muted-foreground mt-1">请输入管理密码</p>
      </div>

      <div className="flex gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={cn(
              "w-3 h-3 rounded-full border-2 transition-all duration-150",
              i < input.length
                ? error
                  ? "bg-destructive border-destructive"
                  : "bg-primary border-primary"
                : "bg-transparent border-border",
            )}
          />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3 w-full max-w-[280px]">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((k) => (
          <button
            key={k}
            onClick={() => handleKey(k)}
            className="h-14 rounded-[14px] bg-card shadow-[0_1px_3px_rgba(0,0,0,0.06)] text-foreground text-xl active:scale-95 transition-transform duration-[80ms]"
          >
            {k}
          </button>
        ))}
        <div />
        <button
          onClick={() => handleKey("0")}
          className="h-14 rounded-[14px] bg-card shadow-[0_1px_3px_rgba(0,0,0,0.06)] text-foreground text-xl active:scale-95 transition-transform duration-[80ms]"
        >
          0
        </button>
        <button
          onClick={handleDel}
          className="h-14 rounded-[14px] bg-card shadow-[0_1px_3px_rgba(0,0,0,0.06)] flex items-center justify-center active:scale-95 transition-transform duration-[80ms]"
        >
          <Delete className="w-5 h-5 text-muted-foreground" />
        </button>
      </div>

      {error && <p className="text-sm text-destructive">密码错误，请重试</p>}
    </div>
  );
}

type Phase = "pin" | "login" | "ready";

export function AdminPanel({ onClose }: AdminPanelProps) {
  const { isAuthed, reset } = useAuth();
  const [phase, setPhase] = useState<Phase>("pin");
  const [activeTab, setActiveTab] = useState<AdminTab>("roster");

  const handleClose = () => {
    // 关闭管理面板即销毁会话：JWT 内存存，体感"关页面就退"。
    reset();
    setPhase("pin");
    onClose();
  };

  // 二阶段守卫：PIN 通过 → login → 拿到 access_token → ready
  const effectivePhase: Phase = phase === "ready" && !isAuthed ? "login" : phase;

  return (
    <div className="fixed inset-0 bg-background z-50 flex flex-col">
      <div className="flex items-center justify-between px-5 pt-12 pb-3 border-b border-border">
        <button onClick={handleClose} className="flex items-center gap-1 text-muted-foreground">
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">返回</span>
        </button>
        <p
          className="text-foreground"
          style={{ fontFamily: "'Noto Serif SC', serif", fontSize: "16px", fontWeight: 600 }}
        >
          管理后台
        </p>
        <div className="w-12" />
      </div>

      {effectivePhase === "pin" && <PinScreen onSuccess={() => setPhase("login")} />}
      {effectivePhase === "login" && <LoginScreen onSuccess={() => setPhase("ready")} />}
      {effectivePhase === "ready" && (
        <>
          <div className="flex border-b border-border">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex-1 py-3 text-sm transition-colors duration-150 relative",
                  activeTab === tab.id ? "text-primary" : "text-muted-foreground",
                )}
              >
                {tab.label}
                {activeTab === tab.id && (
                  <span className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-primary rounded-full" />
                )}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto">
            {activeTab === "roster" && <RosterTab />}
            {activeTab === "models" && <ModelsTab />}
            {activeTab === "settings" && <SettingsTab />}
          </div>
        </>
      )}
    </div>
  );
}
