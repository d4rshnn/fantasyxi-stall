import type { Dispatch } from "react";
import type { EngineContext } from "../engine";
import { finishedTeam, type BuildState } from "../state/build";
import type { Action } from "../state/machine";

/** Minimal lock step for S4 (S5 adds the confirm dialog and frozen-team view). */
export function LockScreen({ build, ctx, dispatch }: { build: BuildState; ctx: EngineContext; dispatch: Dispatch<Action> }) {
  const { problem } = finishedTeam(build, ctx);
  return (
    <main className="screen">
      <p className="screen__eyebrow">Step 4</p>
      <h1 className="screen__title">Lock your team?</h1>
      <p className="screen__body">Once locked, your team can't change. Then FantasyXI shows its team.</p>
      {problem && <p className="message message--static">{problem}</p>}
      {build.message && !problem && <p className="message message--static">{build.message}</p>}
      <div className="row-actions">
        <button type="button" className="btn btn--ghost" onClick={() => dispatch({ type: "GOTO", screen: "captain" })}>
          Back
        </button>
        <button type="button" className="btn btn--primary" onClick={() => dispatch({ type: "LOCK" })} disabled={problem !== null}>
          Lock it in
        </button>
      </div>
    </main>
  );
}
