import { useState, useRef } from "react";
import { AppProvider } from "./store/AppContext";
import { HomeSection } from "./components/HomeSection";
import { TodaySection } from "./components/TodaySection";
import { RosterSection } from "./components/RosterSection";
import { ContactSection } from "./components/ContactSection";
import { TabBar } from "./components/TabBar";
import { ModelDetailSheet } from "./components/ModelDetailSheet";
import { AdminPanel } from "./components/AdminPanel";
import type { Model } from "./data/models";

type Tab = "home" | "today" | "roster" | "contact";

function AppInner() {
  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [selectedModel, setSelectedModel] = useState<Model | null>(null);
  const [adminOpen, setAdminOpen] = useState(false);

  const tapCount = useRef(0);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleBrandTap = () => {
    tapCount.current += 1;
    if (tapTimer.current) clearTimeout(tapTimer.current);
    tapTimer.current = setTimeout(() => { tapCount.current = 0; }, 1500);
    if (tapCount.current >= 5) {
      tapCount.current = 0;
      setAdminOpen(true);
    }
  };

  return (
    <div className="w-full h-screen bg-background flex flex-col overflow-hidden">
      <main
        className="flex-1 overflow-y-auto"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {activeTab === "home" && (
          <HomeSection
            onSelectModel={setSelectedModel}
            onBrandTap={handleBrandTap}
          />
        )}
        {activeTab === "today" && (
          <TodaySection onSelectModel={setSelectedModel} />
        )}
        {activeTab === "roster" && (
          <RosterSection onSelectModel={setSelectedModel} />
        )}
        {activeTab === "contact" && <ContactSection />}
      </main>

      <TabBar
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab as Tab)}
      />

      <ModelDetailSheet
        model={selectedModel}
        onClose={() => setSelectedModel(null)}
      />

      {adminOpen && <AdminPanel onClose={() => setAdminOpen(false)} />}
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppInner />
    </AppProvider>
  );
}
