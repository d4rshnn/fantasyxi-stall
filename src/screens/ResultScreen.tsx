import { PlaceholderScreen } from "../components/PlaceholderScreen";
import type { Outcome } from "../state/machine";

/** Placeholder until S7: shows the two engine totals passed through state. */
export function ResultScreen({ teamName, outcome, onNext }: { teamName: string; outcome: Outcome | null; onNext: () => void }) {
  return (
    <PlaceholderScreen
      eyebrow="Full time"
      title="Result"
      body={outcome ? `${teamName} ${outcome.human} – ${outcome.ai} FantasyXI` : "Play the gameweek first."}
      nextLabel="Leaderboard"
      onNext={onNext}
    />
  );
}
