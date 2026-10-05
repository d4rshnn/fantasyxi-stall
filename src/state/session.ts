// Restoring a LOCKED team after an accidental page refresh (same browser tab only: sessionStorage).
// Before the lock nothing is saved, so a refresh simply starts cleanly. Cleared on "Play again".
// Every read/write is guarded: if storage is blocked, the app just doesn't restore.

import { isValidFormation, lineupToTeam, validateTeam, type EngineContext, type Lineup } from "../engine";
import { newBuild, type BuildState } from "./build";

const KEY = "fantasyxi-stall:locked-team";

export interface SavedSession {
  v: 1;
  dataVersion: string;
  gameweek: number;
  teamName: string;
  lineup: Lineup;
  captainId: number;
  viceCaptainId: number;
}

export function readSession(): unknown {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeSession(s: SavedSession): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Storage unavailable: a refresh will just start a new game.
  }
}

export function clearSession(): void {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

/** Rebuilds a locked BuildState from saved data, or null if it's missing, for other data, or not a
 *  legal team any more (checked with the engine, like any other team). */
export function restoreLocked(
  saved: unknown,
  ctx: EngineContext,
  dataVersion: string,
  gameweek: number,
): { build: BuildState; teamName: string } | null {
  if (typeof saved !== "object" || saved === null) return null;
  const s = saved as Partial<SavedSession>;
  if (s.v !== 1 || s.dataVersion !== dataVersion || s.gameweek !== gameweek) return null;
  if (typeof s.teamName !== "string" || !s.teamName.trim()) return null;
  const lineup = s.lineup;
  if (!lineup || typeof lineup.formation !== "string" || !Array.isArray(lineup.slots) || !isValidFormation(lineup.formation, ctx.rules)) return null;
  // Every saved slot must hold a real player of the slot's position.
  for (const slot of lineup.slots) {
    const pl = typeof slot?.playerId === "number" ? ctx.players.get(slot.playerId) : undefined;
    if (!pl || pl.position !== slot.position || (slot.kind !== "xi" && slot.kind !== "bench")) return null;
  }
  const captainId = typeof s.captainId === "number" ? s.captainId : null;
  const viceCaptainId = typeof s.viceCaptainId === "number" ? s.viceCaptainId : null;
  const team = lineupToTeam(lineup, captainId, viceCaptainId);
  if (!team || validateTeam(team, ctx).length > 0) return null;
  const fresh = newBuild(ctx);
  return {
    teamName: s.teamName.trim(),
    build: { ...fresh, lineup, captainId, viceCaptainId, lockedTeam: team },
  };
}
