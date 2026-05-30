/**
 * 全局 Toast：顶部居中胶囊，毛玻璃，3s 自动消失。
 *
 * 不引第三方（sonner / react-hot-toast 多 ~8KB）；纯 React Context 实装。
 *
 * 用法：
 *   const { show } = useToast();
 *   show("QQ 号已复制");
 *   show("操作过于频繁", { duration: 5000, tone: "warn" });
 */
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, AlertTriangle, Info } from "lucide-react";

type ToastTone = "info" | "success" | "warn";

interface ToastEntry {
  id: number;
  text: string;
  tone: ToastTone;
}

interface ToastOpts {
  /** 默认 3000ms。 */
  duration?: number;
  /** 默认 info。 */
  tone?: ToastTone;
}

interface ToastContextValue {
  show: (text: string, opts?: ToastOpts) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastEntry[]>([]);
  const idRef = useRef(0);

  const show = useCallback((text: string, opts: ToastOpts = {}) => {
    const id = ++idRef.current;
    const tone = opts.tone ?? "info";
    setItems((prev) => [...prev, { id, text, tone }]);
    setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, opts.duration ?? 3000);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div
        className="fixed top-12 left-0 right-0 z-[60] pointer-events-none flex flex-col items-center gap-2 px-4"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        {items.map((t) => (
          <ToastItem key={t.id} entry={t} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ entry }: { entry: ToastEntry }) {
  const Icon =
    entry.tone === "success" ? CheckCircle2 : entry.tone === "warn" ? AlertTriangle : Info;
  return (
    <div className="bg-foreground/85 backdrop-blur-md text-background rounded-full px-4 py-2 text-xs flex items-center gap-2 shadow-lg max-w-[90%] animate-in fade-in slide-in-from-top-2 duration-200">
      <Icon className="w-3.5 h-3.5 flex-shrink-0" />
      <span className="truncate">{entry.text}</span>
    </div>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
