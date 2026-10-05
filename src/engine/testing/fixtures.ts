// Test helpers only (never imported by the app).
import gw37Pregame from "../../../public/data/gw37/pregame.json";
import gw37Reveal from "../../../public/data/gw37/reveal.json";
import gw38Pregame from "../../../public/data/gw38/pregame.json";
import gw38Reveal from "../../../public/data/gw38/reveal.json";
import manifestJson from "../../../public/data/manifest.json";
import { parseManifest, parsePregame, parseReveal } from "../parse";
import { emptyLineup, FORMATIONS, makeContext } from "../rules";
import { slotChecker } from "../validate";
import type { EngineContext, Lineup, Player, Position, Pregame } from "../types";

export const rawData = { manifestJson, gw37Pregame, gw37Reveal, gw38Pregame, gw38Reveal };

export function realGameweek(gw: 37 | 38) {
  const pregame = parsePregame(gw === 37 ? gw37Pregame : gw38Pregame);
  const reveal = parseReveal(gw === 37 ? gw37Reveal : gw38Reveal);
  return { pregame, reveal, ctx: makeContext(pregame) };
}

export const manifest = () => parseManifest(manifestJson);

/** Deterministic pseudo-random numbers in [0, 1) (mulberry32). Same seed -> same sequence. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pick = <T>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;

/** Fisher-Yates shuffle driven by `r` (deterministic for a given seed). */
export function shuffle<T>(r: () => number, xs: readonly T[]): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** A small made-up league using the REAL rules from gw37 (so no rule is hardcoded in tests).
 *  spec: [id, position, club, price] */
export function syntheticContext(spec: [number, Position, number, number][]): EngineContext {
  const real = parsePregame(gw37Pregame);
  const pregame: Pregame = {
    ...real,
    teams: Array.from({ length: 20 }, (_, i) => ({ id: i + 1, name: `Club ${i + 1}`, short_name: `C${i + 1}` })),
    players: spec.map(([id, position, team_id, price]): Player => ({
      id,
      name: `Player ${id}`,
      position,
      team_id,
      price,
      fixture_id: 1,
      opponent_team_id: team_id === 1 ? 2 : 1,
      home: true,
    })),
  };
  return makeContext(pregame);
}

/** A random lineup where every pick went through the legality/budget check (so it is always
 *  completable). `fillShare` is the chance each slot gets filled; expensive players are favoured
 *  half of the time to stress the budget. */
export function randomLegalPartialLineup(ctx: EngineContext, r: () => number, fillShare: number): Lineup {
  const lineup = emptyLineup(pick(r, FORMATIONS), ctx.rules);
  const order = shuffle(r, lineup.slots.map((_, i) => i));
  for (const i of order) {
    if (r() > fillShare) continue;
    const check = slotChecker(lineup, i, ctx);
    const pool = ctx.byPosition[lineup.slots[i]!.position];
    const candidates = r() < 0.5 ? [...pool].reverse().slice(0, 40) : shuffle(r, pool);
    const chosen = candidates.find((p) => check(p.id).ok);
    if (chosen) lineup.slots[i]!.playerId = chosen.id;
  }
  return lineup;
}
