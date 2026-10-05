import { PlaceholderScreen } from "../components/PlaceholderScreen";

export function CaptainScreen({ onNext }: { onNext: () => void }) {
  return (
    <PlaceholderScreen
      eyebrow="Step 4"
      title="Pick a captain"
      body="Tap a starter for captain (C), another for vice (V) (S4)."
      nextLabel="Next"
      onNext={onNext}
    />
  );
}
