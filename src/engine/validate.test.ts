import { describe, expect, it } from "vitest";
import { cheapestFill } from "./budget";
import { benchPositions, emptyLineup, FORMATIONS, formationCounts, isValidFormation } from "./rules";
import { teamFromAi } from "./team";
import { pick, randomLegalPartialLineup, realGameweek, rng, shuffle, syntheticContext } from "./testing/fixtures";
import { POSITIONS, type Position, type Team } from "./types";
import { budgetStatus, canAddPlayer, checkCandidates, isCompletable, slotChecker, teamFormation, validateTeam } from "./validate";

const codes = (issues: { code: string }[]) => issues.map((i) => i.code);

describe("rules come from pregame.json", () => {
  const { ctx } = realGameweek(37);

  it("every formation in the picker is legal; illegal ones are rejected", () => {
    for (const f of FORMATIONS) expect(isValidFormation(f, ctx.rules)).toBe(true);
    for (const f of ["2-5-3", "6-3-1", "4-2-4", "3-3-3", "4-4-3", "5-5-0", "442", ""]) {
      expect(isValidFormation(f, ctx.rules)).toBe(false);
    }
  });

  it("bench positions follow from the formation", () => {
    expect(benchPositions("3-4-3", ctx.rules)).toEqual(["GK", "DEF", "DEF", "MID"]);
    expect(benchPositions("4-4-2", ctx.rules)).toEqual(["GK", "DEF", "MID", "FWD"]);
    expect(formationCounts("5-4-1", ctx.rules)).toEqual({ GK: 1, DEF: 5, MID: 4, FWD: 1 });
    const l = emptyLineup("4-3-3", ctx.rules);
    expect(l.slots.filter((s) => s.kind === "xi")).toHaveLength(ctx.rules.xi_size);
    expect(l.slots.filter((s) => s.kind === "bench")).toHaveLength(ctx.rules.bench_size);
  });
});

describe("validateTeam on the exported AI teams", () => {
  for (const gw of [37, 38] as const) {
    it(`GW${gw} AI squad is legal under the same rules as everyone`, () => {
      const { reveal, ctx } = realGameweek(gw);
      const team = teamFromAi(reveal.ai);
      expect(validateTeam(team, ctx)).toEqual([]);
      expect(teamFormation(team, ctx)).toBe(reveal.ai.formation);
      const cost = [...team.starting, ...team.bench].reduce((s, id) => s + ctx.players.get(id)!.price, 0);
      expect(cost).toBe(reveal.ai.squad_cost);
    });
  }
});

// A synthetic squad costing exactly £100.0m. Clubs 1..5 with exactly 3 players each.
//   GK 1,2 (50)   DEF 3-7 (60)   MID 8-12 (80)   FWD 13 (66), 14,15 (67)
// Extras: 16 MID club 1 (80), 17 DEF club 6 (61), 18 FWD club 7 (66).
const club = (id: number) => ((id - 1) % 5) + 1;
const synth = syntheticContext([
  [1, "GK", club(1), 50], [2, "GK", club(2), 50],
  ...[3, 4, 5, 6, 7].map((id): [number, Position, number, number] => [id, "DEF", club(id), 60]),
  ...[8, 9, 10, 11, 12].map((id): [number, Position, number, number] => [id, "MID", club(id), 80]),
  [13, "FWD", club(13), 66], [14, "FWD", club(14), 67], [15, "FWD", club(15), 67],
  [16, "MID", 1, 80], [17, "DEF", 6, 61], [18, "FWD", 7, 66],
]);
const legal: Team = { starting: [1, 3, 4, 5, 6, 8, 9, 10, 11, 13, 14], bench: [2, 7, 12, 15], captainId: 13, viceCaptainId: 8 };
const swap = (t: Team, from: number, to: number): Team => ({
  ...t,
  starting: t.starting.map((id) => (id === from ? to : id)),
  bench: t.bench.map((id) => (id === from ? to : id)),
});

