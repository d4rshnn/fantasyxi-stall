// The stall leaderboard: one board per gameweek + data version, kept in this browser (localStorage).
// Everything here is plain functions so it can be tested; the app wires storage in App.tsx.

import {
  POSITIONS,
  scoreTeam,
  validateTeam,
  type EngineContext,
  type PlayerResult,
  type Team,
} from "../engine";
import { resultsById } from "../engine";

export const BOARD_FORMAT = "fantasyxi-stall-leaderboard";
export const BOARD_VERSION = 1;

export interface LeaderboardEntry {
  /** Game id created when the team was locked (makes saving exactly-once). */
  id: string;
  teamName: string;
  score: number;
  /** FantasyXI's score for the same gameweek. */
  aiScore: number;
  /** True only if score is strictly greater than aiScore (a tie is not a win). */
  beatAI: boolean;
  /** When the game finished (ms since 1970). */
  createdAt: number;
  gameweek: number;
  dataVersion: string;
  /** The full locked team, so the result could be replayed or re-checked. */
  team: { starting: number[]; bench: number[]; captainId: number; viceCaptainId: number };
}

export interface BoardMeta {
  gameweek: number;
  dataVersion: string;
}

/** Storage key: format version + gameweek + data version, so different data is never mixed. */
export const boardKey = (m: BoardMeta) => `fantasyxi-stall:leaderboard:v${BOARD_VERSION}:gw${m.gameweek}:${m.dataVersion}`;

// ---- Ranking ----------------------------------------------------------------------------------

