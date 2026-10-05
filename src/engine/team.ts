import { emptyLineup, formationName, zeroCounts } from "./rules";
import type { AiTeam, EngineContext, Lineup, Slot, Team } from "./types";

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

/** A finished team as a Lineup for display: starters in pitch slots of their position (keeping their
 *  order), bench slots in bench order (any positions). Call only with a legal team (validateTeam). */
export function teamToLineup(team: Team, ctx: EngineContext): Lineup {
  const counts = zeroCounts();
  for (const id of team.starting) counts[ctx.players.get(id)!.position]++;
  const formation = formationName(counts);
  const queues = { GK: [] as number[], DEF: [] as number[], MID: [] as number[], FWD: [] as number[] };
  for (const id of team.starting) queues[ctx.players.get(id)!.position].push(id);
  const xi: Slot[] = emptyLineup(formation, ctx.rules)
    .slots.filter((s) => s.kind === "xi")
    .map((s) => ({ ...s, playerId: queues[s.position].shift() ?? null }));
  const bench: Slot[] = team.bench.map((id) => ({ kind: "bench", position: ctx.players.get(id)!.position, playerId: id }));
  return { formation, slots: [...xi, ...bench] };
}

/** The exported AI team as a Team (bench order exactly as exported). */
export function teamFromAi(ai: AiTeam): Team {
  return { starting: [...ai.starting], bench: [...ai.bench], captainId: ai.captain_id, viceCaptainId: ai.vice_captain_id };
}
