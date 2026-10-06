// State for building one group's team (Build, Bench, Captain steps + the timer).
// Every rule decision is delegated to the engine (canAddPlayer, autoFillBench, autoComplete,
// validateTeam). This file only stores choices, keeps an undo history, and runs the timer logic.

import {
  autoComplete,
  autoFillBench,
  canAddPlayer,
  emptyLineup,
  isValidFormation,
  lineupToTeam,
  validateTeam,
  type EngineContext,
  type Lineup,
  type Position,
  type Team,
} from "../engine";
import { randomCaptainVice, randomFillXI, seededRng } from "./randomTeam";

export const DEFAULT_FORMATION = "4-4-2";
export const TIMER_MS = 3 * 60_000;
export const TIMER_WARNING_MS = 30_000;
export const TIMER_EXTENSION_MS = 60_000;

export interface Snapshot {
  lineup: Lineup;
  captainId: number | null;
  viceCaptainId: number | null;
}

export interface TimerState {
  /** When the countdown hits 0 (ms since epoch); null = not running. */
  endsAt: number | null;
  /** The one-off +60 s has been used. */
  extended: boolean;
  /** Time-up dialog: offer +60 s (first time) or only auto-complete (after the extension). */
  dialog: null | "extend-or-complete" | "complete-only";
}

export interface BuildState extends Snapshot {
  undo: Snapshot[];
  /** Last refused action's plain-language reason (shown as a message). */
  message: string | null;
  lockedTeam: Team | null;
  timer: TimerState;
}

export type BuildAction =
  | { type: "SET_FORMATION"; formation: string }
  | { type: "PLACE_PLAYER"; slotIndex: number; playerId: number }
  | { type: "CLEAR_SLOT"; slotIndex: number }
  | { type: "UNDO" }
  | { type: "START_OVER" }
  | { type: "AUTO_FILL_BENCH" }
  /** Random helpers: the seed comes from the button (Math.random), so this reducer stays deterministic. */
  | { type: "RANDOM_XI"; seed: number }
  | { type: "RANDOM_CAPTAIN"; seed: number }
  | { type: "MOVE_BENCH"; from: number; to: number }
  | { type: "SET_CAPTAIN"; playerId: number }
  | { type: "SET_VICE"; playerId: number }
  | { type: "LOCK" }
  | { type: "DISMISS_MESSAGE" }
  | { type: "TIMER_START"; now: number; durationMs?: number }
  | { type: "TIME_UP"; now: number }
  | { type: "TIMER_EXTEND"; now: number }
  | { type: "TIMER_AUTOCOMPLETE" }
  | { type: "TIMER_STOP" };

const MAX_UNDO = 50;

export function newBuild(ctx: EngineContext): BuildState {
  return {
    lineup: emptyLineup(DEFAULT_FORMATION, ctx.rules),
    captainId: null,
    viceCaptainId: null,
    undo: [],
    message: null,
    lockedTeam: null,
    timer: { endsAt: null, extended: false, dialog: null },
  };
}

const snapshot = (s: BuildState): Snapshot => ({ lineup: s.lineup, captainId: s.captainId, viceCaptainId: s.viceCaptainId });

/** Applies a change and records the previous state for Undo. Drops C/V who are no longer starters. */
function commit(s: BuildState, next: Partial<Snapshot>): BuildState {
  const lineup = next.lineup ?? s.lineup;
  const starters = new Set(lineup.slots.filter((x) => x.kind === "xi").map((x) => x.playerId));
  const keep = (id: number | null | undefined) => (id != null && starters.has(id) ? id : null);
  return {
    ...s,
    lineup,
    captainId: keep(next.captainId !== undefined ? next.captainId : s.captainId),
    viceCaptainId: keep(next.viceCaptainId !== undefined ? next.viceCaptainId : s.viceCaptainId),
    undo: [...s.undo, snapshot(s)].slice(-MAX_UNDO),
    message: null,
  };
}

const refuse = (s: BuildState, message: string): BuildState => ({ ...s, message });

const withSlot = (lineup: Lineup, i: number, playerId: number | null): Lineup => ({
  ...lineup,
  slots: lineup.slots.map((x, k) => (k === i ? { ...x, playerId } : x)),
});

/** Moves every picked player into the new formation's slots of the same position: starters first
 *  (in their current order), then bench players. Always possible because the squad shape (2/5/5/3)
 *  doesn't depend on the formation, so no player is ever dropped. */
export function reshapeLineup(lineup: Lineup, formation: string, ctx: EngineContext): Lineup {
  const queues: Record<Position, number[]> = { GK: [], DEF: [], MID: [], FWD: [] };
  for (const kind of ["xi", "bench"] as const) {
    for (const s of lineup.slots) if (s.kind === kind && s.playerId !== null) queues[s.position].push(s.playerId);
  }
  const next = emptyLineup(formation, ctx.rules);
  for (const s of next.slots) s.playerId = queues[s.position].shift() ?? null;
  return next;
}

/** A locked-ready team, or null with the first problem (plain words). */
export function finishedTeam(s: BuildState, ctx: EngineContext): { team: Team | null; problem: string | null } {
  const team = lineupToTeam(s.lineup, s.captainId, s.viceCaptainId);
  if (!team) return { team: null, problem: "Fill every spot first (11 starters and 4 on the bench)." };
  const issues = validateTeam(team, ctx);
  return issues.length ? { team: null, problem: issues[0]!.message } : { team, problem: null };
}

function lock(s: BuildState, team: Team): BuildState {
  return { ...s, lockedTeam: team, message: null, timer: { ...s.timer, endsAt: null, dialog: null } };
}

