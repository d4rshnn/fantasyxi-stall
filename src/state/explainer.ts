// Picks the real numbers the "How did FantasyXI build its team?" explainer shows.
//
// Honesty rules (see CLAUDE.md "Verified AI facts" and docs/DATA_SOURCE.md):
//  - estimates are FantasyXI's final blended "predicted points" from reveal.json;
//  - only players whose estimate `source` is exactly "bilstm" (a genuine same-season estimate) are ever
//    shown with an estimate; players flagged "bilstm_other_season:..." (the wrong-player flaw) never are;
//  - the captain/vice numbers are shown only if recomputing "estimate x position weight" really gives
//    FantasyXI's exported captain and vice.

import { formatPrice, type EngineContext, type Position, type Reveal } from "../engine";

/** FantasyXI's captain weights (verified in the pipeline code; CLAUDE.md "Captain"). Display only. */
export const CAPTAIN_WEIGHTS: Record<Position, number> = { FWD: 1.25, MID: 1.2, DEF: 0.85, GK: 0.5 };

export const GENUINE_SOURCE = "bilstm";

export interface CaptainLine {
  id: number;
  name: string;
  position: Position;
  /** null when this player's estimate isn't a genuine one (then no numbers are shown). */
  estimate: number | null;
  weight: number;
  score: number | null;
}

export interface EstimateExample {
  id: number;
  name: string;
  club: string;
  estimate: number;
  actual: number;
}

export interface ExplainerData {
  gameweek: number;
  totalPlayers: number;
  pool: Record<Position, number>;
  poolTotal: number;
  budget: string;
  squadPositions: Record<Position, number>;
  maxPerClub: number;
  squadCost: string;
  formation: string;
  /** Shown only when the recomputed ranking matches the exported captain/vice. */
  captain: CaptainLine;
  vice: CaptainLine;
  captainMathChecks: boolean;
  examples: EstimateExample[];
  aiTotal: number;
  startingPoints: number;
  captainBonus: number;
  activeCaptainName: string;
  autoSubCount: number;
  /** Players this gameweek whose estimate came from the wrong-player flaw. */
  flaggedPlayers: number;
  /** FantasyXI's own 15 picks whose estimate came from that flaw. */
  flaggedPicks: number;
}

const round1 = (x: number) => Math.round(x * 10) / 10;

export function buildExplainerData(reveal: Reveal, ctx: EngineContext, maxExamples = 4): ExplainerData {
  const pred = new Map(reveal.predictions.map((p) => [p.id, p]));
  const actual = new Map(reveal.results.map((r) => [r.id, r.points]));
  const player = (id: number) => ctx.players.get(id)!;
  const genuine = (id: number) => pred.get(id)?.source === GENUINE_SOURCE;
  const ai = reveal.ai;

  // Captain maths: estimate x position weight among starters (exactly the pipeline's rule).
  const captainScore = (id: number) => (pred.get(id)?.predicted_points ?? 0) * CAPTAIN_WEIGHTS[player(id).position];
  const ranked = [...ai.starting].sort((a, b) => captainScore(b) - captainScore(a));
  const captainMathChecks = ranked[0] === ai.captain_id && ranked[1] === ai.vice_captain_id;
  const line = (id: number): CaptainLine => {
    const ok = genuine(id) && captainMathChecks;
    const est = pred.get(id)?.predicted_points ?? 0;
    const w = CAPTAIN_WEIGHTS[player(id).position];
    return { id, name: player(id).name, position: player(id).position, estimate: ok ? round1(est) : null, weight: w, score: ok ? round1(est * w) : null };
  };

  const examples = ai.starting
    .filter(genuine)
    .map((id) => ({ id, est: pred.get(id)!.predicted_points }))
    .sort((a, b) => b.est - a.est || a.id - b.id)
    .slice(0, maxExamples)
    .map(({ id, est }) => ({
      id,
      name: player(id).name,
      club: ctx.teams.get(player(id).team_id)?.short_name ?? "",
      estimate: round1(est),
      actual: actual.get(id) ?? 0,
    }));

  const pool = ai.pipeline.candidate_pool_size;
  const isFlagged = (source: string) => source.startsWith("bilstm_other_season");
  return {
    gameweek: reveal.gameweek,
    totalPlayers: ctx.players.size,
    pool,
    poolTotal: pool.GK + pool.DEF + pool.MID + pool.FWD,
    budget: formatPrice(ctx.rules.budget),
    squadPositions: ctx.rules.squad_positions,
    maxPerClub: ctx.rules.max_per_club,
    squadCost: formatPrice(ai.squad_cost),
    formation: ai.formation,
    captain: line(ai.captain_id),
    vice: line(ai.vice_captain_id),
    captainMathChecks,
    examples,
    aiTotal: ai.total_points,
    startingPoints: ai.breakdown.starting_points,
    captainBonus: ai.breakdown.captain_bonus,
    activeCaptainName: player(ai.breakdown.active_captain_id).name,
    autoSubCount: ai.breakdown.auto_subs.length,
    flaggedPlayers: reveal.predictions.filter((p) => isFlagged(p.source)).length,
    flaggedPicks: ai.squad.filter((id) => isFlagged(pred.get(id)?.source ?? "")).length,
  };
}

export const EXPLAINER_STEPS = 5;

/** Next/back with bounds: steps 0..4. */
export function moveStep(step: number, dir: 1 | -1): number {
  return Math.max(0, Math.min(EXPLAINER_STEPS - 1, step + dir));
}
