// Everything about the rules comes from pregame.json "rules" (passed in as `rules`).
// The only constants here are UI choices (the formation menu) and display names.

import { POSITIONS, type EngineContext, type Lineup, type Position, type Pregame, type Rules, type Slot } from "./types";

/** Formations offered in the formation picker (GAME_DESIGN.md). Each must satisfy rules.xi_limits. */
export const FORMATIONS = ["4-4-2", "4-3-3", "3-5-2", "3-4-3", "5-3-2", "4-5-1", "5-4-1"] as const;

export const POSITION_NAMES: Record<Position, { one: string; many: string }> = {
  GK: { one: "goalkeeper", many: "goalkeepers" },
  DEF: { one: "defender", many: "defenders" },
  MID: { one: "midfielder", many: "midfielders" },
  FWD: { one: "forward", many: "forwards" },
};

export type PositionCounts = Record<Position, number>;

export const zeroCounts = (): PositionCounts => ({ GK: 0, DEF: 0, MID: 0, FWD: 0 });

/** "£10.0m" from tenths of a million. */
export function formatPrice(tenths: number): string {
  return `£${(tenths / 10).toFixed(1)}m`;
}

/** Position counts of a starting XI, e.g. "3-4-3" -> GK 1, DEF 3, MID 4, FWD 3.
 *  The goalkeeper count is whatever is left of rules.xi_size. Returns null if not "d-m-f". */
export function formationCounts(formation: string, rules: Rules): PositionCounts | null {
  const m = /^(\d)-(\d)-(\d)$/.exec(formation);
  if (!m) return null;
  const [def, mid, fwd] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return { GK: rules.xi_size - def - mid - fwd, DEF: def, MID: mid, FWD: fwd };
}

export function formationName(counts: PositionCounts): string {
  return `${counts.DEF}-${counts.MID}-${counts.FWD}`;
}

/** True if these starter counts respect rules.xi_size and every rules.xi_limits range. */
export function isValidXICounts(counts: PositionCounts, rules: Rules): boolean {
  const total = POSITIONS.reduce((s, p) => s + counts[p], 0);
  return total === rules.xi_size && POSITIONS.every((p) => counts[p] >= rules.xi_limits[p][0] && counts[p] <= rules.xi_limits[p][1]);
}

export function isValidFormation(formation: string, rules: Rules): boolean {
  const counts = formationCounts(formation, rules);
  return counts !== null && isValidXICounts(counts, rules) && POSITIONS.every((p) => counts[p] <= rules.squad_positions[p]);
}

/** Bench positions implied by a formation (squad counts minus XI counts), GK first then DEF/MID/FWD. */
export function benchPositions(formation: string, rules: Rules): Position[] {
  const counts = formationCounts(formation, rules);
  if (!counts || !isValidFormation(formation, rules)) throw new Error(`Invalid formation ${formation}`);
  return POSITIONS.flatMap((p) => Array<Position>(rules.squad_positions[p] - counts[p]).fill(p));
}

/** An empty lineup: XI slots in pitch order (GK, DEF, MID, FWD), then the bench slots. */
export function emptyLineup(formation: string, rules: Rules): Lineup {
  const counts = formationCounts(formation, rules);
  if (!counts || !isValidFormation(formation, rules)) throw new Error(`Invalid formation ${formation}`);
  const xi: Slot[] = POSITIONS.flatMap((p) => Array.from({ length: counts[p] }, () => ({ kind: "xi" as const, position: p, playerId: null })));
  const bench: Slot[] = benchPositions(formation, rules).map((p) => ({ kind: "bench", position: p, playerId: null }));
  return { formation, slots: [...xi, ...bench] };
}

/** Builds the lookup tables every engine function uses. Call once per loaded pregame.json. */
export function makeContext(pregame: Pregame): EngineContext {
  const byPosition = { GK: [], DEF: [], MID: [], FWD: [] } as Record<Position, typeof pregame.players>;
  const sorted = [...pregame.players].sort((a, b) => a.price - b.price || a.id - b.id);
  for (const p of sorted) byPosition[p.position].push(p);
  return {
    rules: pregame.rules,
    players: new Map(pregame.players.map((p) => [p.id, p])),
    teams: new Map(pregame.teams.map((t) => [t.id, t])),
    byPosition,
  };
}

/** Club display name for messages; falls back to "one club". */
export function clubName(ctx: EngineContext, teamId: number): string {
  return ctx.teams.get(teamId)?.name ?? "one club";
}
