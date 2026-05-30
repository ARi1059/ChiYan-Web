import { RosterSection } from "../components/RosterSection";
import { useSelectedModel } from "../lib/use-selected-model";

export function RosterPage() {
  const { open } = useSelectedModel();
  return <RosterSection onSelectModel={(m) => open(m.code ?? m.id)} />;
}
