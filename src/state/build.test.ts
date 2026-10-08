import { describe, expect, it } from "vitest";
import { budgetStatus, lineupToTeam, validateTeam, type EngineContext } from "../engine";
import { realGameweek, rng, shuffle } from "../engine/testing/fixtures";
import { buildReducer, newBuild, reshapeLineup, type BuildAction, type BuildState } from "./build";
import { reducer, initialState, type AppState } from "./machine";
import { manifest } from "../engine/testing/fixtures";

const { ctx, reveal } = realGameweek(37);
const run = (s: BuildState, ...actions: BuildAction[]) => actions.reduce((acc, a) => buildReducer(acc, a, ctx), s);

/** Places the exported AI team into a fresh lineup through the normal actions (each player into an
 *  empty spot of their position), then reorders the bench with MOVE_BENCH to match the export. */
function aiBuild(): BuildState {
  let s = run(newBuild(ctx), { type: "SET_FORMATION", formation: reveal.ai.formation });
  const place = (id: number, kind: "xi" | "bench") => {
    const pos = ctx.players.get(id)!.position;
    const i = s.lineup.slots.findIndex((x) => x.kind === kind && x.position === pos && x.playerId === null);
    s = run(s, { type: "PLACE_PLAYER", slotIndex: i, playerId: id });
  };
  reveal.ai.starting.forEach((id) => place(id, "xi"));
  reveal.ai.bench.forEach((id) => place(id, "bench"));
  reveal.ai.bench.forEach((id, target) => {
    const bench = s.lineup.slots.filter((x) => x.kind === "bench").map((x) => x.playerId);
    s = run(s, { type: "MOVE_BENCH", from: bench.indexOf(id), to: target });
  });
  return s;
}

/** Fills only the starting XI with the cheapest legal players. */
function xiOnly(c: EngineContext = ctx): BuildState {
  let s = newBuild(c);
  s.lineup.slots.forEach((slot, i) => {
    if (slot.kind !== "xi") return;
    const pid = c.byPosition[slot.position].find((p) => !s.lineup.slots.some((x) => x.playerId === p.id) && buildReducer(s, { type: "PLACE_PLAYER", slotIndex: i, playerId: p.id }, c).lineup.slots[i]!.playerId === p.id)!.id;
    s = buildReducer(s, { type: "PLACE_PLAYER", slotIndex: i, playerId: pid }, c);
  });
  return s;
}

describe("placing players goes through the engine", () => {
  it("accepts legal picks and refuses illegal ones with the engine's reason", () => {
    let s = newBuild(ctx);
    const gk = ctx.byPosition.GK[0]!;
    s = run(s, { type: "PLACE_PLAYER", slotIndex: 0, playerId: gk.id });
    expect(s.lineup.slots[0]!.playerId).toBe(gk.id);
    expect(s.message).toBeNull();

    const refused = run(s, { type: "PLACE_PLAYER", slotIndex: 1, playerId: gk.id }); // slot 1 is a defender
    expect(refused.lineup).toBe(s.lineup);
    expect(refused.message).toBe("This spot is for a defender.");

    const arsenalDefs = ctx.byPosition.DEF.filter((p) => p.team_id === 1).slice(0, 4);
    s = run(s, ...arsenalDefs.slice(0, 3).map((p, k): BuildAction => ({ type: "PLACE_PLAYER", slotIndex: 1 + k, playerId: p.id })));
    const fourth = run(s, { type: "PLACE_PLAYER", slotIndex: 4, playerId: arsenalDefs[3]!.id });
    expect(fourth.message).toBe("Max 3 players from one club (you already have 3 from Arsenal).");
  });

  it("the exported AI team can be entered through the UI actions and is legal", () => {
    const s = aiBuild();
    expect(s.message).toBeNull();
    const team = lineupToTeam(s.lineup, reveal.ai.captain_id, reveal.ai.vice_captain_id)!;
    expect(validateTeam(team, ctx)).toEqual([]);
    expect(team.bench).toEqual(reveal.ai.bench);
  });
});

describe("undo, clear, start over", () => {
  it("undo steps back one change at a time", () => {
    const s0 = newBuild(ctx);
    const s1 = run(s0, { type: "PLACE_PLAYER", slotIndex: 0, playerId: ctx.byPosition.GK[0]!.id });
    const s2 = run(s1, { type: "PLACE_PLAYER", slotIndex: 1, playerId: ctx.byPosition.DEF[0]!.id });
    expect(run(s2, { type: "UNDO" }).lineup).toEqual(s1.lineup);
    expect(run(s2, { type: "UNDO" }, { type: "UNDO" }).lineup).toEqual(s0.lineup);
    expect(run(s0, { type: "UNDO" })).toBe(s0); // nothing to undo
  });

  it("clear slot empties one spot and drops its captaincy", () => {
    let s = aiBuild();
    s = run(s, { type: "SET_CAPTAIN", playerId: reveal.ai.captain_id });
    const capSlot = s.lineup.slots.findIndex((x) => x.playerId === reveal.ai.captain_id);
    s = run(s, { type: "CLEAR_SLOT", slotIndex: capSlot });
    expect(s.lineup.slots[capSlot]!.playerId).toBeNull();
    expect(s.captainId).toBeNull();
  });

  it("start over empties everything but can be undone", () => {
    const full = run(aiBuild(), { type: "SET_CAPTAIN", playerId: reveal.ai.captain_id });
    const empty = run(full, { type: "START_OVER" });
    expect(empty.lineup.slots.every((x) => x.playerId === null)).toBe(true);
    expect(empty.captainId).toBeNull();
    expect(run(empty, { type: "UNDO" }).lineup).toEqual(full.lineup);
  });
});