describe("validateTeam edge cases", () => {
  it("budget exactly £100.0m is legal", () => {
    expect(validateTeam(legal, synth)).toEqual([]);
  });

  it("£100.1m is over budget", () => {
    const issues = validateTeam(swap(legal, 3, 17), synth);
    expect(issues).toEqual([{ code: "budget", message: "Over budget by £0.1m." }]);
  });

  it("4 players from one club", () => {
    const issues = validateTeam(swap(legal, 12, 16), synth);
    expect(issues).toEqual([{ code: "club-limit", message: "Max 3 players from one club (you have 4 from Club 1)." }]);
  });

  it("wrong squad position counts", () => {
    const issues = validateTeam(swap(legal, 12, 18), synth);
    expect(issues.map((i) => i.message)).toEqual([
      "You need exactly 5 midfielders in your squad (you have 4).",
      "You need exactly 3 forwards in your squad (you have 4).",
    ]);
  });

  it("invalid formations", () => {
    const twoDef: Team = { ...legal, starting: [1, 3, 4, 8, 9, 10, 11, 12, 13, 14, 15], bench: [2, 5, 6, 7] };
    expect(validateTeam(twoDef, synth)).toEqual([
      { code: "formation", message: "Your starting XI needs 3 to 5 defenders (you have 2)." },
    ]);
    const noGk: Team = { ...legal, starting: [7, 3, 4, 5, 6, 8, 9, 10, 11, 13, 14], bench: [1, 2, 12, 15] };
    expect(validateTeam(noGk, synth)).toEqual([
      { code: "formation", message: "Your starting XI needs exactly 1 goalkeeper (you have 0)." },
    ]);
    const twoGk: Team = { ...legal, starting: [1, 2, 3, 4, 5, 8, 9, 10, 11, 13, 14], bench: [6, 7, 12, 15] };
    expect(codes(validateTeam(twoGk, synth))).toEqual(["formation"]);
    const fourFwd: Team = { ...legal, starting: [1, 3, 4, 5, 8, 9, 10, 13, 14, 15, 18], bench: [2, 6, 7, 11] };
    expect(validateTeam(fourFwd, synth).map((i) => i.message)).toContain("Your starting XI needs 1 to 3 forwards (you have 4).");
  });

  it("duplicate and unknown players", () => {
    expect(codes(validateTeam(swap(legal, 4, 3), synth))).toContain("duplicate");
    expect(validateTeam(swap(legal, 4, 3), synth)[0]!.message).toBe("Player 3 is in your team twice.");
    expect(codes(validateTeam(swap(legal, 4, 999), synth))).toContain("unknown-player");
  });

  it("wrong number of starters or bench players", () => {
    expect(codes(validateTeam({ ...legal, starting: legal.starting.slice(0, 10) }, synth))).toContain("xi-size");
    expect(codes(validateTeam({ ...legal, bench: legal.bench.slice(0, 3) }, synth))).toContain("bench-size");
  });

  it("captain and vice rules", () => {
    expect(codes(validateTeam({ ...legal, captainId: null }, synth))).toEqual(["no-captain"]);
    expect(codes(validateTeam({ ...legal, viceCaptainId: null }, synth))).toEqual(["no-vice"]);
    expect(codes(validateTeam({ ...legal, captainId: 2 }, synth))).toEqual(["captain-not-starter"]);
    expect(codes(validateTeam({ ...legal, viceCaptainId: 15 }, synth))).toEqual(["vice-not-starter"]);
    expect(codes(validateTeam({ ...legal, viceCaptainId: 13 }, synth))).toEqual(["captain-is-vice"]);
  });
});

