import { PlaceholderScreen } from "../components/PlaceholderScreen";

export function ResultScreen({ onNext }: { onNext: () => void }) {
  return (
    <PlaceholderScreen
      eyebrow="Full time"
      title="Result"
      body="Who won, and by how much (S7)."
      nextLabel="Leaderboard"
      onNext={onNext}
    />
  );
}
