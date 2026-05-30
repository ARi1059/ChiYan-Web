import { TodaySection } from "../components/TodaySection";
import { useSelectedModel } from "../lib/use-selected-model";

export function TodayPage() {
  const { open } = useSelectedModel();
  return <TodaySection onSelectModel={(m) => open(m.code ?? m.id)} />;
}
