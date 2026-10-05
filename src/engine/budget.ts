// Exact cheapest cost to fill a set of empty squad spots, respecting the max-per-club rule.
//
// Why exact: the budget bar and "can I add this player?" must never let a group paint itself into a
// corner. A simple "cheapest player per position" sum can be wrong when the cheapest players share a
// club. Instead we run a small dynamic programme over clubs: for each club we may take 0..allowance
// players (split across positions), always the cheapest ones of that club and position. The state is
// "how many of each position are filled so far" (at most 3x6x6x4 = 432 states), so it is fast.
//
// For the player picker we need that answer for hundreds of candidates at once. candidateFill() runs
// the programme forwards and backwards over the clubs once, then answers each candidate by combining
// "all other clubs" with that candidate's own club - same exact answer, a fraction of the work.

import { POSITIONS, type EngineContext, type Player } from "./types";
import type { PositionCounts } from "./rules";

export interface FillQuery {
  /** Empty spots to fill, per position. */
  needs: PositionCounts;
  /** Players already in the lineup (not available). */
  taken: ReadonlySet<number>;
  /** Current number of lineup players per club. */
  clubCounts: ReadonlyMap<number, number>;
  /** One more player to treat as unavailable (used when testing a candidate). */
  exclude?: number;
}

type Need = [number, number, number, number];

/** The DP state space for a given need vector: states are (filled GK, DEF, MID, FWD). */
interface Space {
  n: Need;
  size: number;
  stride: Need;
  /** digits[s*4 + i] = filled count of position i in state s. */
  digits: Int8Array;
}

function makeSpace(n: Need): Space {
  const radix = n.map((x) => x + 1);
  const size = radix[0]! * radix[1]! * radix[2]! * radix[3]!;
  const stride: Need = [radix[1]! * radix[2]! * radix[3]!, radix[2]! * radix[3]!, radix[3]!, 1];
  const digits = new Int8Array(size * 4);
  for (let s = 0; s < size; s++) {
    let r = s;
    for (let i = 3; i >= 0; i--) {
      digits[s * 4 + i] = r % radix[i]!;
      r = Math.floor(r / radix[i]!);
    }
  }
  return { n, size, stride, digits };
}

/** prefix[i][k] = total price of the k cheapest players of position i (prefix[i][0] = 0). */
type Prefix = number[][];

const prefixOf = (lists: Player[][], limits: number[]): Prefix =>
  lists.map((list, i) => {
    const out = [0];
    for (const pl of list.slice(0, limits[i])) out.push(out.at(-1)! + pl.price);
    return out;
  });

/** One club's contribution: take 0..allowance of its cheapest players (split across positions). */
function step(sp: Space, dp: Float64Array, prefix: Prefix, allowance: number): Float64Array {
  const next = Float64Array.from(dp);
  if (allowance <= 0) return next;
  const { n, size, stride, digits } = sp;
  const caps = prefix.map((p) => p.length - 1);
  for (let s = 0; s < size; s++) {
    const base = dp[s]!;
    if (base === Infinity) continue;
    const o = s * 4;
    const m0 = Math.min(caps[0]!, n[0] - digits[o]!);
    const m1 = Math.min(caps[1]!, n[1] - digits[o + 1]!);
    const m2 = Math.min(caps[2]!, n[2] - digits[o + 2]!);
    const m3 = Math.min(caps[3]!, n[3] - digits[o + 3]!);
    for (let a = 0; a <= m0 && a <= allowance; a++)
      for (let b = 0; b <= m1 && a + b <= allowance; b++)
        for (let c = 0; c <= m2 && a + b + c <= allowance; c++)
          for (let e = 0; e <= m3 && a + b + c + e <= allowance; e++) {
            if (a + b + c + e === 0) continue;
            const cost = base + prefix[0]![a]! + prefix[1]![b]! + prefix[2]![c]! + prefix[3]![e]!;
            const t = s + a * stride[0] + b * stride[1] + c * stride[2] + e;
            if (cost < next[t]!) next[t] = cost;
          }
  }
  return next;
}

/** Available players per club, per position, cheapest first; at most min(need, allowance) + extra each. */
function clubGroups(ctx: EngineContext, n: Need, q: FillQuery, extra: number): Map<number, Player[][]> {
  const max = ctx.rules.max_per_club;
  const groups = new Map<number, Player[][]>();
  POSITIONS.forEach((pos, pi) => {
    const need = n[pi]!;
    if (need === 0) return;
    for (const pl of ctx.byPosition[pos]) {
      if (q.taken.has(pl.id) || pl.id === q.exclude) continue;
      const allowance = max - (q.clubCounts.get(pl.team_id) ?? 0);
      if (allowance <= 0) continue;
      let g = groups.get(pl.team_id);
      if (!g) groups.set(pl.team_id, (g = [[], [], [], []]));
      const list = g[pi]!;
      if (list.length < Math.min(need, allowance) + extra) list.push(pl);
    }
  });
  return groups;
}

