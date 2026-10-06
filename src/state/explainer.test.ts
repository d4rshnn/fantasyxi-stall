import { describe, expect, it } from "vitest";
import { realGameweek } from "../engine/testing/fixtures";
import { buildExplainerData } from "./explainer";
import { reducer } from "./machine";
import { lockedApp, readyToLock } from "./testing";

const { ctx, reveal } = realGameweek(37);

describe("explainer data (GW37)", () => {
  it("every number comes straight from the data", () => {
    expect(buildExplainerData(reveal, ctx)).toEqual({
      formation: "3-4-3",
      captainName: "Ollie Watkins",
      aiTotal: 98,
      totalPlayers: 840,
      flaggedPlayers: 261,
      flaggedPicks: 5,
    });
  });

  it("the flaw counts follow the prediction sources", () => {
    const none = { ...reveal, predictions: reveal.predictions.map((p) => ({ ...p, source: "bilstm" })) };
    expect(buildExplainerData(none, ctx)).toMatchObject({ flaggedPlayers: 0, flaggedPicks: 0 });
  });
});

describe("explainer flow", () => {
  it("after a refresh the explainer can reload FantasyXI's data only because the team is locked", () => {
    expect(reducer(readyToLock(), { type: "REVEAL_REQUEST" }).reveal.status).toBe("idle"); // not locked: refused
    const s = reducer({ ...lockedApp(), screen: "explainer" }, { type: "REVEAL_REQUEST" });
    expect(s.reveal.status).toBe("loading");
    expect(s.leaderboard.entries).toEqual([]); // loading the explainer never adds a leaderboard entry
  });
});
