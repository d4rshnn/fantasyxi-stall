import { describe, expect, it } from "vitest";
import { resultsById, scoreTeam, teamFromAi } from "../engine";
import { manifest } from "../engine/testing/fixtures";
import { OPERATOR_PIN } from "../config";
import { idlePhase, pinMatches } from "./idle";
import {
  addEntryOnce,
  boardKey,
  csvCell,
  loadBoard,
  makeEntry,
  markerPosition,
  mergeEntries,
  parseBoardFile,
  rankEntries,
  saveBoard,
  serializeBoard,
  toCsv,
  verifyEntries,
  visibleRows,
  type KeyValueStore,
  type LeaderboardEntry,
} from "./leaderboard";
import { reducer, type AppState } from "./machine";
import { checkReveal } from "./reveal";
import { aiBuild, ctx, loadedApp, lockedApp, pregame, reveal } from "./testing";

const meta = { gameweek: 37, dataVersion: manifest().data_version };
const aiTeam = teamFromAi(reveal.ai);
const team = { starting: aiTeam.starting, bench: aiTeam.bench, captainId: aiTeam.captainId!, viceCaptainId: aiTeam.viceCaptainId! };
const entry = (id: string, score: number, createdAt: number, teamName = `Team ${id}`): LeaderboardEntry =>
  makeEntry({ id, teamName, score, aiScore: 98, createdAt, team, ...meta });

describe("ranking", () => {
  it("higher score first; equal scores: earlier finish first", () => {
    const r = rankEntries([entry("a", 80, 3), entry("b", 99, 5), entry("c", 80, 1), entry("d", 98, 2)]);
    expect(r.map((x) => [x.rank, x.entry.id])).toEqual([[1, "b"], [2, "d"], [3, "c"], [4, "a"]]);
  });

  it("beatAI is strictly greater; the FantasyXI marker goes below winners and above ties", () => {
    const r = rankEntries([entry("win", 99, 1), entry("tie", 98, 2), entry("loss", 50, 3)]);
    expect(r.map((x) => x.entry.beatAI)).toEqual([true, false, false]);
    expect(markerPosition(r, 98)).toBe(1);
    expect(markerPosition(rankEntries([entry("w", 120, 1)]), 98)).toBe(1); // everyone beat it: marker at the end
    expect(markerPosition([], 98)).toBe(0);
  });

  it("shows the top 10 plus the current group if lower", () => {
    const many = Array.from({ length: 25 }, (_, i) => entry(`e${i}`, 100 - i, i));
    const r = rankEntries(many);
    expect(visibleRows(r, "e20", 10)).toMatchObject({ top: r.slice(0, 10), extra: { rank: 21 }, hidden: 15 });
    expect(visibleRows(r, "e3", 10).extra).toBeNull();
  });

  it("stays fast with 5,000 entries", () => {
    const many = Array.from({ length: 5000 }, (_, i) => entry(`e${i}`, (i * 37) % 140, i));
    const t0 = performance.now();
    rankEntries(many);
    expect(performance.now() - t0).toBeLessThan(200);
  });
});

/** App with a locked team, a game id and FantasyXI's data loaded (ready to finish the replay). */
function readyToFinish(): AppState {
  let s = reducer(lockedApp(), { type: "SET_GAME_ID", id: "game-1" });
  s = reducer(s, { type: "REVEAL_REQUEST" });
  const ok = checkReveal(reveal, ctx, 37);
  if (!ok.ok) throw new Error(ok.message);
  return reducer(s, { type: "REVEAL_LOADED", attempt: 1, reveal, aiTeam: ok.aiTeam });
}

