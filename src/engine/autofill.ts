// Deterministic auto-fill rules (docs/GAME_DESIGN.md). Same inputs always give the same output.
// Both rules only ever pick players that canAddPlayer allows, so the result is always completable/legal.

import { POSITIONS, type EngineContext, type Lineup, type Player, type Team } from "./types";
import { lineupToTeam } from "./team";
import { budgetStatus, slotChecker } from "./validate";
import { formatPrice } from "./rules";

/** Shown to players (tooltip on "Auto-fill my bench"). */
export const BENCH_AUTOFILL_RULE_TEXT =
  "Each empty bench spot gets the cheapest player for that position who keeps your team legal " +
  "(within budget, max 3 per club). Then your bench is ordered: goalkeeper first, then the most " +
  "expensive player first. Ties are settled by a fixed player order. You can reorder it afterwards.";

/** Shown in the "Time's up" dialog. */
export const AUTOCOMPLETE_RULE_TEXT =
  "Each empty starting spot (goalkeeper, then defenders, midfielders, forwards) gets the most expensive " +
  "player you can still afford while keeping enough money to fill every other empty spot with the " +
  "cheapest legal players (max 3 per club). Empty bench spots are then filled by the bench rule. If you " +
  "haven't picked a captain, it's your most expensive starter; the vice-captain is the next most " +
  "expensive. Ties are settled by a fixed player order.";

export type FillResult = { ok: true; lineup: Lineup } | { ok: false; reason: string };

export type CompleteResult =
  | { ok: true; lineup: Lineup; team: Team; captainId: number; viceCaptainId: number }
  | { ok: false; reason: string };

const cloneLineup = (l: Lineup): Lineup => ({ formation: l.formation, slots: l.slots.map((s) => ({ ...s })) });

const posOrder = (p: Player["position"]) => POSITIONS.indexOf(p);

function cannotComplete(lineup: Lineup, ctx: EngineContext): string | null {
  const b = budgetStatus(lineup, ctx);
  if (b.reservedForEmpty === null) {
    return `Your empty spots can't be filled without breaking the max ${ctx.rules.max_per_club} per club rule.`;
  }
  if (b.remaining < 0) return `You're over budget by ${formatPrice(-b.remaining)}.`;
  if (b.freeToSpend! < 0) {
    return `Not enough money left: the cheapest way to fill your empty spots costs ${formatPrice(b.reservedForEmpty)}, ` +
      `but you only have ${formatPrice(b.remaining)}.`;
  }
  return null;
}

/** Fills slot `i` with the first allowed player from `candidates` (already in preference order). */
function fillSlot(lineup: Lineup, i: number, candidates: readonly Player[], ctx: EngineContext): boolean {
  const check = slotChecker(lineup, i, ctx);
  for (const pl of candidates) {
    if (check(pl.id).ok) {
      lineup.slots[i]!.playerId = pl.id;
      return true;
    }
  }
  return false;
}

/** Empty slot indexes of one kind, in position order (GK, DEF, MID, FWD), then slot order. */
function emptySlotIndexes(lineup: Lineup, kind: "xi" | "bench"): number[] {
  return lineup.slots
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.kind === kind && s.playerId === null)
    .sort((a, b) => posOrder(a.s.position) - posOrder(b.s.position) || a.i - b.i)
    .map(({ i }) => i);
}

/** Bench auto-fill: cheapest legal player per empty bench spot (ties: lower id), then order the whole
 *  bench GK first, then price high to low (ties: lower id). If the bench was already full, nothing changes. */
export function autoFillBench(lineup: Lineup, ctx: EngineContext): FillResult {
  const empty = emptySlotIndexes(lineup, "bench");
  if (empty.length === 0) return { ok: true, lineup };
  const problem = cannotComplete(lineup, ctx);
  if (problem) return { ok: false, reason: problem };

  const out = cloneLineup(lineup);
  for (const i of empty) {
    // byPosition is cheapest first, ties by lower id.
    if (!fillSlot(out, i, ctx.byPosition[out.slots[i]!.position], ctx)) {
      return { ok: false, reason: "Couldn't find a legal bench player for every spot." };
    }
  }

  const benchIdx = out.slots.flatMap((s, i) => (s.kind === "bench" ? [i] : []));
  const ordered = benchIdx
    .map((i) => out.slots[i]!)
    .sort((a, b) => {
      const pa = ctx.players.get(a.playerId!)!;
      const pb = ctx.players.get(b.playerId!)!;
      const gk = Number(pb.position === "GK") - Number(pa.position === "GK");
      return gk || pb.price - pa.price || pa.id - pb.id;
    });
  benchIdx.forEach((slotIndex, k) => (out.slots[slotIndex] = { ...ordered[k]! }));
  return { ok: true, lineup: out };
}

/** The most expensive starter, excluding `not` (ties: lower id). */
function mostExpensiveStarter(team: Team, ctx: EngineContext, not: number | null): number {
  const pick = team.starting
    .filter((id) => id !== not)
    .map((id) => ctx.players.get(id)!)
    .sort((a, b) => b.price - a.price || a.id - b.id)[0];
  return pick!.id;
}

/** Timer auto-complete. Empty XI spots first (GK, DEF, MID, FWD): the most expensive player that still
 *  leaves enough money for the cheapest legal fill of every other empty spot (ties: lower id).
 *  Then empty bench spots by the bench rule. Then a captain/vice if missing (most expensive starters). */
export function autoComplete(
  lineup: Lineup,
  captainId: number | null,
  viceCaptainId: number | null,
  ctx: EngineContext,
): CompleteResult {
  const problem = cannotComplete(lineup, ctx);
  if (problem) return { ok: false, reason: problem };

  const out = cloneLineup(lineup);
  for (const i of emptySlotIndexes(out, "xi")) {
    const pos = out.slots[i]!.position;
    const mostExpensiveFirst = [...ctx.byPosition[pos]].sort((a, b) => b.price - a.price || a.id - b.id);
    if (!fillSlot(out, i, mostExpensiveFirst, ctx)) {
      return { ok: false, reason: "Couldn't find a legal player for every starting spot." };
    }
  }

  const bench = autoFillBench(out, ctx);
  if (!bench.ok) return bench;

  const draft = lineupToTeam(bench.lineup, null, null);
  if (!draft) return { ok: false, reason: "Some spots are still empty." };
  const starters = new Set(draft.starting);
  const captain = captainId !== null && starters.has(captainId) ? captainId : null;
  const vice = viceCaptainId !== null && starters.has(viceCaptainId) && viceCaptainId !== captain ? viceCaptainId : null;
  const finalCaptain = captain ?? mostExpensiveStarter(draft, ctx, vice);
  const finalVice = vice ?? mostExpensiveStarter(draft, ctx, finalCaptain);

  const team: Team = { ...draft, captainId: finalCaptain, viceCaptainId: finalVice };
  return { ok: true, lineup: bench.lineup, team, captainId: finalCaptain, viceCaptainId: finalVice };
}
