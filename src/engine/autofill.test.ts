import { describe, expect, it } from "vitest";
import { AUTOCOMPLETE_RULE_TEXT, BENCH_AUTOFILL_RULE_TEXT, autoComplete, autoFillBench } from "./autofill";
import { emptyLineup, FORMATIONS } from "./rules";
import { lineupToTeam } from "./team";
import { randomLegalPartialLineup, realGameweek, rng, syntheticContext } from "./testing/fixtures";
import type { EngineContext, Lineup, Position } from "./types";
import { budgetStatus, canAddPlayer, validateTeam } from "./validate";

const { ctx } = realGameweek(37);

function fillXi(l: Lineup, ids: number[]): Lineup {
  let k = 0;
  return { ...l, slots: l.slots.map((s) => (s.kind === "xi" ? { ...s, playerId: ids[k++]! } : { ...s })) };
}

function benchIds(l: Lineup): number[] {
  return l.slots.filter((s) => s.kind === "bench").map((s) => s.playerId!);
}

describe("bench auto-fill", () => {
  // Synthetic league: one player per club and position, price rises with the club number.
  // Extra DEF 450 (club 5) costs 41, the same as DEF 101 (club 1): the tie goes to the lower id.
  const spec: [number, Position, number, number][] = [];
  for (let c = 1; c <= 20; c++) {
    spec.push([c, "GK", c, 40 + c], [100 + c, "DEF", c, 40 + c], [200 + c, "MID", c, 45 + c], [300 + c, "FWD", c, 45 + c]);
  }
  spec.push([450, "DEF", 5, 41]);
  const synth = syntheticContext(spec);
  // 3-4-3 XI from clubs 16-20 (bench needs GK, DEF, DEF, MID).
  const xi = [20, 118, 119, 120, 216, 217, 218, 219, 317, 318, 319];

  it("picks the cheapest legal players (ties: lower id) and orders GK first, then price high to low", () => {
    const res = autoFillBench(fillXi(emptyLineup("3-4-3", synth.rules), xi), synth);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // Cheapest: GK 1 (41), DEF 101 (41) and 450 (41, tie -> 101 first), MID 201 (46).
    expect(benchIds(res.lineup)).toEqual([1, 201, 101, 450]);
  });

  it("is deterministic and the finished team is legal (real GW37 data, AI XI)", () => {
    const { reveal } = realGameweek(37);
    const l = fillXi(emptyLineup(reveal.ai.formation, ctx.rules), orderedXi(reveal.ai.starting, ctx));
    const a = autoFillBench(l, ctx);
    const b = autoFillBench(l, ctx);
    expect(a).toEqual(b);
    if (!a.ok) throw new Error(a.reason);
    const team = lineupToTeam(a.lineup, reveal.ai.captain_id, reveal.ai.vice_captain_id)!;
    expect(validateTeam(team, ctx)).toEqual([]);
    const bench = team.bench.map((id) => ctx.players.get(id)!);
    expect(bench[0]!.position).toBe("GK");
    expect(bench.slice(1).map((p) => p.price)).toEqual(bench.slice(1).map((p) => p.price).sort((x, y) => y - x));
  });

  it("leaves a full bench untouched and keeps players the group already picked", () => {
    const { reveal } = realGameweek(37);
    const l = fillXi(emptyLineup(reveal.ai.formation, ctx.rules), orderedXi(reveal.ai.starting, ctx));
    const full = autoFillBench(l, ctx);
    if (!full.ok) throw new Error(full.reason);
    expect(autoFillBench(full.lineup, ctx)).toEqual({ ok: true, lineup: full.lineup });
    // Keep one manual pick (an expensive midfielder) and auto-fill the rest.
    const manual = structuredClone(l);
    const midSlot = manual.slots.findIndex((s) => s.kind === "bench" && s.position === "MID");
    const mid = [...ctx.byPosition.MID].reverse().find((p) => canAddPlayer(manual, midSlot, p.id, ctx).ok)!;
    manual.slots[midSlot]!.playerId = mid.id;
    const res = autoFillBench(manual, ctx);
    if (!res.ok) throw new Error(res.reason);
    expect(benchIds(res.lineup)).toContain(mid.id);
  });

  it("has a plain-language rule text", () => {
    expect(BENCH_AUTOFILL_RULE_TEXT).toMatch(/cheapest/);
    expect(BENCH_AUTOFILL_RULE_TEXT).toMatch(/goalkeeper first/);
  });
});

/** XI ids rearranged into slot order (GK, DEF, MID, FWD) so fillXi puts each in a matching slot. */
function orderedXi(ids: number[], c: EngineContext): number[] {
  const order = ["GK", "DEF", "MID", "FWD"];
  return [...ids].sort((a, b) => order.indexOf(c.players.get(a)!.position) - order.indexOf(c.players.get(b)!.position));
}

