import { describe, expect, it } from "vitest";
import { resultsById, scoreTeam, type ResultLookup } from "./score";
import { teamFromAi } from "./team";
import { realGameweek } from "./testing/fixtures";
import type { Team } from "./types";

const name = (gw: 37 | 38, id: number) => realGameweek(gw).ctx.players.get(id)!.name;

describe("scoring the exported AI teams (must equal the Python pipeline)", () => {
  it("GW37 = 98: 83 from the XI + 15 captain bonus (Watkins), with the three auto-subs", () => {
    const { reveal } = realGameweek(37);
    const s = scoreTeam(teamFromAi(reveal.ai), resultsById(reveal.results));
    expect(s.total).toBe(98);
    expect(s.total).toBe(reveal.ai.total_points);
    expect(s.startingPoints).toBe(83);
    expect(s.captainBonus).toBe(15);
    expect(name(37, s.activeCaptainId!)).toBe("Ollie Watkins");
    expect(s.autoSubs).toEqual(reveal.ai.breakdown.auto_subs);
    const subs = s.autoSubs.map((x) => [name(37, x.out), name(37, x.in)]);
    expect(subs).toEqual([
      ["Isaac Schmidt", "Gabriel dos Santos Magalhães"],
      ["James Trafford", "Konstantinos Mavropanos"],
      ["Sam Greenwood", "Bruno Borges Fernandes"],
    ]);
  });

  it("GW38 = 63 and matches the exported breakdown", () => {
    const { reveal } = realGameweek(38);
    const s = scoreTeam(teamFromAi(reveal.ai), resultsById(reveal.results));
    expect(s.total).toBe(63);
    expect(s.startingPoints).toBe(reveal.ai.breakdown.starting_points);
    expect(s.captainBonus).toBe(reveal.ai.breakdown.captain_bonus);
    expect(s.activeCaptainId).toBe(reveal.ai.breakdown.active_captain_id);
    expect(s.autoSubs).toEqual(reveal.ai.breakdown.auto_subs);
  });

  it("per-player contributions add up to the total, and only 11 players count", () => {
    for (const gw of [37, 38] as const) {
      const { reveal } = realGameweek(gw);
      const s = scoreTeam(teamFromAi(reveal.ai), resultsById(reveal.results));
      expect(s.players.reduce((a, p) => a + p.contribution, 0)).toBe(s.total);
      expect(s.players.filter((p) => p.counted)).toHaveLength(11);
      expect(s.players.filter((p) => p.isActiveCaptain)).toHaveLength(1);
    }
  });

  it("GW37: the goalkeeper is replaced by a defender (formation is not re-checked, like the Python)", () => {
    const { reveal, ctx } = realGameweek(37);
    const s = scoreTeam(teamFromAi(reveal.ai), resultsById(reveal.results));
    const sub = s.autoSubs.find((x) => ctx.players.get(x.out)!.position === "GK")!;
    expect(ctx.players.get(sub.in)!.position).toBe("DEF");
  });
});

// Synthetic teams: starters 1..11, bench 12..15. The engine never looks at positions or owners.
const starters = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const team = (over: Partial<Team> = {}): Team => ({ starting: starters, bench: [12, 13, 14, 15], captainId: 1, viceCaptainId: 2, ...over });
/** Everyone plays 90 minutes and scores 2, except the overrides: id -> [points, minutes]. */
function results(over: Record<number, [number, number]> = {}): ResultLookup {
  const m = new Map<number, { points: number; minutes: number }>();
  for (let id = 1; id <= 15; id++) m.set(id, { points: 2, minutes: 90 });
  for (const [id, [points, minutes]] of Object.entries(over)) m.set(Number(id), { points, minutes });
  return m;
}

