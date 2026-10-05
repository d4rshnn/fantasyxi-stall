// Test helpers only (never imported by the app).
import { manifest, realGameweek } from "../engine/testing/fixtures";
import { buildReducer, newBuild, type BuildAction, type BuildState } from "./build";
import { initialState, reducer, type AppState } from "./machine";

const { ctx, reveal, pregame } = realGameweek(37);
export { ctx, reveal, pregame };

export function loadedApp(saved?: unknown): AppState {
  const m = manifest();
  return reducer(initialState, { type: "DATA_LOADED", data: { manifest: m, gameweek: m.gameweeks[0]!, pregame }, saved });
}

/** FantasyXI's GW37 team entered through the normal build actions (any legal team works). */
export function aiBuild(): BuildState {
  const run = (s: BuildState, a: BuildAction) => buildReducer(s, a, ctx);
  let s = run(newBuild(ctx), { type: "SET_FORMATION", formation: reveal.ai.formation });
  const place = (id: number, kind: "xi" | "bench") => {
    const pos = ctx.players.get(id)!.position;
    const i = s.lineup.slots.findIndex((x) => x.kind === kind && x.position === pos && x.playerId === null);
    s = run(s, { type: "PLACE_PLAYER", slotIndex: i, playerId: id });
  };
  reveal.ai.starting.forEach((id) => place(id, "xi"));
  reveal.ai.bench.forEach((id) => place(id, "bench"));
  s = run(s, { type: "SET_CAPTAIN", playerId: reveal.ai.captain_id });
  return run(s, { type: "SET_VICE", playerId: reveal.ai.vice_captain_id });
}

/** App on the Lock screen with a finished (not yet locked) team named "Test FC". */
export function readyToLock(): AppState {
  return { ...loadedApp(), teamName: "Test FC", screen: "lock", build: aiBuild() };
}

/** App just after the lock (on the Meet screen, reveal not requested yet). */
export function lockedApp(): AppState {
  return reducer(readyToLock(), { type: "LOCK" });
}