const needOf = (needs: PositionCounts): Need => POSITIONS.map((p) => needs[p]) as Need;

function emptyDp(size: number): Float64Array {
  const dp = new Float64Array(size).fill(Infinity);
  dp[0] = 0;
  return dp;
}

/** Minimum total price (tenths) to fill `needs`, or null if it can't be done within the club limit. */
export function cheapestFill(ctx: EngineContext, q: FillQuery): number | null {
  const n = needOf(q.needs);
  if (n.every((x) => x === 0)) return 0;
  const sp = makeSpace(n);
  const max = ctx.rules.max_per_club;
  const groups = clubGroups(ctx, n, q, 0);
  let dp = emptyDp(sp.size);
  for (const club of [...groups.keys()].sort((a, b) => a - b)) {
    const allowance = max - (q.clubCounts.get(club) ?? 0);
    dp = step(sp, dp, prefixOf(groups.get(club)!, [9, 9, 9, 9]), allowance);
  }
  const best = dp[sp.size - 1]!;
  return best === Infinity ? null : best;
}

/** For a lineup state (needs = empty spots AFTER the candidate's spot is filled), returns a function
 *  giving, for a candidate player, the cheapest legal fill once that player is added (their club
 *  gets one less place and they are no longer available). Same answer as cheapestFill with
 *  clubCounts+1 and exclude=candidate, computed much faster for many candidates. */
export function candidateFill(ctx: EngineContext, base: Omit<FillQuery, "exclude">): (candidate: Player) => number | null {
  const n = needOf(base.needs);
  if (n.every((x) => x === 0)) return () => 0;
  const sp = makeSpace(n);
  const max = ctx.rules.max_per_club;
  const allowanceOf = (club: number) => max - (base.clubCounts.get(club) ?? 0);
  const groups = clubGroups(ctx, n, base, 1); // one spare per group, to replace an excluded candidate
  const clubs = [...groups.keys()].sort((a, b) => a - b);
  const index = new Map(clubs.map((c, i) => [c, i]));
  const basePrefix = clubs.map((c) => prefixOf(groups.get(c)!, n.map((x) => Math.min(x, allowanceOf(c)))));

  // forward[i] = best using clubs[0..i-1]; backward[i] = best using clubs[i..].
  const forward: Float64Array[] = [emptyDp(sp.size)];
  clubs.forEach((c, i) => forward.push(step(sp, forward[i]!, basePrefix[i]!, allowanceOf(c))));
  const backward: Float64Array[] = new Array(clubs.length + 1);
  backward[clubs.length] = emptyDp(sp.size);
  for (let i = clubs.length - 1; i >= 0; i--) backward[i] = step(sp, backward[i + 1]!, basePrefix[i]!, allowanceOf(clubs[i]!));
  const full = sp.size - 1;
  const fullWithoutAny = forward[clubs.length]![full]!;

  // others[i].get(s) = best for state s using every club except clubs[i] (forward[i] (+) backward[i+1]).
  const others = clubs.map(() => new Map<number, number>());
  const othersAt = (i: number, s: number): number => {
    const cached = others[i]!.get(s);
    if (cached !== undefined) return cached;
    const f = forward[i]!;
    const g = backward[i + 1]!;
    const { digits } = sp;
    let best = Infinity;
    for (let u = 0; u < sp.size; u++) {
      const fu = f[u]!;
      if (fu === Infinity) continue;
      const ou = u * 4;
      const os = s * 4;
      if (digits[ou]! > digits[os]! || digits[ou + 1]! > digits[os + 1]! || digits[ou + 2]! > digits[os + 2]! || digits[ou + 3]! > digits[os + 3]!) continue;
      const v = fu + g[s - u]!;
      if (v < best) best = v;
    }
    others[i]!.set(s, best);
    return best;
  };

  return (candidate) => {
    const i = index.get(candidate.team_id);
    const allowance = allowanceOf(candidate.team_id) - 1;
    if (allowance < 0) return null;
    if (i === undefined) return fullWithoutAny === Infinity ? null : fullWithoutAny; // club offers nothing we need
    const lists = groups.get(candidate.team_id)!.map((list) => list.filter((p) => p.id !== candidate.id));
    const prefix = prefixOf(lists, n.map((x) => Math.min(x, allowance)));
    const caps = prefix.map((p) => p.length - 1);
    let best = Infinity;
    for (let a = 0; a <= caps[0]!; a++)
      for (let b = 0; b <= caps[1]! && a + b <= allowance; b++)
        for (let c = 0; c <= caps[2]! && a + b + c <= allowance; c++)
          for (let e = 0; e <= caps[3]! && a + b + c + e <= allowance; e++) {
            const s = full - (a * sp.stride[0] + b * sp.stride[1] + c * sp.stride[2] + e);
            const rest = othersAt(i, s);
            if (rest === Infinity) continue;
            const cost = rest + prefix[0]![a]! + prefix[1]![b]! + prefix[2]![c]! + prefix[3]![e]!;
            if (cost < best) best = cost;
          }
    return best === Infinity ? null : best;
  };
}
