import { useEffect, useRef, useState } from "react";
import { idlePhase, type IdlePhase } from "../state/idle";

/** While `active`, watches for input; shows a countdown near the end and calls onReset after the idle time. */
export function IdleReset({ active, onReset }: { active: boolean; onReset: () => void }) {
  const [phase, setPhase] = useState<IdlePhase>({ phase: "active" });
  const last = useRef(Date.now());

  useEffect(() => {
    if (!active) {
      setPhase({ phase: "active" });
      return;
    }
    last.current = Date.now();
    const touch = () => {
      last.current = Date.now();
      setPhase((p) => (p.phase === "active" ? p : { phase: "active" }));
    };
    const events = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    const id = window.setInterval(() => {
      const p = idlePhase(Date.now() - last.current);
      if (p.phase === "reset") {
        last.current = Date.now();
        setPhase({ phase: "active" });
        onReset();
      } else {
        setPhase((old) => (old.phase === p.phase && (p.phase !== "warning" || (old.phase === "warning" && old.secondsLeft === p.secondsLeft)) ? old : p));
      }
    }, 250);
    return () => {
      events.forEach((e) => window.removeEventListener(e, touch));
      window.clearInterval(id);
    };
  }, [active, onReset]);

  if (!active || phase.phase !== "warning") return null;
  return (
    <div className="idle-notice" role="status">
      Starting a new game in {phase.secondsLeft}… <span className="idle-notice__hint">Tap anywhere to stay.</span>
    </div>
  );
}
