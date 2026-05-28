import { useState } from "react";
import { HomeSection } from "./components/HomeSection";
import { TodaySection } from "./components/TodaySection";
import { RosterSection } from "./components/RosterSection";
import { ContactSection } from "./components/ContactSection";
import { TabBar } from "./components/TabBar";
import { ModelDetailSheet } from "./components/ModelDetailSheet";
import type { Model } from "./data/models";

type Tab = "home" | "today" | "roster" | "contact";

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [selectedModel, setSelectedModel] = useState<Model | null>(null);

  return (
    <div className="w-full h-screen bg-background flex flex-col overflow-hidden">
      <main
        className="flex-1 overflow-y-auto"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {activeTab === "home" && (
          <HomeSection onSelectModel={setSelectedModel} />
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
    </div>
  );
}
