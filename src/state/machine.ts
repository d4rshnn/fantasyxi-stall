import { makeContext, type EngineContext, type Reveal, type Team } from "../engine";
import type { InitialData } from "../data/types";
import { buildReducer, newBuild, type BuildAction, type BuildState } from "./build";
import { REVEAL_IDLE, type RevealState } from "./reveal";
import { restoreLocked } from "./session";
import { cleanTeamName, TEAM_NAME_MAX } from "./teamNames";
import { addEntryOnce, makeEntry, mergeEntries, type LeaderboardEntry } from "./leaderboard";

/** The main game flow, in order. "Next" moves one step; after the last screen it starts a new game. */
export const FLOW = [
  "attract",
  "name",
  "build",
  "bench",
  "captain",
  "lock",
  "meet",
  "simulate",
  "result",
  "leaderboard",
  "explainer",
] as const;

export type FlowScreen = (typeof FLOW)[number];
/** Admin is hidden: reached only via #/admin or Ctrl+Shift+A, never via "Next". */
export type Screen = FlowScreen | "admin";

/** Screens where the soft countdown runs. */
export const TIMED_SCREENS: readonly Screen[] = ["build", "bench", "captain"];

/** Screens that change the team; unreachable once the team is locked. */
export const EDIT_SCREENS: readonly Screen[] = ["name", "build", "bench", "captain", "lock"];

export type DataState =
  | { status: "loading" }
  | { status: "ready"; data: InitialData; ctx: EngineContext }
  | { status: "error"; message: string };

/** Operator settings (kept across games; saved in this browser). */
export interface Settings {
  timerEnabled: boolean;
  /** Saved for later: the app has no sounds yet. */
  soundEnabled: boolean;
}

export const DEFAULT_SETTINGS: Settings = { timerEnabled: true, soundEnabled: false };

export interface LeaderboardState {
  entries: readonly LeaderboardEntry[];
  /** False if this browser's storage can't be used: the board then lives in memory only. */
  storageOk: boolean;
}

export interface AppState {
  screen: Screen;
  /** Where to go back to when admin is closed. */
  returnTo: FlowScreen;
  data: DataState;
  settings: Settings;
  teamName: string;
  /** The current group's team; null until the data has loaded. Cleared by RESET ("Play again"). */
  build: BuildState | null;
  /** FantasyXI's team + real results; only ever requested after the lock (spoiler guard). */
  reveal: RevealState;
  /** Final totals once the gameweek replay has finished (or was skipped). Read by the Result screen. */
  outcome: Outcome | null;
  /** Id for this game, created when the team is locked; the leaderboard entry uses it (exactly once). */
  gameId: string | null;
  leaderboard: LeaderboardState;
}

/** Both final scores, straight from the scoring engine (the replay ends on exactly these). */
export interface Outcome {
  human: number;
  ai: number;
}

export type AppAction =
  | { type: "NEXT" }
  | { type: "GOTO"; screen: FlowScreen }
  | { type: "RESET" }
  | { type: "OPEN_ADMIN" }
  | { type: "CLOSE_ADMIN" }
  | { type: "DATA_LOADING" }
  /** `saved`: a locked team saved before a page refresh (restored if still valid). */
  | { type: "DATA_LOADED"; data: InitialData; saved?: unknown; board?: LeaderboardState }
  | { type: "DATA_FAILED"; message: string }
  | { type: "SET_TIMER_ENABLED"; enabled: boolean }
  | { type: "SET_TEAM_NAME"; name: string }
  | { type: "REVEAL_REQUEST" }
  | { type: "REVEAL_LOADED"; attempt: number; reveal: Reveal; aiTeam: Team }
  | { type: "REVEAL_FAILED"; attempt: number; message: string }
  | { type: "SIMULATION_FINISHED"; outcome: Outcome; finishedAt: number }
  | { type: "SET_GAME_ID"; id: string }
  | { type: "SET_SOUND_ENABLED"; enabled: boolean }
  | { type: "LEADERBOARD_DELETE"; id: string }
  | { type: "LEADERBOARD_RESET" }
  | { type: "LEADERBOARD_IMPORT"; entries: readonly LeaderboardEntry[]; mode: "merge" | "replace" }
  | { type: "STORAGE_FAILED" };

