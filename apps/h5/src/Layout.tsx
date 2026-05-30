/**
 * H5 主框架：状态屏拦截 + banner + outlet + tab + 全局 sheet + admin panel。
 *
 * brand 5 连击触发 admin：tapCount/tapTimer 用 ref 持有，避免 page 切换重挂时丢值（state 会重置）。
 * AdminPanel 用 isOpen state 控制；HomePage 通过 onBrandTap prop 把点击事件提到 Layout 层。
 */
import { useRef, useState } from "react";
import { Outlet, Route, Routes } from "react-router-dom";
import { useApp } from "./store/AppContext";
import { TabBar } from "./components/TabBar";
import { AdminPanel } from "./components/AdminPanel";
import { ModelDetailSheetRoute } from "./components/ModelDetailSheetRoute";
import { ErrorScreen } from "./components/states/ErrorScreen";
import { LoadingScreen } from "./components/states/LoadingScreen";
import { NetworkBanner } from "./components/states/NetworkBanner";
import { HomePage } from "./pages/HomePage";
import { TodayPage } from "./pages/TodayPage";
import { RosterPage } from "./pages/RosterPage";
import { ContactPage } from "./pages/ContactPage";

export function Layout() {
  const { state, refresh, models } = useApp();
  const [adminOpen, setAdminOpen] = useState(false);

  const tapCount = useRef(0);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleBrandTap = () => {
    tapCount.current += 1;
    if (tapTimer.current) clearTimeout(tapTimer.current);
    tapTimer.current = setTimeout(() => {
      tapCount.current = 0;
    }, 1500);
    if (tapCount.current >= 5) {
      tapCount.current = 0;
      setAdminOpen(true);
    }
  };

  if (state.phase === "failed" && !state.hasCache) {
    return <ErrorScreen error={state.error} onRetry={refresh} />;
  }

  return (
    <div className="w-full h-screen bg-background flex flex-col overflow-hidden">
      {state.phase === "failed" && state.hasCache && <NetworkBanner onRetry={refresh} />}
      <LoadingScreen loading={state.phase === "loading" && models.length === 0} />

      <main
        className="flex-1 overflow-y-auto"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <Routes>
          <Route path="/" element={<HomePage onBrandTap={handleBrandTap} />} />
          <Route path="/today" element={<TodayPage />} />
          <Route path="/roster" element={<RosterPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="*" element={<HomePage onBrandTap={handleBrandTap} />} />
        </Routes>
        <Outlet />
      </main>

      <TabBar />

      <ModelDetailSheetRoute />

      {adminOpen && <AdminPanel onClose={() => setAdminOpen(false)} />}
    </div>
  );
}