describe("cheapestFill (the reserve) is exact and respects the club limit", () => {
  it("doesn't count two cheap players from a club that only has room for one", () => {
    const ctx = syntheticContext([
      [1, "DEF", 1, 40], [2, "DEF", 1, 40], [3, "DEF", 2, 45], [4, "DEF", 3, 50],
    ]);
    const needs = { GK: 0, DEF: 2, MID: 0, FWD: 0 };
    expect(cheapestFill(ctx, { needs, taken: new Set(), clubCounts: new Map() })).toBe(80);
    expect(cheapestFill(ctx, { needs, taken: new Set(), clubCounts: new Map([[1, 2]]) })).toBe(85);
    expect(cheapestFill(ctx, { needs, taken: new Set(), clubCounts: new Map([[1, 3]]) })).toBe(95);
  });

  it("reports impossible when the club limit blocks every option", () => {
    const ctx = syntheticContext([[1, "GK", 1, 40], [2, "GK", 1, 45]]);
    const needs = { GK: 1, DEF: 0, MID: 0, FWD: 0 };
    expect(cheapestFill(ctx, { needs, taken: new Set(), clubCounts: new Map([[1, 3]]) })).toBeNull();
  });

  it("matches a brute-force search on 60 small random leagues", () => {
    const r = rng(7);
    for (let t = 0; t < 60; t++) {
      const spec: [number, Position, number, number][] = [];
      let id = 1;
      for (const pos of POSITIONS) for (let k = 0; k < 4; k++) spec.push([id++, pos, 1 + Math.floor(r() * 3), 40 + Math.floor(r() * 30)]);
      const ctx = syntheticContext(spec);
      const needs = { GK: Math.floor(r() * 2), DEF: Math.floor(r() * 3), MID: Math.floor(r() * 3), FWD: Math.floor(r() * 2) };
      const clubCounts = new Map([[1, Math.floor(r() * 4)], [2, Math.floor(r() * 3)]]);
      expect(cheapestFill(ctx, { needs, taken: new Set(), clubCounts })).toBe(bruteForce(spec, needs, clubCounts, ctx.rules.max_per_club));
    }
  });
});

function bruteForce(
  spec: [number, Position, number, number][],
  needs: Record<Position, number>,
  clubCounts: Map<number, number>,
  max: number,
): number | null {
  let best: number | null = null;
  const go = (i: number, left: Record<Position, number>, clubs: Map<number, number>, cost: number) => {
    if (POSITIONS.every((p) => left[p] === 0)) {
      if (best === null || cost < best) best = cost;
      return;
    }
    if (i === spec.length) return;
    const [, pos, c, price] = spec[i]!;
    go(i + 1, left, clubs, cost);
    if (left[pos] > 0 && (clubs.get(c) ?? 0) < max) {
      go(i + 1, { ...left, [pos]: left[pos] - 1 }, new Map(clubs).set(c, (clubs.get(c) ?? 0) + 1), cost + price);
    }
  };
  go(0, needs, clubCounts, 0);
  return best;
}

