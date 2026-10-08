import { describe, expect, it } from "vitest";
import { manifest, realGameweek } from "../engine/testing/fixtures";
import { aiBuild } from "./testing";
import { FLOW, initialState, reducer, type AppState } from "./machine";

function loaded(): AppState {
  const { pregame } = realGameweek(37);
  const m = manifest();
  return reducer(initialState, { type: "DATA_LOADED", data: { manifest: m, gameweek: m.gameweeks[0]!, pregame } });
}

describe("screen state machine", () => {
  it("walks the whole flow with each screen's own button and wraps back to a fresh game", () => {
    let state: AppState = { ...loaded(), teamName: "The Overfitters", build: aiBuild() };
    // What each screen's main button does (Build/Bench/Captain/Meet/... go to a named screen).
    const press: Record<string, Parameters<typeof reducer>[1]> = {
      attract: { type: "NEXT" },
      name: { type: "NEXT" },
      build: { type: "GOTO", screen: "bench" },
      bench: { type: "GOTO", screen: "captain" },
      captain: { type: "GOTO", screen: "lock" },
      lock: { type: "LOCK" },
      meet: { type: "GOTO", screen: "simulate" },
      simulate: { type: "GOTO", screen: "result" },
      result: { type: "GOTO", screen: "leaderboard" },
      leaderboard: { type: "GOTO", screen: "explainer" },
      explainer: { type: "NEXT" },
    };
    const visited: string[] = [state.screen];
    for (let i = 0; i < FLOW.length; i++) {
      state = reducer(state, press[state.screen]!);
      visited.push(state.screen);
    }
    expect(visited).toEqual([...FLOW, "attract"]);
    expect(state.teamName).toBe("");
    expect(state.build!.lockedTeam).toBeNull();
    expect(state.build!.lineup.slots.every((s) => s.playerId === null)).toBe(true);
  });

  it("double clicks never skip a screen", () => {
    // Name: a double Enter goes to Build and stops there.
    let s: AppState = { ...loaded(), screen: "name", teamName: "Twice FC" };
    s = reducer(reducer(s, { type: "NEXT" }), { type: "NEXT" });
    expect(s.screen).toBe("build");
    // Result -> Leaderboard pressed twice stays on Leaderboard.
    const r: AppState = { ...loaded(), screen: "result" };
    const once = reducer(r, { type: "GOTO", screen: "leaderboard" });
    expect(reducer(once, { type: "GOTO", screen: "leaderboard" }).screen).toBe("leaderboard");
  });

  it("opens admin without losing the current screen", () => {
    let state = reducer(initialState, { type: "GOTO", screen: "captain" });
    state = reducer(state, { type: "OPEN_ADMIN" });
    expect(state.screen).toBe("admin");
    expect(reducer(state, { type: "NEXT" }).screen).toBe("admin");
    state = reducer(state, { type: "CLOSE_ADMIN" });
    expect(state.screen).toBe("captain");
  });

  it("ignores team-building actions until the data has loaded", () => {
    expect(reducer(initialState, { type: "UNDO" })).toBe(initialState);
  });

  it("turning the timer off in admin stops a running countdown and blocks new ones", () => {
    let state = reducer(loaded(), { type: "TIMER_START", now: 1000 });
    expect(state.build!.timer.endsAt).toBe(1000 + 180_000);
    state = reducer(state, { type: "SET_TIMER_ENABLED", enabled: false });
    expect(state.build!.timer.endsAt).toBeNull();
    expect(reducer(state, { type: "TIMER_START", now: 2000 })).toBe(state);
  });
});
