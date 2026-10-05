import { PlaceholderScreen } from "../components/PlaceholderScreen";

export function LeaderboardScreen({ onNext }: { onNext: () => void }) {
  return (
    <PlaceholderScreen
      eyebrow="Today"
      title="Leaderboard"
      body="Ranked teams with FantasyXI's score as a marker line (S7)."
      nextLabel="How did the AI do it?"
      onNext={onNext}
    />
  );
}
