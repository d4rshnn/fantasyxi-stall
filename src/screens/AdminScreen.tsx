import { PlaceholderScreen } from "../components/PlaceholderScreen";

/** Hidden operator page (#/admin or Ctrl+Shift+A). A convenience feature, NOT security:
 *  the PIN added in S7 only guards against accidental deletes. */
export function AdminScreen({ onClose, onReset }: { onClose: () => void; onReset: () => void }) {
  return (
    <PlaceholderScreen
      eyebrow="Operator"
      title="Admin"
      body="Leaderboard export, delete/reset (PIN), timer and sound toggles arrive in S7."
      nextLabel="Close admin"
      onNext={onClose}
    >
      <button className="btn btn--ghost" onClick={onReset}>
        New game
      </button>
    </PlaceholderScreen>
  );
}
