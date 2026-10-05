import { FLOW, type FlowScreen, type Screen } from "../state/machine";

interface Props {
  current: Screen;
  onJump: (screen: FlowScreen) => void;
  onAdmin: () => void;
}

/** Developer shortcut bar. App.tsx renders it only when import.meta.env.DEV is true,
 *  so production builds (npm run build) never contain it. */
export function DevScreenStrip({ current, onJump, onAdmin }: Props) {
  return (
    <nav className="dev-strip" aria-label="Developer screen jump">
      <span className="dev-strip__label">dev: jump to screen</span>
      {FLOW.map((screen) => (
        <button key={screen} aria-current={current === screen} onClick={() => onJump(screen)}>
          {screen}
        </button>
      ))}
      <button aria-current={current === "admin"} onClick={onAdmin}>
        admin
      </button>
    </nav>
  );
}
