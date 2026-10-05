import { describe, expect, it } from "vitest";
import { manifest, realGameweek } from "../engine/testing/fixtures";
import { FLOW, initialState, reducer, type AppState } from "./machine";

function loaded(): AppState {
  const { pregame } = realGameweek(37);
  const m = manifest();
  return reducer(initialState, { type: "DATA_LOADED", data: { manifest: m, gameweek: m.gameweeks[0]!, pregame } });
}

describe("screen state machine", () => {
  it("walks the whole flow with Next and wraps back to a fresh game", () => {
    let state: AppState = { ...loaded(), teamName: "The Overfitters" };
    state = reducer(state, { type: "PLACE_PLAYER", slotIndex: 0, playerId: realGameweek(37).ctx.byPosition.GK[0]!.id });
    expect(state.build!.lineup.slots[0]!.playerId).not.toBeNull();
    const visited: string[] = [state.screen];
    for (let i = 0; i < FLOW.length; i++) {
      state = reducer(state, { type: "NEXT" });
      visited.push(state.screen);
    }
    expect(visited).toEqual([...FLOW, "attract"]);
    expect(state.teamName).toBe("");
    expect(state.build!.lineup.slots.every((s) => s.playerId === null)).toBe(true);
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
    expect(reducer(state, { type: "TIME_UP", now: 999_999 })).toBe(state);
  });
});
