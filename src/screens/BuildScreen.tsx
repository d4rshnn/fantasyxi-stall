import { PlaceholderScreen } from "../components/PlaceholderScreen";

export function BuildScreen({ onNext }: { onNext: () => void }) {
  return (
    <PlaceholderScreen
      eyebrow="Step 2"
      title="Build your XI"
      body="Pitch, formation picker, player cards and budget bar go here (S4)."
      nextLabel="Next"
      onNext={onNext}
    />
  );
}