describe("canAddPlayer reasons (real GW37 players)", () => {
  const { ctx } = realGameweek(37);
  const lineup = () => emptyLineup("4-4-2", ctx.rules); // slots: 0 GK, 1-4 DEF, 5-8 MID, 9-10 FWD, bench 11-14
  const cheapest = (pos: Position, n = 0) => ctx.byPosition[pos][n]!;

  it("wrong position, already in team, swap in a filled slot", () => {
    const l = lineup();
    const def = cheapest("DEF");
    l.slots[1]!.playerId = def.id;
    expect(canAddPlayer(l, 0, def.id, ctx)).toMatchObject({ ok: false, code: "wrong-position", reason: "This spot is for a goalkeeper." });
    expect(canAddPlayer(l, 2, def.id, ctx)).toMatchObject({ ok: false, code: "already-in-team", reason: "Already in your team." });
    // Replacing the player already in slot 1 with another defender is a swap, so it's allowed.
    expect(canAddPlayer(l, 1, cheapest("DEF", 1).id, ctx)).toEqual({ ok: true });
  });

  it("max 3 per club", () => {
    const l = lineup();
    const arsenal = [...ctx.byPosition.DEF].filter((p) => p.team_id === 1).slice(0, 4);
    arsenal.slice(0, 3).forEach((p, k) => (l.slots[1 + k]!.playerId = p.id));
    expect(canAddPlayer(l, 4, arsenal[3]!.id, ctx)).toMatchObject({
      ok: false,
      code: "club-limit",
      reason: "Max 3 players from one club (you already have 3 from Arsenal).",
    });
  });

  /** Fills the given slots greedily with the most expensive allowed player (like a big-spending group). */
  const greedyFill = (l: ReturnType<typeof lineup>, slots: number[]) => {
    for (const i of slots) {
      const check = slotChecker(l, i, ctx);
      l.slots[i]!.playerId = [...ctx.byPosition[l.slots[i]!.position]].reverse().find((p) => check(p.id).ok)!.id;
    }
  };

  it("'keep money for your other empty spots' once the budget gets tight", () => {
    const l = lineup();
    greedyFill(l, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]); // whole XI except forward slot 10; bench empty
    const b = budgetStatus(l, ctx);
    const check = slotChecker(l, 10, ctx);
    const refused = ctx.byPosition.FWD.map((p) => ({ p, c: check(p.id) })).filter(({ c }) => !c.ok && c.code === "reserve");
    expect(refused.length).toBeGreaterThan(0);
    for (const { p, c } of refused) {
      expect(p.price).toBeLessThanOrEqual(b.remaining); // affordable on its own...
      expect((c as { reason: string }).reason).toMatch(/^Not enough money: keep £\d+\.\dm for your 4 other empty spots\.$/);
    }
    // ...and every allowed forward really does leave the squad completable.
    for (const p of ctx.byPosition.FWD.filter((x) => check(x.id).ok)) {
      const next = { ...l, slots: l.slots.map((s, i) => (i === 10 ? { ...s, playerId: p.id } : s)) };
      expect(isCompletable(next, ctx)).toBe(true);
    }
  });

  it("'too expensive' when a player costs more than everything left", () => {
    const l = lineup();
    greedyFill(l, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14]); // everything except forward slot 10
    const { remaining } = budgetStatus(l, ctx);
    const priciest = [...ctx.byPosition.FWD].reverse().find((p) => !l.slots.some((s) => s.playerId === p.id))!;
    expect(priciest.price).toBeGreaterThan(remaining);
    expect(canAddPlayer(l, 10, priciest.id, ctx)).toEqual({
      ok: false,
      code: "too-expensive",
      reason: `Too expensive: you have £${(remaining / 10).toFixed(1)}m left.`,
    });
  });

  it("checkCandidates gives exactly the same answers as canAddPlayer", () => {
    const r = rng(42);
    for (let t = 0; t < 6; t++) {
      const l = randomLegalPartialLineup(ctx, r, 0.6);
      for (const i of shuffle(r, l.slots.map((_, k) => k)).slice(0, 3)) {
        const batch = checkCandidates(l, i, ctx);
        for (const pl of ctx.byPosition[l.slots[i]!.position]) {
          expect(batch.get(pl.id)).toEqual(canAddPlayer(l, i, pl.id, ctx));
        }
      }
    }
  }, 60_000);
});

describe("the reserve guarantees the squad can always be completed", () => {
  const { ctx } = realGameweek(37);

  it("200 random build sequences using only allowed picks always end in a legal team", () => {
    const r = rng(2026);
    for (let run = 0; run < 200; run++) {
      const l = emptyLineup(pick(r, FORMATIONS), ctx.rules);
      for (const i of shuffle(r, l.slots.map((_, k) => k))) {
        const check = slotChecker(l, i, ctx);
        const pool = ctx.byPosition[l.slots[i]!.position];
        // Half the time behave like a greedy group (most expensive first), otherwise random.
        const order = r() < 0.5 ? [...pool].reverse() : shuffle(r, pool);
        const chosen = order.find((p) => check(p.id).ok);
        expect(chosen, `run ${run}: no allowed player for slot ${i}`).toBeDefined();
        l.slots[i]!.playerId = chosen!.id;
        expect(isCompletable(l, ctx)).toBe(true);
      }
      const xi = l.slots.filter((s) => s.kind === "xi").map((s) => s.playerId!);
      const team: Team = {
        starting: xi,
        bench: l.slots.filter((s) => s.kind === "bench").map((s) => s.playerId!),
        captainId: xi[0]!,
        viceCaptainId: xi[1]!,
      };
      expect(validateTeam(team, ctx)).toEqual([]);
    }
  }, 120_000);
});
