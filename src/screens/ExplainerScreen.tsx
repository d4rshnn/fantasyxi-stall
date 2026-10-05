import { PlaceholderScreen } from "../components/PlaceholderScreen";

/** Placeholder until S8 (the AI explainer). "Play again" starts a fresh game. */
export function ExplainerScreen({ onPlayAgain }: { onPlayAgain: () => void }) {
  return (
    <PlaceholderScreen eyebrow="Behind the scenes" title="How FantasyXI works" body="Five-step explainer (S8)." nextLabel="Play again" onNext={onPlayAgain} />
  );
}
