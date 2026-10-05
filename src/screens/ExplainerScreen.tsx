import { PlaceholderScreen } from "../components/PlaceholderScreen";

export function ExplainerScreen({ onNext }: { onNext: () => void }) {
  return (
    <PlaceholderScreen
      eyebrow="Behind the scenes"
      title="How FantasyXI works"
      body="Five-step explainer (S8)."
      nextLabel="Play again"
      onNext={onNext}
    />
  );
}
