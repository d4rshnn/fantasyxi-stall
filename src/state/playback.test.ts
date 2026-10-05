import { describe, expect, it } from "vitest";
import { buildReplay, resultsById, scoreTeam, teamFromAi } from "../engine";
import { realGameweek } from "../engine/testing/fixtures";
import { stepDelay, viewAt } from "./playback";

const { ctx, reveal } = realGameweek(37);
const results = resultsById(reveal.results);
const ai = teamFromAi(reveal.ai);
const replay = buildReplay({ ctx, fixtures: reveal.fixtures, results, human: { team: ai, score: scoreTeam(ai, results) }, ai: { team: ai, score: scoreTeam(ai, results) } });

describe("playback view", () => {
  it("starts at 0-0 with every fixture waiting except the first", () => {
    const v = viewAt(replay, 0);
    expect(v.score).toEqual({ human: 0, ai: 0 });
    expect(v.fixtureStatus.filter((f) => f === "playing")).toHaveLength(1);
    expect(v.finished).toBe(false);
  });

  it("skipping to the end shows the same totals as the engine, all fixtures finished, subs and captain applied", () => {
    const v = viewAt(replay, Number.MAX_SAFE_INTEGER);
    expect(v.finished).toBe(true);
    expect(v.score).toEqual({ human: 98, ai: 98 });
    expect(v.fixtureStatus.every((f) => f === "finished")).toBe(true);
    for (const sub of reveal.ai.breakdown.auto_subs) {
      expect(v.players.ai.get(sub.out)!.subbedOutBy).toBe(sub.in);
      expect(v.players.ai.get(sub.in)!.cameOnFor).toBe(sub.out);
    }
    expect(v.players.ai.get(reveal.ai.captain_id)!.doubled).toBe(true);
  });

  it("speed divides the wait", () => {
    expect(stepDelay(replay, 3, 4)).toBe(Math.round(replay.steps[3]!.durationMs / 4));
  });
});
