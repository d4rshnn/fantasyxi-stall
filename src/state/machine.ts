import { makeContext, type EngineContext } from "../engine";
import type { InitialData } from "../data/types";
import { buildReducer, newBuild, type BuildAction, type BuildState } from "./build";

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

export type DataState =
  | { status: "loading" }
  | { status: "ready"; data: InitialData; ctx: EngineContext }
  | { status: "error"; message: string };

/** Operator settings (kept across games; saved in this browser). */
export interface Settings {
  timerEnabled: boolean;
}

export const DEFAULT_SETTINGS: Settings = { timerEnabled: true };

export interface AppState {
  screen: Screen;
  /** Where to go back to when admin is closed. */
  returnTo: FlowScreen;
  data: DataState;
  settings: Settings;
  teamName: string;
  /** The current group's team; null until the data has loaded. Cleared by RESET ("Play again"). */
  build: BuildState | null;
}

export type AppAction =
  | { type: "NEXT" }
  | { type: "GOTO"; screen: FlowScreen }
  | { type: "RESET" }
  | { type: "OPEN_ADMIN" }
  | { type: "CLOSE_ADMIN" }
  | { type: "DATA_LOADING" }
  | { type: "DATA_LOADED"; data: InitialData }
  | { type: "DATA_FAILED"; message: string }
  | { type: "SET_TIMER_ENABLED"; enabled: boolean };

export type Action = AppAction | BuildAction;

export const initialState: AppState = {
  screen: "attract",
  returnTo: "attract",
  data: { status: "loading" },
  settings: DEFAULT_SETTINGS,
  teamName: "",
  build: null,
};

export function nextScreen(screen: FlowScreen): FlowScreen {
  const i = FLOW.indexOf(screen);
  return FLOW[(i + 1) % FLOW.length] ?? "attract";
}

const ctxOf = (state: AppState): EngineContext | null => (state.data.status === "ready" ? state.data.ctx : null);

/** A fresh game for the next group (keeps data and operator settings). */
function newGame(state: AppState): AppState {
  const ctx = ctxOf(state);
  return { ...state, teamName: "", build: ctx ? newBuild(ctx) : null };
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "NEXT": {
      if (state.screen === "admin") return state;
      const screen = nextScreen(state.screen);
      // Wrapping round to the attract screen means the previous group is done.
      return screen === "attract" ? { ...newGame(state), screen } : { ...state, screen };
    }
    case "GOTO":
      return { ...state, screen: action.screen };
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
      return { ...state, data: { status: "ready", data: action.data, ctx }, build: state.build ?? newBuild(ctx) };
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
