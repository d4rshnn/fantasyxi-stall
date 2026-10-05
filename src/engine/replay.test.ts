import { describe, expect, it } from "vitest";
import { autoComplete } from "./autofill";
import { explainPoints } from "./points";
import { assertReplayTotals, buildReplay, type Replay, type ReplayStep } from "./replay";
import { emptyLineup } from "./rules";
import { resultsById, scoreTeam } from "./score";
import { teamFromAi } from "./team";
import { realGameweek, syntheticContext } from "./testing/fixtures";
import type { EngineContext, FixtureResult, PlayerResult, Position, Team } from "./types";
import { canAddPlayer, validateTeam } from "./validate";

function replayFor(gw: 37 | 38, human: Team): Replay {
  const { ctx, reveal } = realGameweek(gw);
  const results = resultsById(reveal.results);
  const ai = teamFromAi(reveal.ai);
  return buildReplay({
    ctx,
    fixtures: reveal.fixtures,
    results,
    human: { team: human, score: scoreTeam(human, results) },
    ai: { team: ai, score: scoreTeam(ai, results) },
  });
}

/** Cheapest legal team: every spot gets the cheapest player the engine allows; captain = first starters. */
function cheapestTeam(ctx: EngineContext): Team {
  const l = emptyLineup("4-4-2", ctx.rules);
  l.slots.forEach((s, i) => {
    s.playerId = ctx.byPosition[s.position].find((p) => canAddPlayer(l, i, p.id, ctx).ok)!.id;
  });
  const starting = l.slots.filter((s) => s.kind === "xi").map((s) => s.playerId!);
  return { starting, bench: l.slots.filter((s) => s.kind === "bench").map((s) => s.playerId!), captainId: starting[9]!, viceCaptainId: starting[5]! };
}

const last = (r: Replay) => r.steps.at(-1)!.score;
const kinds = (r: Replay, k: ReplayStep["kind"]) => r.steps.filter((s) => s.kind === k);

describe("explainPoints labels real points without changing them", () => {
  for (const gw of [37, 38] as const) {
    it(`every GW${gw} player's labelled events add up to their real points`, () => {
      const { ctx, reveal } = realGameweek(gw);
      for (const r of reveal.results) {
        const e = explainPoints(ctx.players.get(r.id)!.position, r);
        expect(e.addsUp, `player ${r.id}`).toBe(true);
        expect(e.total).toBe(r.points);
      }
    });
  }

  it("reports addsUp=false (UI then shows only the real total) if data doesn't match the table", () => {
    const e = explainPoints("MID", { ...zero(), minutes: 90, goals_scored: 1, points: 4 });
    expect(e.addsUp).toBe(false);
    expect(e.total).toBe(4);
  });
});

describe("replay of the real GW37 data ends exactly on the engine totals", () => {
  const { ctx, reveal } = realGameweek(37);
  const ai = teamFromAi(reveal.ai);

  it("FantasyXI = 98 and a human copy of the AI team ties at 98", () => {
    const r = replayFor(37, ai);
    expect(r.totals).toEqual({ human: 98, ai: 98 });
    expect(last(r)).toEqual({ human: 98, ai: 98 });
    expect(() => assertReplayTotals(r)).not.toThrow();
  });

  it("the cheapest legal team and the timer's auto-completed team also end on their engine totals", () => {
    const cheap = cheapestTeam(ctx);
    expect(validateTeam(cheap, ctx)).toEqual([]);
    const auto = autoComplete(emptyLineup("4-3-3", ctx.rules), null, null, ctx);
    if (!auto.ok) throw new Error(auto.reason);
    for (const human of [cheap, auto.team]) {
      const r = replayFor(37, human);
      expect(last(r)).toEqual(r.totals);
      expect(r.totals.ai).toBe(98);
      expect(r.totals.human).toBe(scoreTeam(human, resultsById(reveal.results)).total);
    }
  });

  it("GW38: FantasyXI = 63", () => {
    expect(last(replayFor(38, teamFromAi(realGameweek(38).reveal.ai))).ai).toBe(63);
  });

  it("every step's running score is the previous score plus its delta (nothing hidden)", () => {
    const r = replayFor(37, cheapestTeam(ctx));
    let h = 0;
    let a = 0;
    for (const s of r.steps) {
      h += s.delta.human;
      a += s.delta.ai;
      expect(s.score).toEqual({ human: h, ai: a });
    }
  });

  it("is deterministic: the same team gives the same replay", () => {
    expect(replayFor(37, cheapestTeam(ctx))).toEqual(replayFor(37, cheapestTeam(ctx)));
  });

  it("orders fixtures by kickoff, skips fixtures with nobody from either team, home club first", () => {
    const r = replayFor(37, ai);
    const kick = r.fixtures.map((f) => f.fixture!.kickoff);
    expect(kick).toEqual([...kick].sort());
    for (const f of r.fixtures) {
      expect(f.playerIds.length).toBeGreaterThan(0);
      const clubs = f.playerIds.map((id) => ctx.players.get(id)!.team_id);
      const firstAway = clubs.findIndex((c) => c !== f.fixture!.home_team_id);
      if (firstAway >= 0) expect(clubs.slice(firstAway).every((c) => c !== f.fixture!.home_team_id)).toBe(true);
    }
    // A player in both teams appears once (Watkins is captain of both here).
    const watkins = kinds(r, "player").filter((s) => s.kind === "player" && s.playerId === reveal.ai.captain_id);
    expect(watkins).toHaveLength(1);
  });

  it("captain bonus and the three GW37 auto-subs appear as their own steps, matching the engine", () => {
    const r = replayFor(37, cheapestTeam(ctx));
    const bonus = kinds(r, "captain-bonus").filter((s) => s.kind === "captain-bonus" && s.side === "ai");
    expect(bonus).toMatchObject([{ playerId: reveal.ai.captain_id, points: 15 }]);
    const subs = kinds(r, "auto-sub").filter((s) => s.kind === "auto-sub" && s.side === "ai").map((s) => s.kind === "auto-sub" && { out: s.outId, in: s.inId });
    expect(subs).toEqual(reveal.ai.breakdown.auto_subs);
  });

  it("lasts roughly 30-45 s at 1x", () => {
    for (const human of [ai, cheapestTeam(ctx)]) {
      const ms = replayFor(37, human).steps.reduce((s, x) => s + x.durationMs, 0);
      expect(ms).toBeGreaterThanOrEqual(30_000);
      expect(ms).toBeLessThanOrEqual(45_000);
    }
  });
});

