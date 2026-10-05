// The ONE scoring engine, used for both teams. It only sees a Team and real results; it has no idea
// whose team it is. It mirrors FantasyXI's Python score_outcome() (no chips, no hits):
//   1. Active captain = captain, unless the captain played 0 minutes and the vice played > 0.
//   2. Auto-subs: each starter (in XI order) with 0 minutes is replaced by the first unused bench player
//      (in bench order) with > 0 minutes. Formation is NOT re-checked (a GK can be replaced by an
//      outfielder), exactly like the Python. If nobody on the bench played, the starter stays (0 pts).
//   3. Total = points of the 11 active players + the active captain's points once more.
// A player missing from the results counts as 0 minutes, 0 points (same as the Python default).

import type { PlayerResult, Team } from "./types";

export type ResultLookup = ReadonlyMap<number, Pick<PlayerResult, "points" | "minutes">>;

export function resultsById(results: readonly PlayerResult[]): Map<number, PlayerResult> {
  return new Map(results.map((r) => [r.id, r]));
}

export interface ScoredPlayer {
  id: number;
  role: "starter" | "bench";
  /** 0-based position in the bench order (null for starters). */
  benchOrder: number | null;
  points: number;
  minutes: number;
  played: boolean;
  /** Counted among the 11 active players (a starter who wasn't subbed off, or a bench player who came on). */
  counted: boolean;
  subbedOut: boolean;
  subbedIn: boolean;
  /** For a starter subbed off: who came on. For a bench player who came on: who they replaced. */
  replacedBy: number | null;
  replaces: number | null;
  isCaptain: boolean;
  isViceCaptain: boolean;
  /** True for the player whose points were doubled (captain, or vice if the captain didn't play). */
  isActiveCaptain: boolean;
  /** Extra points from the captaincy (the active captain's points once more), else 0. */
  captainBonus: number;
  /** What this player added to the total: (counted ? points : 0) + captainBonus. */
  contribution: number;
}

export interface ScoreResult {
  total: number;
  startingPoints: number;
  captainBonus: number;
  activeCaptainId: number | null;
  autoSubs: { out: number; in: number }[];
  /** Starters in XI order, then bench in bench order. */
  players: ScoredPlayer[];
}

export function scoreTeam(team: Team, results: ResultLookup): ScoreResult {
  const minutes = (id: number) => results.get(id)?.minutes ?? 0;
  const points = (id: number) => results.get(id)?.points ?? 0;

  // 1. Active captain.
  let activeCaptain = team.captainId;
  if (team.captainId !== null && minutes(team.captainId) === 0) {
    if (team.viceCaptainId !== null && minutes(team.viceCaptainId) > 0) activeCaptain = team.viceCaptainId;
  }

  // 2. Auto-subs.
  const available = [...team.bench];
  const active: number[] = [];
  const autoSubs: { out: number; in: number }[] = [];
  for (const id of team.starting) {
    if (minutes(id) > 0) {
      active.push(id);
      continue;
    }
    const k = available.findIndex((b) => minutes(b) > 0);
    if (k === -1) {
      active.push(id);
      continue;
    }
    const sub = available.splice(k, 1)[0]!;
    active.push(sub);
    autoSubs.push({ out: id, in: sub });
  }

  // 3. Totals.
  const startingPoints = active.reduce((s, id) => s + points(id), 0);
  const captainBonus = activeCaptain === null ? 0 : points(activeCaptain);
  const counted = new Set(active);
  const outBy = new Map(autoSubs.map((s) => [s.out, s.in]));
  const inFor = new Map(autoSubs.map((s) => [s.in, s.out]));

  const describe = (id: number, role: "starter" | "bench", benchOrder: number | null): ScoredPlayer => {
    const isActiveCaptain = id === activeCaptain;
    const bonus = isActiveCaptain ? captainBonus : 0;
    const isCounted = counted.has(id);
    return {
      id,
      role,
      benchOrder,
      points: points(id),
      minutes: minutes(id),
      played: minutes(id) > 0,
      counted: isCounted,
      subbedOut: outBy.has(id),
      subbedIn: inFor.has(id),
      replacedBy: outBy.get(id) ?? null,
      replaces: inFor.get(id) ?? null,
      isCaptain: id === team.captainId,
      isViceCaptain: id === team.viceCaptainId,
      isActiveCaptain,
      captainBonus: bonus,
      contribution: (isCounted ? points(id) : 0) + bonus,
    };
  };

  return {
    total: startingPoints + captainBonus,
    startingPoints,
    captainBonus,
    activeCaptainId: activeCaptain,
    autoSubs,
    players: [
      ...team.starting.map((id) => describe(id, "starter", null)),
      ...team.bench.map((id, i) => describe(id, "bench", i)),
    ],
  };
}