describe("formation changes never lose players", () => {
  it("every formation keeps the same 15 players and stays legal", () => {
    const s = aiBuild();
    const ids = s.lineup.slots.map((x) => x.playerId).sort();
    for (const f of ["4-4-2", "5-4-1", "3-5-2", "4-3-3", "5-3-2", "4-5-1", "3-4-3"]) {
      const next = run(s, { type: "SET_FORMATION", formation: f });
      expect(next.lineup.formation).toBe(f);
      expect(next.lineup.slots.map((x) => x.playerId).sort()).toEqual(ids);
      const team = lineupToTeam(next.lineup, null, null)!;
      expect(validateTeam({ ...team, captainId: team.starting[0]!, viceCaptainId: team.starting[1]! }, ctx)).toEqual([]);
    }
  });

  it("works on half-built lineups too (players keep their position)", () => {
    const r = rng(9);
    let s = newBuild(ctx);
    for (const i of shuffle(r, s.lineup.slots.map((_, k) => k)).slice(0, 7)) {
      const slot = s.lineup.slots[i]!;
      const p = ctx.byPosition[slot.position].find((x) => !s.lineup.slots.some((y) => y.playerId === x.id))!;
      s = run(s, { type: "PLACE_PLAYER", slotIndex: i, playerId: p.id });
    }
    const re = reshapeLineup(s.lineup, "5-3-2", ctx);
    for (const slot of re.slots) if (slot.playerId !== null) expect(ctx.players.get(slot.playerId)!.position).toBe(slot.position);
    expect(re.slots.filter((x) => x.playerId !== null)).toHaveLength(s.lineup.slots.filter((x) => x.playerId !== null).length);
  });

  it("refuses formations that aren't allowed", () => {
    expect(run(newBuild(ctx), { type: "SET_FORMATION", formation: "2-5-3" }).message).toBe("That formation isn't allowed.");
  });
});

describe("bench step", () => {
  it("auto-fill uses the engine rule and fills a legal bench", () => {
    const s = run(xiOnly(), { type: "AUTO_FILL_BENCH" });
    const team = lineupToTeam(s.lineup, null, null)!;
    expect(team.bench).toHaveLength(4);
    expect(ctx.players.get(team.bench[0]!)!.position).toBe("GK");
    expect(budgetStatus(s.lineup, ctx).freeToSpend).toBeGreaterThanOrEqual(0);
  });

  it("reordering swaps bench positions (auto-sub order)", () => {
    const s = run(xiOnly(), { type: "AUTO_FILL_BENCH" });
    const before = lineupToTeam(s.lineup, null, null)!.bench;
    const after = lineupToTeam(run(s, { type: "MOVE_BENCH", from: 0, to: 1 }).lineup, null, null)!.bench;
    expect(after).toEqual([before[1], before[0], before[2], before[3]]);
  });
});

describe("captain and vice", () => {
  it("sets C and V, swaps when tapping the other one, and refuses bench players", () => {
    let s = aiBuild();
    const [a, b] = reveal.ai.starting;
    s = run(s, { type: "SET_CAPTAIN", playerId: a! }, { type: "SET_VICE", playerId: b! });
    expect([s.captainId, s.viceCaptainId]).toEqual([a, b]);
    s = run(s, { type: "SET_CAPTAIN", playerId: b! });
    expect([s.captainId, s.viceCaptainId]).toEqual([b, a]);
    const refused = run(s, { type: "SET_CAPTAIN", playerId: reveal.ai.bench[0]! });
    expect(refused.message).toBe("Only starting players can be captain or vice-captain.");
  });
});

describe("lock", () => {
  it("locks a valid team and then ignores further changes", () => {
    let s = run(aiBuild(), { type: "SET_CAPTAIN", playerId: reveal.ai.captain_id }, { type: "SET_VICE", playerId: reveal.ai.vice_captain_id });
    s = run(s, { type: "LOCK" });
    expect(s.lockedTeam).not.toBeNull();
    expect(run(s, { type: "CLEAR_SLOT", slotIndex: 0 })).toBe(s);
  });

  it("refuses to lock an unfinished team with a plain reason", () => {
    expect(run(aiBuild(), { type: "LOCK" }).message).toBe("Pick a captain.");
    expect(run(newBuild(ctx), { type: "LOCK" }).message).toBe("Fill every spot first (11 starters and 4 on the bench).");
  });
});

describe("lock", () => {
  const valid = () =>
    run(aiBuild(), { type: "SET_CAPTAIN", playerId: reveal.ai.captain_id }, { type: "SET_VICE", playerId: reveal.ai.vice_captain_id });

  it("in the app, locking moves on to Meet FantasyXI", () => {
    const m = manifest();
    let app: AppState = reducer(initialState, { type: "DATA_LOADED", data: { manifest: m, gameweek: m.gameweeks[0]!, pregame: realGameweek(37).pregame } });
    app = { ...reducer(app, { type: "GOTO", screen: "captain" }), build: valid() };
    app = reducer(app, { type: "LOCK" });
    expect(app.screen).toBe("meet");
  });
});
