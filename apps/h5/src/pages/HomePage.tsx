import { HomeSection } from "../components/HomeSection";
import { useSelectedModel } from "../lib/use-selected-model";

interface Props {
  onBrandTap: () => void;
}

export function HomePage({ onBrandTap }: Props) {
  const { open } = useSelectedModel();
  return <HomeSection onSelectModel={(m) => open(m.code ?? m.id)} onBrandTap={onBrandTap} />;
}
