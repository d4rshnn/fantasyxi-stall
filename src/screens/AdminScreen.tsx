import { PlaceholderScreen } from "../components/PlaceholderScreen";

interface Props {
  timerEnabled: boolean;
  onTimerEnabled: (enabled: boolean) => void;
  onClose: () => void;
  onReset: () => void;
}

/** Hidden operator page (#/admin or Ctrl+Shift+A). A convenience feature, NOT security:
 *  the PIN added in S7 only guards against accidental deletes. */
export function AdminScreen({ timerEnabled, onTimerEnabled, onClose, onReset }: Props) {
  return (
    <PlaceholderScreen
      eyebrow="Operator"
      title="Admin"
      body="Leaderboard export, delete/reset (PIN) and sound arrive in S7."
      nextLabel="Close admin"
      onNext={onClose}
    >
      <label className="toggle toggle--big">
        <input type="checkbox" checked={timerEnabled} onChange={(e) => onTimerEnabled(e.target.checked)} />
        3-minute timer {timerEnabled ? "on" : "off"}
      </label>
      <button className="btn btn--ghost" onClick={onReset}>
        New game
      </button>
    </PlaceholderScreen>
  );
}
