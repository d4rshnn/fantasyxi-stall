import { useEffect, useState } from "react";
import { timerView } from "../state/build";

/** Display-only countdown. Reaching 0 does nothing by itself: it switches to a calm, up-counting
 *  overtime clock ("Time's up · take your time to finish  +0:23"). Shows nothing if not running. */
export function Timer({ endsAt }: { endsAt: number | null }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (endsAt === null) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [endsAt]);

  if (endsAt === null) return null;
  const v = timerView(endsAt, now);
  const label = v.mode === "overtime" ? "Time's up · take your time to finish" : v.mode === "warning" ? "Hurry!" : "Time";
  return (
    // Announce only the change of mode (aria-live off for the ticking value).
    <div className={`timer timer--${v.mode}`} role="timer" aria-live="off">
      <span className="timer__label" aria-live="polite">
        {label}
      </span>
      <span className="timer__value">{v.value}</span>
    </div>
  );
}
