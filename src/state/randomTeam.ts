// "Random team" and "Random captain" helpers. Randomness here ONLY helps the user pick; it never
// affects scoring, the replay or the AI. Players are chosen uniformly among those the engine allows
// (checkCandidates), so budget, the bench reserve, position limits and the club limit always hold.
// Uses no points, form, minutes, predictions or reveal data.

import { checkCandidates, type EngineContext, type Lineup } from "../engine";
import { availableIds, randomIdeas, type Rng } from "./market";

/** Small seedable generator (mulberry32): same seed, same sequence. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A fresh seed for one button press (the reducer itself stays deterministic). */
export const newSeed = () => Math.floor(Math.random() * 2 ** 32);

/** Fills every EMPTY starting-XI slot, one at a time in random order, each with a random player the
 *  engine allows right then. Placed players stay. Returns null only if some slot has no allowed
 *  player (can't happen when the lineup is still completable, because every allowed pick keeps a
 *  legal fill of all other empty slots, bench included). */
export function randomFillXI(lineup: Lineup, ctx: EngineContext, rng: Rng): Lineup | null {
  const empty = lineup.slots.flatMap((s, i) => (s.kind === "xi" && s.playerId === null ? [i] : []));
  const order = randomIdeas(empty, empty.length, rng);
  let next = lineup;
  for (const i of order) {
    const ids = availableIds(checkCandidates(next, i, ctx), null);
    const id = randomIdeas(ids, 1, rng)[0];
    if (id === undefined) return null;
    next = { ...next, slots: next.slots.map((s, k) => (k === i ? { ...s, playerId: id } : s)) };
  }
  return next;
}

/** Two different random starters: [captain, vice], or null if fewer than two starters. */
export function randomCaptainVice(lineup: Lineup, rng: Rng): [number, number] | null {
  const starters = lineup.slots.flatMap((s) => (s.kind === "xi" && s.playerId !== null ? [s.playerId] : []));
  const [c, v] = randomIdeas(starters, 2, rng);
  return c !== undefined && v !== undefined ? [c, v] : null;
}