/** Higher score first; equal scores: earlier finish first; then id (so the order is always fixed). */
export function compareEntries(a: LeaderboardEntry, b: LeaderboardEntry): number {
  return b.score - a.score || a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

export interface RankedEntry {
  rank: number;
  entry: LeaderboardEntry;
}

export function rankEntries(entries: readonly LeaderboardEntry[]): RankedEntry[] {
  return [...entries].sort(compareEntries).map((entry, i) => ({ rank: i + 1, entry }));
}

/** Where the FantasyXI marker line goes: after every entry that beat the AI (ties go below it). */
export function markerPosition(ranked: readonly RankedEntry[], aiScore: number): number {
  const i = ranked.findIndex((r) => r.entry.score <= aiScore);
  return i === -1 ? ranked.length : i;
}

/** Rows to show: the top N, plus the current group if it ranks lower. */
export function visibleRows(ranked: readonly RankedEntry[], currentId: string | null, topN: number) {
  const top = ranked.slice(0, topN);
  const current = currentId ? ranked.find((r) => r.entry.id === currentId) : undefined;
  return { top, extra: current && current.rank > topN ? current : null, hidden: Math.max(0, ranked.length - topN) };
}

// ---- Exactly-once add, delete, merge ------------------------------------------------------------

/** Adds the entry unless one with the same id already exists (then returns the same array). */
export function addEntryOnce(entries: readonly LeaderboardEntry[], entry: LeaderboardEntry): readonly LeaderboardEntry[] {
  return entries.some((e) => e.id === entry.id) ? entries : [...entries, entry];
}

export function mergeEntries(existing: readonly LeaderboardEntry[], incoming: readonly LeaderboardEntry[]) {
  const ids = new Set(existing.map((e) => e.id));
  const added: LeaderboardEntry[] = [];
  let skipped = 0;
  for (const e of incoming) {
    if (ids.has(e.id)) skipped++;
    else {
      ids.add(e.id);
      added.push(e);
    }
  }
  return { entries: [...existing, ...added], added: added.length, skipped };
}

export function makeEntry(p: Omit<LeaderboardEntry, "beatAI">): LeaderboardEntry {
  return { ...p, beatAI: p.score > p.aiScore };
}

// ---- Shape checks (storage and import) ------------------------------------------------------------

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const isIntList = (v: unknown): v is number[] => Array.isArray(v) && v.every(isInt);

/** A single entry with the right shape, or a reason why not. */
export function checkEntryShape(v: unknown): { ok: true; entry: LeaderboardEntry } | { ok: false; reason: string } {
  if (typeof v !== "object" || v === null) return { ok: false, reason: "not an object" };
  const o = v as Record<string, unknown>;
  const t = o.team as Record<string, unknown> | undefined;
  if (typeof o.id !== "string" || !o.id) return { ok: false, reason: "missing id" };
  if (typeof o.teamName !== "string" || !o.teamName.trim()) return { ok: false, reason: "missing team name" };
  if (!isInt(o.score) || !isInt(o.aiScore) || !isInt(o.createdAt) || !isInt(o.gameweek)) return { ok: false, reason: "bad numbers" };
  if (typeof o.dataVersion !== "string" || typeof o.beatAI !== "boolean") return { ok: false, reason: "bad fields" };
  if (!t || !isIntList(t.starting) || !isIntList(t.bench) || !isInt(t.captainId) || !isInt(t.viceCaptainId)) return { ok: false, reason: "bad team" };
  if (o.beatAI !== o.score > o.aiScore) return { ok: false, reason: "beatAI doesn't match the scores" };
  return {
    ok: true,
    entry: {
      id: o.id,
      teamName: o.teamName.slice(0, 40),
      score: o.score,
      aiScore: o.aiScore,
      beatAI: o.beatAI,
      createdAt: o.createdAt,
      gameweek: o.gameweek,
      dataVersion: o.dataVersion,
      team: { starting: [...t.starting], bench: [...t.bench], captainId: t.captainId, viceCaptainId: t.viceCaptainId },
    },
  };
}

export interface BoardFile extends BoardMeta {
  format: typeof BOARD_FORMAT;
  version: number;
  exportedAt?: string;
  entries: LeaderboardEntry[];
}

/** Parses a stored or imported board file. File-level problems throw; bad entries are reported. */
export function parseBoardFile(json: unknown, expected: BoardMeta): { entries: LeaderboardEntry[]; rejected: { index: number; reason: string }[] } {
  if (typeof json !== "object" || json === null) throw new Error("This isn't a leaderboard file.");
  const o = json as Record<string, unknown>;
  if (o.format !== BOARD_FORMAT) throw new Error("This isn't a FantasyXI stall leaderboard file.");
  if (o.version !== BOARD_VERSION) throw new Error(`Unsupported leaderboard file version ${String(o.version)}.`);
  if (o.gameweek !== expected.gameweek || o.dataVersion !== expected.dataVersion) {
    throw new Error(`This file is for gameweek ${String(o.gameweek)} / data ${String(o.dataVersion)}, not gameweek ${expected.gameweek} / data ${expected.dataVersion}.`);
  }
  if (!Array.isArray(o.entries)) throw new Error("The file has no entries list.");
  const entries: LeaderboardEntry[] = [];
  const rejected: { index: number; reason: string }[] = [];
  o.entries.forEach((e, index) => {
    const c = checkEntryShape(e);
    if (!c.ok) rejected.push({ index, reason: c.reason });
    else if (c.entry.gameweek !== expected.gameweek || c.entry.dataVersion !== expected.dataVersion) rejected.push({ index, reason: "different gameweek or data" });
    else entries.push(c.entry);
  });
  return { entries, rejected };
}

/** Re-checks imported entries with the engine: the team must be legal and its score must equal what
 *  the scoring engine gives with the real results (so a backup can't smuggle in a fake score). */
export function verifyEntries(
  entries: readonly LeaderboardEntry[],
  ctx: EngineContext,
  results: readonly PlayerResult[],
  aiScore: number,
): { valid: LeaderboardEntry[]; rejected: { id: string; reason: string }[] } {
  const byId = resultsById(results);
  const valid: LeaderboardEntry[] = [];
  const rejected: { id: string; reason: string }[] = [];
  for (const e of entries) {
    const team: Team = { ...e.team };
    const issues = validateTeam(team, ctx);
    if (issues.length > 0) rejected.push({ id: e.id, reason: `illegal team (${issues[0]!.message})` });
    else if (e.aiScore !== aiScore) rejected.push({ id: e.id, reason: "FantasyXI score doesn't match" });
    else if (scoreTeam(team, byId).total !== e.score) rejected.push({ id: e.id, reason: "score doesn't match its team" });
    else valid.push(e);
  }
  return { valid, rejected };
}

// ---- Storage (localStorage, but any getItem/setItem object works) ----------------------------------

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** localStorage, or null if the browser blocks it. */
export function browserStorage(): KeyValueStore | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function serializeBoard(entries: readonly LeaderboardEntry[], meta: BoardMeta, exportedAt?: string): string {
  const file: BoardFile = { format: BOARD_FORMAT, version: BOARD_VERSION, ...meta, ...(exportedAt ? { exportedAt } : {}), entries: [...entries] };
  return JSON.stringify(file, null, exportedAt ? 2 : 0);
}

/** Loads the board. storageOk=false means storage can't be used (blocked/broken): use memory only. */
export function loadBoard(store: KeyValueStore | null, meta: BoardMeta): { entries: LeaderboardEntry[]; storageOk: boolean } {
  if (!store) return { entries: [], storageOk: false };
  try {
    const probe = `${boardKey(meta)}:probe`;
    store.setItem(probe, "1");
    store.removeItem(probe);
    const raw = store.getItem(boardKey(meta));
    if (!raw) return { entries: [], storageOk: true };
    return { entries: parseBoardFile(JSON.parse(raw), meta).entries, storageOk: true };
  } catch {
    return { entries: [], storageOk: false };
  }
}

/** Saves the board; returns false if storage failed (full, blocked...). */
export function saveBoard(store: KeyValueStore | null, meta: BoardMeta, entries: readonly LeaderboardEntry[]): boolean {
  if (!store) return false;
  try {
    store.setItem(boardKey(meta), serializeBoard(entries, meta));
    return true;
  } catch {
    return false;
  }
}

// ---- CSV export -----------------------------------------------------------------------------------

/** One CSV cell: neutralises spreadsheet formulas (= + - @ tab CR at the start get a leading '),
 *  and quotes cells containing commas, quotes, line breaks or edge spaces. */
export function csvCell(value: string | number | boolean): string {
  let s = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]|^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** UTF-8 CSV with a BOM (so Excel shows accents), Windows line endings, ranked order. */
export function toCsv(entries: readonly LeaderboardEntry[], ctx: EngineContext): string {
  const name = (id: number) => ctx.players.get(id)?.name ?? `#${id}`;
  const header = ["rank", "team_name", "score", "fantasyxi_score", "beat_fantasyxi", "finished_at", "formation", "captain", "vice_captain", "starting_xi", "bench_in_order", "id"];
  const formation = (e: LeaderboardEntry) => {
    const n = (p: string) => e.team.starting.filter((id) => ctx.players.get(id)?.position === p).length;
    return `${n("DEF")}-${n("MID")}-${n("FWD")}`;
  };
  const order = (id: number) => POSITIONS.indexOf(ctx.players.get(id)?.position ?? "FWD");
  const lines = rankEntries(entries).map(({ rank, entry: e }) =>
    [
      rank,
      e.teamName,
      e.score,
      e.aiScore,
      e.beatAI ? "yes" : "no",
      new Date(e.createdAt).toISOString(),
      formation(e),
      name(e.team.captainId),
      name(e.team.viceCaptainId),
      [...e.team.starting].sort((a, b) => order(a) - order(b)).map(name).join("; "),
      e.team.bench.map(name).join("; "),
      e.id,
    ]
      .map(csvCell)
      .join(","),
  );
  return "﻿" + [header.join(","), ...lines].join("\r\n") + "\r\n";
}
