import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import {
  DEFAULT_MODELS,
  DEFAULT_SETTINGS,
  DEFAULT_DISPLAY,
  type Model,
  type SiteSettings,
  type DisplayConfig,
} from "../data/models";

interface AppContextValue {
  models: Model[];
  settings: SiteSettings;
  display: DisplayConfig;
  updateModel: (id: string, updates: Partial<Model>) => void;
  addModel: (model: Model) => void;
  deleteModel: (id: string) => void;
  setModels: (models: Model[]) => void;
  updateSettings: (updates: Partial<SiteSettings>) => void;
  updateDisplay: (updates: Partial<DisplayConfig>) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [models, setModelsState] = useState<Model[]>(() =>
    load("cy_models", DEFAULT_MODELS)
  );
  const [settings, setSettings] = useState<SiteSettings>(() =>
    load("cy_settings", DEFAULT_SETTINGS)
  );
  const [display, setDisplay] = useState<DisplayConfig>(() =>
    load("cy_display", DEFAULT_DISPLAY)
  );

  useEffect(() => { save("cy_models", models); }, [models]);
  useEffect(() => { save("cy_settings", settings); }, [settings]);
  useEffect(() => { save("cy_display", display); }, [display]);

  const updateModel = (id: string, updates: Partial<Model>) =>
    setModelsState((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...updates } : m))
    );

  const addModel = (model: Model) =>
    setModelsState((prev) => [...prev, model]);

  const deleteModel = (id: string) =>
    setModelsState((prev) => prev.filter((m) => m.id !== id));

  const setModels = (next: Model[]) => setModelsState(next);

  const updateSettings = (updates: Partial<SiteSettings>) =>
    setSettings((prev) => ({ ...prev, ...updates }));

  const updateDisplay = (updates: Partial<DisplayConfig>) =>
    setDisplay((prev) => ({ ...prev, ...updates }));

  return (
    <AppContext.Provider
      value={{
        models,
        settings,
        display,
        updateModel,
        addModel,
        deleteModel,
        setModels,
        updateSettings,
        updateDisplay,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