export type Action = AppAction | BuildAction;

export const initialState: AppState = {
  screen: "attract",
  returnTo: "attract",
  data: { status: "loading" },
  settings: DEFAULT_SETTINGS,
  teamName: "",
  build: null,
  reveal: REVEAL_IDLE,
  outcome: null,
  gameId: null,
  leaderboard: { entries: [], storageOk: true },
};

export const isLocked = (state: AppState): boolean => !!state.build?.lockedTeam;

export function nextScreen(screen: FlowScreen): FlowScreen {
  const i = FLOW.indexOf(screen);
  return FLOW[(i + 1) % FLOW.length] ?? "attract";
}

const ctxOf = (state: AppState): EngineContext | null => (state.data.status === "ready" ? state.data.ctx : null);

/** A fresh game for the next group (keeps data and operator settings). */
function newGame(state: AppState): AppState {
  const ctx = ctxOf(state);
  return { ...state, teamName: "", build: ctx ? newBuild(ctx) : null, reveal: REVEAL_IDLE, outcome: null, gameId: null };
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "NEXT": {
      if (state.screen === "admin") return state;
      if (state.screen === "name") {
        const teamName = cleanTeamName(state.teamName);
        if (!teamName) return state; // a name is required
        return { ...state, teamName, screen: "build" };
      }
      // Build/Bench/Captain move on with their own checked buttons, and Lock only by locking (LOCK),
      // so a stray Next (e.g. a double Enter on the Name screen) can't skip a step.
      if (state.screen === "build" || state.screen === "bench" || state.screen === "captain" || state.screen === "lock") return state;
      const screen = nextScreen(state.screen);
      // Wrapping round to the attract screen means the previous group is done.
      return screen === "attract" ? { ...newGame(state), screen } : { ...state, screen };
    }
    case "GOTO":
      // A locked team is frozen: the screens that edit it can't be reopened.
      if (isLocked(state) && EDIT_SCREENS.includes(action.screen)) return state;
      return { ...state, screen: action.screen };
    case "SET_TEAM_NAME":
      if (isLocked(state)) return state;
      return { ...state, teamName: action.name.slice(0, TEAM_NAME_MAX) };
    case "REVEAL_REQUEST": {
      // Spoiler guard: reveal data is only ever requested for a locked team.
      if (!isLocked(state) || state.reveal.status === "loading" || state.reveal.status === "ready") return state;
      const attempt = state.reveal.status === "error" ? state.reveal.attempt + 1 : 1;
      return { ...state, reveal: { status: "loading", attempt } };
    }
    case "REVEAL_LOADED":
      if (!isLocked(state) || state.reveal.status !== "loading" || state.reveal.attempt !== action.attempt) return state;
      return { ...state, reveal: { status: "ready", reveal: action.reveal, aiTeam: action.aiTeam } };
    case "SIMULATION_FINISHED": {
      // Only meaningful for a locked team whose reveal data is loaded; the first result sticks.
      if (!isLocked(state) || state.reveal.status !== "ready" || state.data.status !== "ready") return state;
      const outcome = state.outcome ?? action.outcome;
      if (!state.gameId) return state.outcome ? state : { ...state, outcome };
      const { gameweek, manifest } = state.data.data;
      const team = state.build!.lockedTeam!;
      // Exactly once: the entry id is the game id, and addEntryOnce ignores an id that's already there.
      const entries = addEntryOnce(
        state.leaderboard.entries,
        makeEntry({
          id: state.gameId,
          teamName: state.teamName,
          score: outcome.human,
          aiScore: outcome.ai,
          createdAt: action.finishedAt,
          gameweek: gameweek.gameweek,
          dataVersion: manifest.data_version,
          team: { starting: [...team.starting], bench: [...team.bench], captainId: team.captainId!, viceCaptainId: team.viceCaptainId! },
        }),
      );
      if (state.outcome && entries === state.leaderboard.entries) return state;
      return { ...state, outcome, leaderboard: { ...state.leaderboard, entries } };
    }
    case "SET_GAME_ID":
      if (!isLocked(state) || state.gameId) return state;
      return { ...state, gameId: action.id };
    case "SET_SOUND_ENABLED":
      return { ...state, settings: { ...state.settings, soundEnabled: action.enabled } };
    case "LEADERBOARD_DELETE":
      return { ...state, leaderboard: { ...state.leaderboard, entries: state.leaderboard.entries.filter((e) => e.id !== action.id) } };
    case "LEADERBOARD_RESET":
      return { ...state, leaderboard: { ...state.leaderboard, entries: [] } };
    case "LEADERBOARD_IMPORT": {
      const base = action.mode === "replace" ? [] : state.leaderboard.entries;
      return { ...state, leaderboard: { ...state.leaderboard, entries: mergeEntries(base, action.entries).entries } };
    }
    case "STORAGE_FAILED":
      return state.leaderboard.storageOk ? { ...state, leaderboard: { ...state.leaderboard, storageOk: false } } : state;
    case "REVEAL_FAILED":
      if (state.reveal.status !== "loading" || state.reveal.attempt !== action.attempt) return state;
      return { ...state, reveal: { status: "error", message: action.message, attempt: action.attempt } };
    case "RESET":
      return { ...newGame(state), screen: "attract", returnTo: "attract" };
    case "OPEN_ADMIN":
      if (state.screen === "admin") return state;
      return { ...state, screen: "admin", returnTo: state.screen };
    case "CLOSE_ADMIN":
      if (state.screen !== "admin") return state;
      return { ...state, screen: state.returnTo };
    case "DATA_LOADING":
      return { ...state, data: { status: "loading" } };
    case "DATA_LOADED": {
      const ctx = makeContext(action.data.pregame);
      const loaded: AppState = {
        ...state,
        data: { status: "ready", data: action.data, ctx },
        build: state.build ?? newBuild(ctx),
        leaderboard: action.board ?? state.leaderboard,
      };
      if (state.build) return loaded;
      // After a page refresh: bring back a team that was already locked (if still valid).
      const restored = restoreLocked(action.saved, ctx, action.data.manifest.data_version, action.data.gameweek.gameweek);
      if (!restored) return loaded;
      const savedId = (action.saved as { gameId?: unknown }).gameId;
      const gameId = typeof savedId === "string" && savedId ? savedId : null;
      // Already finished and saved? Go straight to the result (no second replay, no second entry).
      const entry = gameId ? loaded.leaderboard.entries.find((e) => e.id === gameId) : undefined;
      if (entry) return { ...loaded, ...restored, gameId, screen: "result", reveal: REVEAL_IDLE, outcome: { human: entry.score, ai: entry.aiScore } };
      return { ...loaded, ...restored, gameId, screen: "meet", reveal: REVEAL_IDLE };
    }
    case "DATA_FAILED":
      return { ...state, data: { status: "error", message: action.message } };
    case "SET_TIMER_ENABLED": {
      const settings = { ...state.settings, timerEnabled: action.enabled };
      const ctx = ctxOf(state);
      const build = !action.enabled && state.build && ctx ? buildReducer(state.build, { type: "TIMER_STOP" }, ctx) : state.build;
      return { ...state, settings, build };
    }
    default: {
      // Team-building actions.
      const ctx = ctxOf(state);
      if (!ctx || !state.build) return state;
      if ((action.type === "TIMER_START" || action.type === "TIME_UP") && !state.settings.timerEnabled) return state;
      const build = buildReducer(state.build, action, ctx);
      if (build === state.build) return state;
      // Locking (by the Lock button or when time runs out) moves on to meeting FantasyXI.
      const justLocked = !state.build.lockedTeam && build.lockedTeam;
      return { ...state, build, screen: justLocked ? "meet" : state.screen };
    }
  }
}
