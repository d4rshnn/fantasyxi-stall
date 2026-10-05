import { useEffect, useRef, useState } from "react";
import { TIMER_WARNING_MS } from "../state/build";

/** Soft countdown. Calls onTimeUp(now) once when it reaches 0. Shows nothing if not running. */
export function Timer({ endsAt, onTimeUp }: { endsAt: number | null; onTimeUp: (now: number) => void }) {
  const [now, setNow] = useState(() => Date.now());
  const fired = useRef<number | null>(null);

  useEffect(() => {
    if (endsAt === null) return;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      if (t >= endsAt && fired.current !== endsAt) {
        fired.current = endsAt;
        onTimeUp(t);
      }
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [endsAt, onTimeUp]);

  if (endsAt === null) return null;
  const left = Math.max(0, endsAt - now);
  const secs = Math.ceil(left / 1000);
  const label = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  const warning = left <= TIMER_WARNING_MS;
  return (
    <div className={`timer ${warning ? "timer--warning" : ""}`} role="timer" aria-live={warning ? "polite" : "off"}>
      <span className="timer__label">{warning ? "Hurry!" : "Time"}</span>
      <span className="timer__value">{label}</span>
    </div>
  );
}