describe("exactly-once saving", () => {
  const outcome = { human: 98, ai: 98 };

  it("finishing twice (double click, going back, a second replay) saves one entry", () => {
    let s = reducer(readyToFinish(), { type: "SIMULATION_FINISHED", outcome, finishedAt: 1000 });
    s = reducer(s, { type: "SIMULATION_FINISHED", outcome, finishedAt: 2000 });
    s = reducer(reducer(s, { type: "GOTO", screen: "simulate" }), { type: "SIMULATION_FINISHED", outcome, finishedAt: 3000 });
    expect(s.leaderboard.entries).toHaveLength(1);
    expect(s.leaderboard.entries[0]).toMatchObject({ id: "game-1", teamName: "Test FC", score: 98, aiScore: 98, beatAI: false, createdAt: 1000 });
    expect(s.leaderboard.entries[0]!.team.bench).toEqual(aiBuild().lineup.slots.filter((x) => x.kind === "bench").map((x) => x.playerId));
  });

  it("the game id is set once at lock and never changes", () => {
    const s = reducer(readyToFinish(), { type: "SET_GAME_ID", id: "other" });
    expect(s.gameId).toBe("game-1");
    expect(reducer(loadedApp(), { type: "SET_GAME_ID", id: "x" }).gameId).toBeNull(); // not locked yet
  });

  it("refresh mid-replay: back to Meet with the same game id; finishing then saves once", () => {
    const b = aiBuild();
    const saved = { v: 1, ...meta, teamName: "Test FC", lineup: b.lineup, captainId: b.captainId, viceCaptainId: b.viceCaptainId, gameId: "game-1" };
    const s = loadedApp(saved);
    expect(s.screen).toBe("meet");
    expect(s.gameId).toBe("game-1");
  });

  it("refresh after the replay (entry already saved): straight to Result, no second replay or entry", () => {
    const finished = reducer(readyToFinish(), { type: "SIMULATION_FINISHED", outcome, finishedAt: 1000 });
    const b = aiBuild();
    const saved = { v: 1, ...meta, teamName: "Test FC", lineup: b.lineup, captainId: b.captainId, viceCaptainId: b.viceCaptainId, gameId: "game-1" };
    const m = manifest();
    const s = reducer(
      { ...finished, build: null, data: { status: "loading" } },
      { type: "DATA_LOADED", data: { manifest: m, gameweek: m.gameweeks[0]!, pregame }, saved, board: { entries: finished.leaderboard.entries, storageOk: true } },
    );
    expect(s.screen).toBe("result");
    expect(s.outcome).toEqual(outcome);
    expect(s.leaderboard.entries).toHaveLength(1);
    expect(addEntryOnce(s.leaderboard.entries, s.leaderboard.entries[0]!)).toBe(s.leaderboard.entries);
  });

  it("Play again clears the game id, the outcome and the lock, but keeps the leaderboard", () => {
    let s = reducer(readyToFinish(), { type: "SIMULATION_FINISHED", outcome, finishedAt: 1000 });
    s = reducer(s, { type: "RESET" });
    expect([s.gameId, s.outcome, s.build!.lockedTeam, s.screen]).toEqual([null, null, null, "attract"]);
    expect(s.leaderboard.entries).toHaveLength(1);
  });
});

describe("admin actions", () => {
  it("delete, reset, import merge (no duplicates) and replace", () => {
    let s: AppState = { ...loadedApp(), leaderboard: { entries: [entry("a", 10, 1), entry("b", 20, 2)], storageOk: true } };
    s = reducer(s, { type: "LEADERBOARD_DELETE", id: "a" });
    expect(s.leaderboard.entries.map((e) => e.id)).toEqual(["b"]);
    s = reducer(s, { type: "LEADERBOARD_IMPORT", entries: [entry("b", 20, 2), entry("c", 30, 3)], mode: "merge" });
    expect(s.leaderboard.entries.map((e) => e.id)).toEqual(["b", "c"]);
    s = reducer(s, { type: "LEADERBOARD_IMPORT", entries: [entry("z", 1, 1)], mode: "replace" });
    expect(s.leaderboard.entries.map((e) => e.id)).toEqual(["z"]);
    s = reducer(s, { type: "LEADERBOARD_RESET" });
    expect(s.leaderboard.entries).toEqual([]);
  });

  it("mergeEntries reports added and skipped", () => {
    expect(mergeEntries([entry("a", 1, 1)], [entry("a", 1, 1), entry("b", 2, 2), entry("b", 2, 2)])).toMatchObject({ added: 1, skipped: 2 });
  });

  it("the PIN is a plain comparison (prevents accidents only)", () => {
    expect(pinMatches(OPERATOR_PIN, OPERATOR_PIN)).toBe(true);
    expect(pinMatches(` ${OPERATOR_PIN} `, OPERATOR_PIN)).toBe(true);
    expect(pinMatches("0000", OPERATOR_PIN)).toBe(false);
    expect(pinMatches("", OPERATOR_PIN)).toBe(false);
  });
});

