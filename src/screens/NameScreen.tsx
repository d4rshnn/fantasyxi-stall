import { PlaceholderScreen } from "../components/PlaceholderScreen";

export function NameScreen({ onNext }: { onNext: () => void }) {
  return (
    <PlaceholderScreen
      eyebrow="Step 1"
      title="Name your team"
      body="Team name input and random-name dice go here (S4)."
      nextLabel="Next"
      onNext={onNext}
    />
  );
}
