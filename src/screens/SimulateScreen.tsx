import { PlaceholderScreen } from "../components/PlaceholderScreen";

export function SimulateScreen({ onNext }: { onNext: () => void }) {
  return (
    <PlaceholderScreen
      eyebrow="Real results"
      title="Live gameweek"
      body="Fixture-by-fixture reveal with two score counters (S6)."
      nextLabel="See result"
      onNext={onNext}
    />
  );
}
