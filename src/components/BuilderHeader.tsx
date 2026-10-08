import { useEffect, type Dispatch } from "react";
import type { EngineContext } from "../engine";
import type { BuildState } from "../state/build";
import type { Action } from "../state/machine";
import { BudgetBar } from "./BudgetBar";
import { Timer } from "./Timer";

const STEPS = [
  { id: "build", label: "1 Starting XI" },
  { id: "bench", label: "2 Bench" },
  { id: "captain", label: "3 Captain" },
] as const;

interface Props {
  step: (typeof STEPS)[number]["id"];
  build: BuildState;
  ctx: EngineContext;
  dispatch: Dispatch<Action>;
  timerEnabled: boolean;
  timerMs?: number;
}

/** Step indicator, countdown, budget bar and the latest "can't do that" message. */
export function BuilderHeader({ step, build, ctx, dispatch, timerEnabled, timerMs }: Props) {
  // Starts the countdown the first time any build step is shown (ignored if already running).
  useEffect(() => {
    if (timerEnabled) dispatch({ type: "TIMER_START", now: Date.now(), durationMs: timerMs });
  }, [timerEnabled, timerMs, dispatch]);

  // Messages fade after a few seconds.
  useEffect(() => {
    if (!build.message) return;
    const id = window.setTimeout(() => dispatch({ type: "DISMISS_MESSAGE" }), 4500);
    return () => window.clearTimeout(id);
  }, [build.message, dispatch]);

  return (
    <header className="builder-header">
      <div className="builder-header__top">
        <ol className="steps">
          {STEPS.map((s) => (
            <li key={s.id} className={s.id === step ? "steps__item steps__item--current" : "steps__item"} aria-current={s.id === step ? "step" : undefined}>
              {s.label}
            </li>
          ))}
        </ol>
        {timerEnabled && <Timer endsAt={build.timer.endsAt} />}
      </div>
      <BudgetBar lineup={build.lineup} ctx={ctx} step={step} />
      <div className="message-slot" aria-live="polite">
        {build.message && (
          <button type="button" className="message" onClick={() => dispatch({ type: "DISMISS_MESSAGE" })}>
            {build.message}
          </button>
        )}
      </div>
    </header>
  );
}
