// Exact cheapest cost to fill a set of empty squad spots, respecting the max-per-club rule.
//
// Why exact: the budget bar and "can I add this player?" must never let a group paint itself into a
// corner. A simple "cheapest player per position" sum can be wrong when the cheapest players share a
// club. Instead we run a small dynamic programme over clubs: for each club we may take 0..allowance
// players (split across positions), always the cheapest ones of that club and position. The state is
// "how many of each position are filled so far" (at most 3x6x6x4 = 432 states), so it is fast.

import { POSITIONS, type EngineContext, type Player, type Position } from "./types";
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

/** Minimum total price (tenths) to fill `needs`, or null if it can't be done within the club limit. */
export function cheapestFill(ctx: EngineContext, q: FillQuery): number | null {
  const n = POSITIONS.map((p) => q.needs[p]) as [number, number, number, number];
  if (n.every((x) => x === 0)) return 0;
  const max = ctx.rules.max_per_club;

  // Cheapest available players per club and position (byPosition is already price-then-id sorted).
  const clubs = new Map<number, number[][]>(); // club -> per position (index into POSITIONS) prefix sums
  const groups = new Map<number, Player[][]>();
  POSITIONS.forEach((pos, pi) => {
    const need = n[pi]!;
    if (need === 0) return;
    for (const pl of ctx.byPosition[pos]) {
      if (q.taken.has(pl.id) || pl.id === q.exclude) continue;
      const allowance = max - (q.clubCounts.get(pl.team_id) ?? 0);
      let g = groups.get(pl.team_id);
      if (!g) groups.set(pl.team_id, (g = [[], [], [], []]));
      const list = g[pi]!;
      if (list.length < Math.min(need, allowance)) list.push(pl);
    }
  });
  for (const [club, g] of groups) {
    clubs.set(club, g.map((list) => list.reduce<number[]>((acc, pl) => [...acc, (acc.at(-1) ?? 0) + pl.price], [0])));
  }

  // dp over states (filled GK, DEF, MID, FWD) with mixed-radix indexing.
  const radix = n.map((x) => x + 1);
  const size = radix.reduce((a, b) => a * b, 1);
  const digits = (s: number): number[] => {
    const d = [0, 0, 0, 0];
    for (let i = 3; i >= 0; i--) {
      d[i] = s % radix[i]!;
      s = Math.floor(s / radix[i]!);
    }
    return d;
  };
  // Adding k players of position i moves the state index by k * stride[i].
  const stride = [radix[1]! * radix[2]! * radix[3]!, radix[2]! * radix[3]!, radix[3]!, 1] as const;
  const stateDigits = Array.from({ length: size }, (_, s) => digits(s));

  let dp = new Float64Array(size).fill(Infinity);
  dp[0] = 0;
  const clubIds = [...clubs.keys()].sort((a, b) => a - b);
  for (const club of clubIds) {
    const prefix = clubs.get(club)!;
    const allowance = max - (q.clubCounts.get(club) ?? 0);
    const caps = prefix.map((p) => p.length - 1);
    const next = Float64Array.from(dp);
    for (let s = 0; s < size; s++) {
      const base = dp[s]!;
      if (base === Infinity) continue;
      const d = stateDigits[s]!;
      // Try taking k[i] more players of each position from this club.
      for (let a = 0; a <= Math.min(caps[0]!, n[0] - d[0]!); a++)
        for (let b = 0; b <= Math.min(caps[1]!, n[1] - d[1]!) && a + b <= allowance; b++)
          for (let c = 0; c <= Math.min(caps[2]!, n[2] - d[2]!) && a + b + c <= allowance; c++)
            for (let e = 0; e <= Math.min(caps[3]!, n[3] - d[3]!) && a + b + c + e <= allowance; e++) {
              if (a + b + c + e === 0) continue;
              const cost = base + prefix[0]![a]! + prefix[1]![b]! + prefix[2]![c]! + prefix[3]![e]!;
              const t = s + a * stride[0] + b * stride[1] + c * stride[2] + e;
              if (cost < next[t]!) next[t] = cost;
            }
    }
    dp = next;
  }
  const best = dp[size - 1]!;
  return best === Infinity ? null : best;
}

/** Position of a player within its (club, position) "cheapest first" order among available players.
 *  If this rank is at or beyond what cheapestFill could use, excluding the player can't change the result. */
export function rankInClubGroup(ctx: EngineContext, player: Player, taken: ReadonlySet<number>): number {
  let rank = 0;
  for (const pl of ctx.byPosition[player.position as Position]) {
    if (pl.id === player.id) return rank;
    if (pl.team_id === player.team_id && !taken.has(pl.id)) rank++;
  }
  return rank;
}
