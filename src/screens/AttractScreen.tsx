import { PlaceholderScreen } from "../components/PlaceholderScreen";
import type { InitialData } from "../data/types";

export function AttractScreen({ data, onNext }: { data: InitialData; onNext: () => void }) {
  return (
    <PlaceholderScreen
      eyebrow={data.gameweek.label}
      title="Build a team. Challenge our AI."
      body={`FantasyXI scored ${data.gameweek.ai_target_score}. ${data.pregame.players.length} players to choose from.`}
      nextLabel="Start"
      onNext={onNext}
    />
  );
}
