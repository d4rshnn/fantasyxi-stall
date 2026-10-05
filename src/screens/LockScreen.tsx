import { PlaceholderScreen } from "../components/PlaceholderScreen";

export function LockScreen({ onNext }: { onNext: () => void }) {
  return (
    <PlaceholderScreen
      eyebrow="Step 5"
      title="Lock your team?"
      body="Confirm dialog; the team is frozen after this (S5)."
      nextLabel="Lock it in"
      onNext={onNext}
    />
  );
}
