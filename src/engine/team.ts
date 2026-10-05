import type { AiTeam, Lineup, Team } from "./types";

/** All 15 players of a team: starters then bench. */
export function squadOf(team: Team): number[] {
  return [...team.starting, ...team.bench];
}

/** Converts a finished lineup into a Team (XI in slot order, bench in bench order). Null if any slot is empty. */
export function lineupToTeam(lineup: Lineup, captainId: number | null, viceCaptainId: number | null): Team | null {
  if (lineup.slots.some((s) => s.playerId === null)) return null;
  const ids = (kind: "xi" | "bench") => lineup.slots.filter((s) => s.kind === kind).map((s) => s.playerId as number);
  return { starting: ids("xi"), bench: ids("bench"), captainId, viceCaptainId };
}

/** The exported AI team as a Team (bench order exactly as exported). */
export function teamFromAi(ai: AiTeam): Team {
  return { starting: [...ai.starting], bench: [...ai.bench], captainId: ai.captain_id, viceCaptainId: ai.vice_captain_id };
}
