import { describe, expect, it } from "vitest";
import { budgetStatus, checkCandidates, FORMATIONS } from "../engine";
import { realGameweek, rng } from "../engine/testing/fixtures";
import { buildReducer, finishedTeam, newBuild, type BuildAction, type BuildState } from "./build";
import { availableIds } from "./market";
import { randomCaptainVice, randomFillXI, seededRng } from "./randomTeam";

const { ctx } = realGameweek(37);
const run = (s: BuildState, ...actions: BuildAction[]) => actions.reduce((acc, a) => buildReducer(acc, a, ctx), s);

/** A build in `formation` with about `share` of all spots (XI and bench) pre-filled by legal random picks. */
function partial(formation: string, share: number, seed: number): BuildState {
  const r = rng(seed);
  let s = run(newBuild(ctx), { type: "SET_FORMATION", formation });
  s.lineup.slots.forEach((_, i) => {
    if (r() >= share) return;
    const ids = availableIds(checkCandidates(s.lineup, i, ctx), null);
    if (ids.length) s = run(s, { type: "PLACE_PLAYER", slotIndex: i, playerId: ids[Math.floor(r() * ids.length)]! });
  });
  return { ...s, undo: [] };
}

describe("Random team (RANDOM_XI)", () => {
  it("always gives a complete, legal XI that keeps the bench reserve, in every formation", () => {
    let seed = 1;
    for (const formation of FORMATIONS) {
      for (const share of [0, 0.3, 0.7]) {
        for (let t = 0; t < 6; t++, seed++) {
          const before = partial(formation, share, seed);
          const after = run(before, { type: "RANDOM_XI", seed });
          expect(after.message, `${formation} seed ${seed}`).toBeNull();
          expect(after.lineup.formation).toBe(formation);
          after.lineup.slots.forEach((slot, i) => {
            const was = before.lineup.slots[i]!.playerId;
            if (slot.kind === "xi") expect(slot.playerId).not.toBeNull();
            if (was !== null || slot.kind === "bench") expect(slot.playerId).toBe(was); // placed players and bench untouched
          });
          const b = budgetStatus(after.lineup, ctx);
          expect(b.freeToSpend).not.toBeNull();
          expect(b.freeToSpend!).toBeGreaterThanOrEqual(0);
          // The rest of the game still works: bench auto-fill + random captain -> a lockable team.
          const done = run(after, { type: "AUTO_FILL_BENCH" }, { type: "RANDOM_CAPTAIN", seed });
          const { team, problem } = finishedTeam(done, ctx);
          expect(problem).toBeNull();
          expect(team).not.toBeNull();
        }
      }
    }
  });

  it("is one Undo step, repeatable with the same seed, and does nothing on a full XI", () => {
    const before = partial("3-5-2", 0.4, 77);
    const after = run(before, { type: "RANDOM_XI", seed: 123 });
    expect(after.undo).toHaveLength(before.undo.length + 1);
    const undone = run(after, { type: "UNDO" });
    expect(undone.lineup).toEqual(before.lineup);
    expect(undone.undo).toEqual(before.undo);
    expect(run(before, { type: "RANDOM_XI", seed: 123 }).lineup).toEqual(after.lineup);
    expect(randomFillXI(before.lineup, ctx, seededRng(5))).toEqual(randomFillXI(before.lineup, ctx, seededRng(5)));
    expect(run(after, { type: "RANDOM_XI", seed: 9 })).toBe(after);
  });

  it("varies between seeds", () => {
    const empty = newBuild(ctx);
    const teams = new Set([1, 2, 3, 4, 5].map((seed) => JSON.stringify(run(empty, { type: "RANDOM_XI", seed }).lineup)));
    expect(teams.size).toBeGreaterThan(1);
  });
});

describe("Random captain (RANDOM_CAPTAIN)", () => {
  it("picks two different starters, with one Undo step", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const s = run(newBuild(ctx), { type: "RANDOM_XI", seed }, { type: "AUTO_FILL_BENCH" });
      const after = run(s, { type: "RANDOM_CAPTAIN", seed });
      const starters = new Set(after.lineup.slots.filter((x) => x.kind === "xi").map((x) => x.playerId));
      expect(after.captainId).not.toBeNull();
      expect(after.viceCaptainId).not.toBeNull();
      expect(after.captainId).not.toBe(after.viceCaptainId);
      expect(starters.has(after.captainId)).toBe(true);
      expect(starters.has(after.viceCaptainId)).toBe(true);
      const undone = run(after, { type: "UNDO" });
      expect([undone.captainId, undone.viceCaptainId]).toEqual([s.captainId, s.viceCaptainId]);
      expect(run(s, { type: "RANDOM_CAPTAIN", seed }).captainId).toBe(after.captainId);
    }
  });

  it("refuses with fewer than two starters", () => {
    expect(randomCaptainVice(newBuild(ctx).lineup, seededRng(1))).toBeNull();
    expect(run(newBuild(ctx), { type: "RANDOM_CAPTAIN", seed: 1 }).message).toBe("Pick at least two starters first.");
  });
});