export function buildReducer(s: BuildState, a: BuildAction, ctx: EngineContext): BuildState {
  if (s.lockedTeam && a.type !== "DISMISS_MESSAGE") return s; // a locked team is frozen

  switch (a.type) {
    case "SET_FORMATION": {
      if (a.formation === s.lineup.formation) return s;
      if (!isValidFormation(a.formation, ctx.rules)) return refuse(s, "That formation isn't allowed.");
      return commit(s, { lineup: reshapeLineup(s.lineup, a.formation, ctx) });
    }
    case "PLACE_PLAYER": {
      const check = canAddPlayer(s.lineup, a.slotIndex, a.playerId, ctx);
      if (!check.ok) return refuse(s, check.reason);
      return commit(s, { lineup: withSlot(s.lineup, a.slotIndex, a.playerId) });
    }
    case "CLEAR_SLOT":
      if (s.lineup.slots[a.slotIndex]?.playerId == null) return s;
      return commit(s, { lineup: withSlot(s.lineup, a.slotIndex, null) });
    case "UNDO": {
      const prev = s.undo.at(-1);
      if (!prev) return s;
      return { ...s, ...prev, undo: s.undo.slice(0, -1), message: null };
    }
    case "START_OVER":
      return commit(s, { lineup: emptyLineup(s.lineup.formation, ctx.rules), captainId: null, viceCaptainId: null });
    case "AUTO_FILL_BENCH": {
      const res = autoFillBench(s.lineup, ctx);
      if (!res.ok) return refuse(s, res.reason);
      if (res.lineup === s.lineup) return s;
      return commit(s, { lineup: res.lineup });
    }
    case "RANDOM_XI": {
      if (!s.lineup.slots.some((x) => x.kind === "xi" && x.playerId === null)) return s;
      const lineup = randomFillXI(s.lineup, ctx, seededRng(a.seed));
      if (!lineup) return refuse(s, "Couldn't pick a random team from here. Remove a player or two and try again.");
      return commit(s, { lineup }); // one Undo step for the whole fill
    }
    case "RANDOM_CAPTAIN": {
      const cv = randomCaptainVice(s.lineup, seededRng(a.seed));
      if (!cv) return refuse(s, "Pick at least two starters first.");
      return commit(s, { captainId: cv[0], viceCaptainId: cv[1] });
    }
    case "MOVE_BENCH": {
      const bench = s.lineup.slots.flatMap((x, i) => (x.kind === "bench" ? [i] : []));
      const from = bench[a.from];
      const to = bench[a.to];
      if (from === undefined || to === undefined || from === to) return s;
      const slots = [...s.lineup.slots];
      [slots[from], slots[to]] = [slots[to]!, slots[from]!];
      return commit(s, { lineup: { ...s.lineup, slots } });
    }
    case "SET_CAPTAIN":
    case "SET_VICE": {
      const isStarter = s.lineup.slots.some((x) => x.kind === "xi" && x.playerId === a.playerId);
      if (!isStarter) return refuse(s, "Only starting players can be captain or vice-captain.");
      let { captainId, viceCaptainId } = s;
      if (a.type === "SET_CAPTAIN") {
        if (viceCaptainId === a.playerId) viceCaptainId = captainId; // swap
        captainId = a.playerId;
      } else {
        if (captainId === a.playerId) captainId = viceCaptainId; // swap
        viceCaptainId = a.playerId;
      }
      return commit(s, { captainId, viceCaptainId });
    }
    case "LOCK": {
      const { team, problem } = finishedTeam(s, ctx);
      return team ? lock(s, team) : refuse(s, problem!);
    }
    case "DISMISS_MESSAGE":
      return s.message === null ? s : { ...s, message: null };

    // ---- Timer -----------------------------------------------------------------------
    case "TIMER_START":
      if (s.timer.endsAt !== null || s.timer.dialog !== null || s.timer.extended) return s;
      return { ...s, timer: { ...s.timer, endsAt: a.now + (a.durationMs ?? TIMER_MS) } };
    case "TIME_UP": {
      if (s.timer.endsAt === null || a.now < s.timer.endsAt) return s;
      const { team } = finishedTeam(s, ctx);
      if (team) return lock(s, team); // a valid team locks automatically
      return { ...s, timer: { ...s.timer, endsAt: null, dialog: s.timer.extended ? "complete-only" : "extend-or-complete" } };
    }
    case "TIMER_EXTEND":
      if (s.timer.dialog !== "extend-or-complete") return s;
      return { ...s, timer: { endsAt: a.now + TIMER_EXTENSION_MS, extended: true, dialog: null } };
    case "TIMER_AUTOCOMPLETE": {
      if (s.timer.dialog === null) return s;
      const res = autoComplete(s.lineup, s.captainId, s.viceCaptainId, ctx);
      if (!res.ok) return { ...s, message: res.reason, timer: { ...s.timer, dialog: null } };
      const done = commit(s, { lineup: res.lineup, captainId: res.captainId, viceCaptainId: res.viceCaptainId });
      return lock(done, res.team);
    }
    case "TIMER_STOP":
      return { ...s, timer: { ...s.timer, endsAt: null, dialog: null } };
  }
}

// ---- Small read helpers for screens --------------------------------------------------

export const filledCount = (l: Lineup, kind: "xi" | "bench") => l.slots.filter((x) => x.kind === kind && x.playerId !== null).length;
export const slotCount = (l: Lineup, kind: "xi" | "bench") => l.slots.filter((x) => x.kind === kind).length;