describe("storage", () => {
  const memory = (): KeyValueStore & { data: Map<string, string> } => {
    const data = new Map<string, string>();
    return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
  };

  it("save then load gives the same entries under a key with version, gameweek and data version", () => {
    const store = memory();
    expect(saveBoard(store, meta, [entry("a", 10, 1)])).toBe(true);
    expect([...store.data.keys()]).toEqual([`fantasyxi-stall:leaderboard:v1:gw37:${meta.dataVersion}`]);
    expect(boardKey(meta)).toContain("gw37");
    expect(loadBoard(store, meta)).toEqual({ entries: [entry("a", 10, 1)], storageOk: true });
    expect(loadBoard(store, { ...meta, gameweek: 38 }).entries).toEqual([]); // other data never mixed
  });

  it("falls back to memory when storage is missing, blocked or full", () => {
    expect(loadBoard(null, meta)).toEqual({ entries: [], storageOk: false });
    const blocked: KeyValueStore = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => {} };
    expect(loadBoard(blocked, meta).storageOk).toBe(false);
    expect(saveBoard(blocked, meta, [])).toBe(false);
    const s = reducer(loadedApp(), { type: "STORAGE_FAILED" });
    expect(s.leaderboard.storageOk).toBe(false);
    // The game keeps working: an entry can still be added in memory.
    expect(reducer(s, { type: "LEADERBOARD_IMPORT", entries: [entry("m", 5, 1)], mode: "merge" }).leaderboard.entries).toHaveLength(1);
  });

  it("ignores a corrupted stored board instead of crashing", () => {
    const store = memory();
    store.setItem(boardKey(meta), "{not json");
    expect(loadBoard(store, meta)).toEqual({ entries: [], storageOk: false });
  });
});

describe("export / import", () => {
  const real = (id: string, score: number, t: number) => entry(id, score, t);
  const results = reveal.results;

  it("JSON export -> import round trip keeps every entry; the engine re-check accepts real scores", () => {
    const aiTotal = scoreTeam(aiTeam, resultsById(results)).total;
    const entries = [real("x", aiTotal, 1), real("y", aiTotal, 2)];
    const file = JSON.parse(serializeBoard(entries, meta, "2026-10-05T12:00:00Z"));
    const parsed = parseBoardFile(file, meta);
    expect(parsed).toEqual({ entries, rejected: [] });
    expect(verifyEntries(parsed.entries, ctx, results, 98)).toEqual({ valid: entries, rejected: [] });
  });

  it("rejects a fake score, an illegal team, bad shapes and a file for other data", () => {
    const fake = real("fake", 150, 1); // AI team really scores 98
    const illegal = { ...real("ill", 98, 2), team: { ...team, bench: [team.starting[0]!, ...team.bench.slice(1)] } };
    const v = verifyEntries([fake, illegal], ctx, results, 98);
    expect(v.valid).toEqual([]);
    expect(v.rejected.map((r) => r.reason)).toEqual(["score doesn't match its team", expect.stringMatching(/^illegal team/)]);
    const file = JSON.parse(serializeBoard([real("ok", 98, 1)], meta));
    file.entries.push({ id: "", teamName: "x" }, { ...real("lie", 98, 1), beatAI: true });
    expect(parseBoardFile(file, meta).rejected.map((r) => r.reason)).toEqual(["missing id", "beatAI doesn't match the scores"]);
    expect(() => parseBoardFile({ ...file, gameweek: 38 }, meta)).toThrow(/This file is for gameweek 38/);
    expect(() => parseBoardFile({ format: "other" }, meta)).toThrow(/isn't a FantasyXI stall leaderboard/);
  });
});

describe("CSV export", () => {
  it("neutralises formulas and escapes commas, quotes and line breaks", () => {
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("-2")).toBe("'-2");
    expect(csvCell("@cmd")).toBe("'@cmd");
    expect(csvCell("\tTab")).toBe("'\tTab");
    expect(csvCell('Say "hi", ok')).toBe('"Say ""hi"", ok"');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
    expect(csvCell(-5)).toBe("-5"); // numbers are not text: a negative score stays a number
    expect(csvCell("Plain FC")).toBe("Plain FC");
  });

  it("is UTF-8 with a BOM, keeps accents, and lists teams in rank order", () => {
    const csv = toCsv([entry("a", 10, 1, "=HYPERLINK(evil)"), entry("b", 99, 2, "Ødegaard's Élan, FC")], ctx);
    expect(csv.startsWith("﻿rank,team_name,score")).toBe(true);
    const lines = csv.trim().split("\r\n");
    expect(lines[1]).toMatch(/^1,"Ødegaard's Élan, FC",99,98,yes,/);
    expect(lines[2]).toMatch(/^2,'=HYPERLINK\(evil\),10,98,no,/);
    expect(csv).toContain("Viktor Gyökeres");
  });
});

describe("idle reset timing", () => {
  it("active until 80 s, a 10 s countdown, reset at 90 s", () => {
    expect(idlePhase(0)).toEqual({ phase: "active" });
    expect(idlePhase(79_999)).toEqual({ phase: "active" });
    expect(idlePhase(80_000)).toEqual({ phase: "warning", secondsLeft: 10 });
    expect(idlePhase(85_500)).toEqual({ phase: "warning", secondsLeft: 5 });
    expect(idlePhase(89_999)).toEqual({ phase: "warning", secondsLeft: 1 });
    expect(idlePhase(90_000)).toEqual({ phase: "reset" });
  });
});
