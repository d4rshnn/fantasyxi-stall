import { PlaceholderScreen } from "../components/PlaceholderScreen";

export function MeetScreen({ onNext }: { onNext: () => void }) {
  return (
    <PlaceholderScreen
      eyebrow="The challenger"
      title="Meet FantasyXI"
      body="The AI team appears beside yours. reveal.json loads only after the lock (S5)."
      nextLabel="Play the gameweek"
      onNext={onNext}
    />
  );
}
