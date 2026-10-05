import { PlaceholderScreen } from "../components/PlaceholderScreen";

export function BenchScreen({ onNext }: { onNext: () => void }) {
  return (
    <PlaceholderScreen
      eyebrow="Step 3"
      title="Your bench"
      body="Auto-fill or pick 4 bench players, then order them (S4)."
      nextLabel="Next"
      onNext={onNext}
    />
  );
}