describe("timer auto-complete", () => {
  it("completes an empty lineup in every formation to a legal team, deterministically", () => {
    for (const f of FORMATIONS) {
      const l = emptyLineup(f, ctx.rules);
      const a = autoComplete(l, null, null, ctx);
      expect(a).toEqual(autoComplete(l, null, null, ctx));
      if (!a.ok) throw new Error(a.reason);
      expect(validateTeam(a.team, ctx)).toEqual([]);
      expect(budgetStatus(a.lineup, ctx).spent).toBeLessThanOrEqual(ctx.rules.budget);
    }
  });

  it("the first spot (goalkeeper) gets the most expensive goalkeeper; ties go to the lower id", () => {
    const a = autoComplete(emptyLineup("4-4-2", ctx.rules), null, null, ctx);
    if (!a.ok) throw new Error(a.reason);
    const top = Math.max(...ctx.byPosition.GK.map((p) => p.price));
    const expected = ctx.byPosition.GK.filter((p) => p.price === top).sort((x, y) => x.id - y.id)[0]!;
    expect(a.lineup.slots[0]!.playerId).toBe(expected.id);
  });

  it("keeps the group's picks and their captain/vice; fills a missing captain with the most expensive starter", () => {
    const r = rng(5);
    const partial = randomLegalPartialLineup(ctx, r, 0.5);
    const picked = partial.slots.map((s) => s.playerId);
    const a = autoComplete(partial, null, null, ctx);
    if (!a.ok) throw new Error(a.reason);
    a.lineup.slots.forEach((s, i) => {
      if (picked[i] !== null) expect(s.playerId).toBe(picked[i]);
    });
    const starters = a.team.starting.map((id) => ctx.players.get(id)!).sort((x, y) => y.price - x.price || x.id - y.id);
    expect(a.captainId).toBe(starters[0]!.id);
    expect(a.viceCaptainId).toBe(starters[1]!.id);

    const xi = a.team.starting;
    const kept = autoComplete(partial, xi[3]!, xi[4]!, ctx);
    if (!kept.ok) throw new Error(kept.reason);
    expect([kept.captainId, kept.viceCaptainId]).toEqual([xi[3], xi[4]]);
  });

  it("property: 300 random legal partial lineups always complete to a legal team", () => {
    const r = rng(123);
    for (let run = 0; run < 300; run++) {
      const partial = randomLegalPartialLineup(ctx, r, r());
      const res = autoComplete(partial, null, null, ctx);
      if (!res.ok) throw new Error(`run ${run}: ${res.reason}`);
      expect(validateTeam(res.team, ctx), `run ${run}`).toEqual([]);
      if (run < 30) expect(autoComplete(partial, null, null, ctx)).toEqual(res);
    }
  }, 120_000);

  it("reports clearly when the money has already run out (picks made without the checks)", () => {
    const l = emptyLineup("4-4-2", ctx.rules);
    const used = new Map<number, number>();
    for (const s of l.slots.filter((x) => x.kind === "xi")) {
      const p = [...ctx.byPosition[s.position]].reverse().find((x) => (used.get(x.team_id) ?? 0) < 3 && !l.slots.some((y) => y.playerId === x.id))!;
      s.playerId = p.id;
      used.set(p.team_id, (used.get(p.team_id) ?? 0) + 1);
    }
    expect(budgetStatus(l, ctx).freeToSpend!).toBeLessThan(0);
    const res = autoComplete(l, null, null, ctx);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toMatch(
        /^(You're over budget by £\d+\.\dm\.|Not enough money left: the cheapest way to fill your empty spots costs £\d+\.\dm, but you only have £\d+\.\dm\.)$/,
      );
    }
    expect(autoFillBench(l, ctx).ok).toBe(false);
  });

  it("reports clearly when the club limit makes it impossible", () => {
    // Every goalkeeper is from club 1, and the lineup already has 3 club-1 players.
    const spec: [number, Position, number, number][] = [[1, "GK", 1, 40], [2, "GK", 1, 41]];
    for (let c = 1; c <= 6; c++) spec.push([100 + c, "DEF", c, 45], [200 + c, "MID", c, 50], [300 + c, "FWD", c, 55]);
    const synth = syntheticContext(spec);
    const l = emptyLineup("4-4-2", synth.rules);
    l.slots[1]!.playerId = 101;
    l.slots[5]!.playerId = 201;
    l.slots[9]!.playerId = 301;
    const res = autoComplete(l, null, null, synth);
    expect(res).toEqual({ ok: false, reason: "Your empty spots can't be filled without breaking the max 3 per club rule." });
  });

  it("has a plain-language rule text", () => {
    expect(AUTOCOMPLETE_RULE_TEXT).toMatch(/most expensive/);
  });
});
