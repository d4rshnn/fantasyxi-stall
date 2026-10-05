import { describe, expect, it } from "vitest";
import { FLOW, initialState, reducer } from "./machine";

describe("screen state machine", () => {
  it("walks the whole flow with Next and wraps back to a fresh game", () => {
    let state = { ...initialState, game: { teamName: "The Overfitters" } };
    const visited: string[] = [state.screen];
    for (let i = 0; i < FLOW.length; i++) {
      state = reducer(state, { type: "NEXT" });
      visited.push(state.screen);
    }
    expect(visited).toEqual([...FLOW, "attract"]);
    expect(state.game.teamName).toBe("");
  });

  it("opens admin without losing the current screen", () => {
    let state = reducer(initialState, { type: "GOTO", screen: "captain" });
    state = reducer(state, { type: "OPEN_ADMIN" });
    expect(state.screen).toBe("admin");
    expect(reducer(state, { type: "NEXT" }).screen).toBe("admin");
    state = reducer(state, { type: "CLOSE_ADMIN" });
    expect(state.screen).toBe("captain");
  });
});
