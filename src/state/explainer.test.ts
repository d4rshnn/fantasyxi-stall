import { describe, expect, it } from "vitest";
import { realGameweek } from "../engine/testing/fixtures";
import { buildExplainerData, CAPTAIN_WEIGHTS, GENUINE_SOURCE, moveStep } from "./explainer";
import { reducer } from "./machine";
import { lockedApp, readyToLock } from "./testing";

const { ctx, reveal } = realGameweek(37);
const source = new Map(reveal.predictions.map((p) => [p.id, p.source]));

describe("explainer data (GW37)", () => {
  const d = buildExplainerData(reveal, ctx);

  it("predicted-vs-actual examples use ONLY genuine same-season estimates of FantasyXI's starters", () => {
    expect(d.examples.length).toBeGreaterThan(0);
    for (const e of d.examples) {
      expect(source.get(e.id)).toBe(GENUINE_SOURCE);
      expect(reveal.ai.starting).toContain(e.id);
    }
    // None of the five flagged picks ever appears.
    for (const name of ["Kadıoğlu", "Schmidt", "Trafford", "Greenwood", "Bettinelli"]) {
      expect(d.examples.some((e) => e.name.includes(name))).toBe(false);
    }
    expect(d.examples.map((e) => [e.name, e.estimate, e.actual])).toEqual([
      ["Ollie Watkins", 9.1, 15],
      ["Viktor Gyökeres", 9, 1],
      ["Igor Jesus Maciel da Cruz", 8.6, 2],
      ["Matheus Santos Carneiro da Cunha", 8, 9],
    ]);
  });

  it("even if every starter were flagged, no example would be shown", () => {
    const allFlagged = { ...reveal, predictions: reveal.predictions.map((p) => ({ ...p, source: "bilstm_other_season:2024-25" })) };
    const x = buildExplainerData(allFlagged, ctx);
    expect(x.examples).toEqual([]);
    expect(x.captain.estimate).toBeNull();
    expect(x.vice.score).toBeNull();
  });

  it("captain and vice: recomputing estimate x position weight gives FantasyXI's real captain and vice", () => {
    expect(d.captainMathChecks).toBe(true);
    expect(d.captain).toMatchObject({ id: reveal.ai.captain_id, name: "Ollie Watkins", estimate: 9.1, weight: 1.25, score: 11.4 });
    expect(d.vice).toMatchObject({ id: reveal.ai.vice_captain_id, name: "Viktor Gyökeres", estimate: 9, weight: 1.25, score: 11.2 });
    expect(CAPTAIN_WEIGHTS).toEqual({ FWD: 1.25, MID: 1.2, DEF: 0.85, GK: 0.5 });
  });

  it("every other number comes straight from the data", () => {
    expect(d).toMatchObject({
      totalPlayers: 840,
      pool: { GK: 19, DEF: 40, MID: 41, FWD: 28 },
      poolTotal: 128,
      budget: "£100.0m",
      squadCost: "£99.0m",
      formation: "3-4-3",
      maxPerClub: 3,
      aiTotal: 98,
      startingPoints: 83,
      captainBonus: 15,
      activeCaptainName: "Ollie Watkins",
      autoSubCount: 3,
      flaggedPlayers: 261,
      flaggedPicks: 5,
    });
  });
});

describe("explainer flow", () => {
  it("next/back stay within the 5 steps", () => {
    expect(moveStep(0, -1)).toBe(0);
    expect(moveStep(0, 1)).toBe(1);
    expect(moveStep(4, 1)).toBe(4);
    expect(moveStep(3, -1)).toBe(2);
  });

  it("after a refresh the explainer can reload FantasyXI's data only because the team is locked", () => {
    expect(reducer(readyToLock(), { type: "REVEAL_REQUEST" }).reveal.status).toBe("idle"); // not locked: refused
    const s = reducer({ ...lockedApp(), screen: "explainer" }, { type: "REVEAL_REQUEST" });
    expect(s.reveal.status).toBe("loading");
    expect(s.leaderboard.entries).toEqual([]); // loading the explainer never adds a leaderboard entry
  });
});
