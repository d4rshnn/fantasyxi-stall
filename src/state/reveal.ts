// Loading FantasyXI's team + real results (reveal.json) AFTER the group's team is locked.
//
// SPOILER GUARD, NOT SECURITY: we simply don't fetch reveal.json until the lock is confirmed, so normal
// players can't accidentally see FantasyXI's picks or any points while building. The file is a public
// static asset; anyone who opens the browser's developer tools can still read it. Don't call it secure.

import { teamFromAi, validateTeam, type EngineContext, type ManifestGameweek, type Reveal, type Team } from "../engine";
import { DataLoadError, loadReveal } from "../data/loader";

export type RevealState =
  | { status: "idle" }
  | { status: "loading"; attempt: number }
  | { status: "error"; message: string; attempt: number }
  | { status: "ready"; reveal: Reveal; aiTeam: Team };

export const REVEAL_IDLE: RevealState = { status: "idle" };

/** Checks loaded reveal data before it's shown: right gameweek, and FantasyXI's team obeys the same
 *  rules as everyone else's (engine validateTeam). Returns the AI team or a friendly error. */
export function checkReveal(
  reveal: Reveal,
  ctx: EngineContext,
  gameweek: number,
): { ok: true; aiTeam: Team } | { ok: false; message: string } {
  if (reveal.gameweek !== gameweek) {
    return { ok: false, message: `FantasyXI's data is for gameweek ${reveal.gameweek}, not ${gameweek}.` };
  }
  const aiTeam = teamFromAi(reveal.ai);
  const issues = validateTeam(aiTeam, ctx);
  if (issues.length > 0) {
    return { ok: false, message: `FantasyXI's team data looks wrong (${issues[0]!.message}) Please tell the stall operator.` };
  }
  return { ok: true, aiTeam };
}

/** Fetches + parses + checks reveal.json. Always resolves (never throws) so the caller can't lose state. */
export async function fetchRevealFor(
  gameweek: ManifestGameweek,
  ctx: EngineContext,
): Promise<{ ok: true; reveal: Reveal; aiTeam: Team } | { ok: false; message: string }> {
  try {
    const reveal = await loadReveal(gameweek);
    const checked = checkReveal(reveal, ctx, gameweek.gameweek);
    return checked.ok ? { ok: true, reveal, aiTeam: checked.aiTeam } : checked;
  } catch (err) {
    const detail = err instanceof DataLoadError ? err.message : "Unexpected error.";
    return { ok: false, message: `Couldn't load FantasyXI's team. ${detail}` };
  }
}