// ---- Odd cases with a small synthetic league --------------------------------------------------

function zero(): Omit<PlayerResult, "id"> {
  return {
    minutes: 0, points: 0, started: false, goals_scored: 0, assists: 0, clean_sheets: 0, goals_conceded: 0, own_goals: 0,
    penalties_saved: 0, penalties_missed: 0, yellow_cards: 0, red_cards: 0, saves: 0, bonus: 0, bps: 0, defensive_contribution: 0,
  };
}

/** 15-player squads from a 6-club league; ids 1-15 for team A, 21-35 for team B. One fixture: club 1 v club 2. */
function synthetic(results: Record<number, Partial<PlayerResult>>, opts: { listFixture?: boolean } = {}) {
  const spec: [number, Position, number, number][] = [];
  const shape: Position[] = ["GK", "GK", "DEF", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "MID", "FWD", "FWD", "FWD"];
  shape.forEach((pos, i) => spec.push([1 + i, pos, 1 + (i % 5), 50], [21 + i, pos, 2 + (i % 5), 50]));
  const ctx = syntheticContext(spec); // every player's fixture_id is 1
  const fixtures: FixtureResult[] = opts.listFixture === false ? [] : [{ id: 1, kickoff: "2026-05-17 14:00:00", home_team_id: 1, away_team_id: 2, home_score: 0, away_score: 0 }];
  const map = new Map<number, PlayerResult>();
  for (const [id, r] of Object.entries(results)) map.set(Number(id), { id: Number(id), ...zero(), ...r });
  const team = (base: number): Team => ({
    starting: [base, base + 2, base + 3, base + 4, base + 5, base + 7, base + 8, base + 9, base + 10, base + 12, base + 13],
    bench: [base + 1, base + 6, base + 11, base + 14],
    captainId: base + 12,
    viceCaptainId: base + 7,
  });
  const make = (t: Team) => ({ team: t, score: scoreTeam(t, map) });
  return { ctx, fixtures, results: map, human: make(team(1)), ai: make(team(21)) };
}

describe("odd cases never break the replay", () => {
  it("a team with no events at all (nobody played) ends on 0", () => {
    const s = synthetic({});
    const r = buildReplay(s);
    expect(last(r)).toEqual({ human: 0, ai: 0 });
    expect(kinds(r, "player").every((x) => x.kind === "player" && x.delta.human === 0)).toBe(true);
  });

  it("a negative total and a tie are shown exactly", () => {
    const neg = { minutes: 90, red_cards: 1, own_goals: 1, points: -3 };
    const s = synthetic({ 1: neg, 21: neg, 3: { minutes: 30, points: 1 }, 23: { minutes: 30, points: 1 } });
    const r = buildReplay(s);
    expect(r.totals).toEqual({ human: -2, ai: -2 });
    expect(last(r)).toEqual({ human: -2, ai: -2 });
  });

  it("captain didn't play: the vice's double is a separate step after the matches", () => {
    const s = synthetic({ 8: { minutes: 90, goals_scored: 1, points: 7 }, 28: { minutes: 90, points: 2 } });
    const r = buildReplay(s);
    const vice = kinds(r, "vice-captain").filter((x) => x.kind === "vice-captain" && x.side === "human");
    expect(vice).toMatchObject([{ viceId: 8, points: 7 }]);
    expect(last(r)).toEqual(r.totals);
    expect(r.totals.human).toBe(14);
    // The vice step comes after the last fixture ends.
    const endIdx = r.steps.findIndex((x) => x.kind === "fixture-end");
    expect(r.steps.indexOf(vice[0]!)).toBeGreaterThan(endIdx);
  });

  it("a player whose fixture isn't listed (double gameweek data) goes to 'Other matches'", () => {
    const s = synthetic({ 13: { minutes: 90, goals_scored: 2, points: 10 } }, { listFixture: false });
    const r = buildReplay(s);
    expect(r.fixtures).toHaveLength(1);
    expect(r.fixtures[0]!.fixture).toBeNull();
    expect(last(r)).toEqual(r.totals);
    expect(r.totals.human).toBe(20); // captain doubled
  });

  it("assertReplayTotals throws if a replay were ever tampered with", () => {
    const r = buildReplay(synthetic({ 1: { minutes: 90, points: 2 } }));
    const broken: Replay = { ...r, totals: { human: r.totals.human + 1, ai: r.totals.ai } };
    expect(() => assertReplayTotals(broken)).toThrow(/differ from engine totals/);
  });
});
