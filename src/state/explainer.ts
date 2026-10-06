// The few real numbers the one-page "How FantasyXI works" screen shows.
//
// Honesty rules (see CLAUDE.md "Verified AI facts" and docs/DATA_SOURCE.md): every number comes
// straight from reveal.json / pregame data. No predicted points are shown on the main page.

import type { EngineContext, Reveal } from "../engine";

export interface ExplainerData {
  formation: string;
  captainName: string;
  aiTotal: number;
  totalPlayers: number;
  /** Players this gameweek whose estimate came from the wrong-player flaw. */
  flaggedPlayers: number;
  /** FantasyXI's own 15 picks whose estimate came from that flaw. */
  flaggedPicks: number;
}

const isFlagged = (source: string) => source.startsWith("bilstm_other_season");

export function buildExplainerData(reveal: Reveal, ctx: EngineContext): ExplainerData {
  const source = new Map(reveal.predictions.map((p) => [p.id, p.source]));
  const ai = reveal.ai;
  return {
    formation: ai.formation,
    captainName: ctx.players.get(ai.captain_id)!.name,
    aiTotal: ai.total_points,
    totalPlayers: ctx.players.size,
    flaggedPlayers: reveal.predictions.filter((p) => isFlagged(p.source)).length,
    flaggedPicks: ai.squad.filter((id) => isFlagged(source.get(id) ?? "")).length,
  };
}
