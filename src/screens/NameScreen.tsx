import type { Dispatch } from "react";
import type { Action } from "../state/machine";
import { cleanTeamName, randomTeamName, TEAM_NAME_MAX } from "../state/teamNames";

export function NameScreen({ teamName, dispatch }: { teamName: string; dispatch: Dispatch<Action> }) {
  const ready = cleanTeamName(teamName).length > 0;
  return (
    <main className="screen">
      <p className="screen__eyebrow">Step 1</p>
      <h1 className="screen__title">Name your team</h1>
      <form
        className="name-form"
        onSubmit={(e) => {
          e.preventDefault(); // Enter continues
          if (ready) dispatch({ type: "NEXT" });
        }}
      >
        <input
          className="input input--big"
          type="text"
          value={teamName}
          maxLength={TEAM_NAME_MAX}
          placeholder="Your team name"
          aria-label="Team name"
          autoFocus
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => dispatch({ type: "SET_TEAM_NAME", name: e.target.value })}
        />
        <button
          type="button"
          className="btn btn--ghost dice"
          aria-label="Random team name"
          title="Random team name"
          onClick={() => dispatch({ type: "SET_TEAM_NAME", name: randomTeamName(teamName) })}
        >
          🎲
        </button>
        <button type="submit" className="btn btn--primary" disabled={!ready}>
          Next
        </button>
      </form>
      <p className="hint">
        Up to {TEAM_NAME_MAX} characters. Stuck? Roll the dice.
      </p>
    </main>
  );
}
