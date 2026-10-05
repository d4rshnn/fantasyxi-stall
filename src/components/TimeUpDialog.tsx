import type { Dispatch } from "react";
import { AUTOCOMPLETE_RULE_TEXT } from "../engine";
import type { BuildState } from "../state/build";
import type { Action } from "../state/machine";
import { Dialog } from "./Dialog";

/** Shown when the countdown ends and the team isn't finished (a finished team locks by itself). */
export function TimeUpDialog({ build, dispatch }: { build: BuildState; dispatch: Dispatch<Action> }) {
  const canExtend = build.timer.dialog === "extend-or-complete";
  return (
    <Dialog
      title="Time's up!"
      actions={
        <>
          {canExtend && (
            <button type="button" className="btn btn--ghost" onClick={() => dispatch({ type: "TIMER_EXTEND", now: Date.now() })}>
              +60 seconds (once)
            </button>
          )}
          <button type="button" className="btn btn--primary" onClick={() => dispatch({ type: "TIMER_AUTOCOMPLETE" })}>
            Complete automatically
          </button>
        </>
      }
    >
      <p>{canExtend ? "Complete your team automatically, or take 60 more seconds (once)." : "Your extra minute is over. We'll complete your team for you."}</p>
      <p className="rule-text">
        <strong>How it's completed:</strong> {AUTOCOMPLETE_RULE_TEXT}
      </p>
    </Dialog>
  );
}