describe("captain and vice-captain", () => {
  it("captain played: captain doubled, even if the vice didn't play", () => {
    const s = scoreTeam(team(), results({ 1: [10, 90], 2: [0, 0], 12: [0, 0], 13: [0, 0], 14: [0, 0], 15: [0, 0] }));
    expect(s.activeCaptainId).toBe(1);
    expect(s.captainBonus).toBe(10);
    expect(s.total).toBe(10 + 0 + 9 * 2 + 10);
  });

  it("captain 0 minutes and vice played: vice doubled", () => {
    const s = scoreTeam(team(), results({ 1: [0, 0], 2: [7, 90] }));
    expect(s.activeCaptainId).toBe(2);
    expect(s.captainBonus).toBe(7);
    const vice = s.players.find((p) => p.id === 2)!;
    expect(vice.isActiveCaptain && vice.contribution === 14).toBe(true);
    // Captain is auto-subbed by the first bench player (12, scores 2).
    expect(s.autoSubs).toEqual([{ out: 1, in: 12 }]);
    expect(s.total).toBe(2 + 7 + 9 * 2 + 7);
  });

  it("captain and vice both 0 minutes: no bonus", () => {
    const s = scoreTeam(team(), results({ 1: [0, 0], 2: [0, 0] }));
    expect(s.activeCaptainId).toBe(1);
    expect(s.captainBonus).toBe(0);
    expect(s.total).toBe(11 * 2); // 9 starters + 2 subs, all 2 points
  });

  it("no captain picked: no bonus (never crashes)", () => {
    const s = scoreTeam(team({ captainId: null, viceCaptainId: null }), results());
    expect(s.captainBonus).toBe(0);
    expect(s.total).toBe(22);
  });
});

describe("auto-subs", () => {
  it("follows bench order and skips bench players who didn't play", () => {
    const s = scoreTeam(team(), results({ 4: [0, 0], 7: [0, 0], 12: [0, 0], 13: [5, 60], 14: [1, 1] }));
    expect(s.autoSubs).toEqual([
      { out: 4, in: 13 },
      { out: 7, in: 14 },
    ]);
    expect(s.total).toBe(9 * 2 + 5 + 1 + 2);
    const p13 = s.players.find((p) => p.id === 13)!;
    expect(p13).toMatchObject({ subbedIn: true, replaces: 4, counted: true, benchOrder: 1 });
    expect(s.players.find((p) => p.id === 4)).toMatchObject({ subbedOut: true, replacedBy: 13, counted: false });
  });

  it("uses each bench player once; extra 0-minute starters stay in with 0 points", () => {
    const s = scoreTeam(team(), results({ 3: [0, 0], 5: [0, 0], 9: [0, 0], 12: [0, 0], 13: [0, 0] }));
    expect(s.autoSubs).toEqual([
      { out: 3, in: 14 },
      { out: 5, in: 15 },
    ]);
    expect(s.players.find((p) => p.id === 9)).toMatchObject({ counted: true, subbedOut: false, contribution: 0 });
    expect(s.total).toBe(8 * 2 + 2 + 2 + 0 + 2);
  });

  it("nobody on the bench played: no subs, starters with 0 minutes score 0", () => {
    const s = scoreTeam(team(), results({ 6: [0, 0], 12: [0, 0], 13: [0, 0], 14: [0, 0], 15: [0, 0] }));
    expect(s.autoSubs).toEqual([]);
    expect(s.total).toBe(10 * 2 + 2);
  });

  it("a 0-minute starter with an all-0-minute bench stays in", () => {
    const s = scoreTeam(team(), results({ 11: [0, 0], 12: [0, 0], 13: [0, 0], 14: [0, 0], 15: [0, 0] }));
    expect(s.players.find((p) => p.id === 11)).toMatchObject({ counted: true, subbedOut: false, points: 0 });
  });

  it("a bench player who played a single minute counts as played", () => {
    const s = scoreTeam(team(), results({ 8: [0, 0], 12: [1, 1] }));
    expect(s.autoSubs).toEqual([{ out: 8, in: 12 }]);
  });

  it("players missing from the results count as 0 minutes and 0 points", () => {
    const s = scoreTeam(team({ starting: [...starters.slice(0, 10), 99] }), results({ 12: [0, 0], 13: [3, 90] }));
    expect(s.autoSubs).toEqual([{ out: 99, in: 13 }]);
  });

  it("the same team always scores the same (no hidden state)", () => {
    const r = results({ 1: [0, 0], 4: [0, 0] });
    expect(scoreTeam(team(), r)).toEqual(scoreTeam(team(), r));
  });
});
