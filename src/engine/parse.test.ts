import { describe, expect, it } from "vitest";
import { DataShapeError, parseManifest, parsePregame, parseReveal } from "./parse";
import { rawData } from "./testing/fixtures";

const clone = <T>(x: T): T => structuredClone(x);

describe("parsing the real exported files", () => {
  it("manifest, GW37 and GW38 parse", () => {
    const m = parseManifest(rawData.manifestJson);
    expect(m.default_gameweek).toBe(37);
    expect(m.gameweeks.map((g) => [g.gameweek, g.ai_target_score])).toEqual([[37, 98], [38, 63]]);
    for (const [pre, rev] of [[rawData.gw37Pregame, rawData.gw37Reveal], [rawData.gw38Pregame, rawData.gw38Reveal]] as const) {
      const p = parsePregame(pre);
      const r = parseReveal(rev);
      expect(p.players.length).toBeGreaterThan(800);
      expect(p.teams).toHaveLength(20);
      expect(r.results.length).toBe(p.players.length);
      expect(r.ai.starting).toHaveLength(p.rules.xi_size);
    }
  });

  it("keeps accented names intact", () => {
    const names = parsePregame(rawData.gw37Pregame).players.map((p) => p.name);
    expect(names).toContain("Viktor Gyökeres");
    expect(names).toContain("Martin Ødegaard");
    expect(names).toContain("Ferdi Kadıoğlu");
  });
});

describe("clear errors for broken data", () => {
  it("names the file and field", () => {
    const bad = clone(rawData.gw37Pregame) as { players: Record<string, unknown>[] };
    delete bad.players[3]!.price;
    expect(() => parsePregame(bad)).toThrow(new DataShapeError("pregame.json: players[3].price should be a whole number (got nothing)."));

    const bad2 = clone(rawData.gw37Pregame) as { players: Record<string, unknown>[] };
    bad2.players[0]!.position = "STRIKER";
    expect(() => parsePregame(bad2)).toThrow(/players\[0\]\.position should be one of GK\/DEF\/MID\/FWD/);
  });

  it("rejects an unknown schema version, duplicate ids and unknown clubs", () => {
    expect(() => parseManifest({ ...clone(rawData.manifestJson), schema_version: 2 })).toThrow(/unsupported schema_version 2/);

    const dup = clone(rawData.gw37Pregame) as { players: { id: number }[] };
    dup.players[1]!.id = dup.players[0]!.id;
    expect(() => parsePregame(dup)).toThrow(/appears more than once/);

    const club = clone(rawData.gw37Pregame) as { players: { team_id: number }[] };
    club.players[0]!.team_id = 99;
    expect(() => parsePregame(club)).toThrow(/unknown team 99/);
  });

  it("reveal.json without an AI team, and non-JSON-object input", () => {
    const noAi = clone(rawData.gw37Reveal) as Record<string, unknown>;
    delete noAi.ai;
    expect(() => parseReveal(noAi)).toThrow("reveal.json: ai should be an object (got nothing).");
    expect(() => parsePregame(null)).toThrow(DataShapeError);
    expect(() => parsePregame([])).toThrow(/should be an object/);
  });
});
