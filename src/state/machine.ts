import type { InitialData } from "../data/types";

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

export type DataState =
  | { status: "loading" }
  | { status: "ready"; data: InitialData }
  | { status: "error"; message: string };

/** Everything that belongs to one group's game. Cleared by RESET ("Play again"). */
export interface GameState {
  teamName: string;
}

export interface AppState {
  screen: Screen;
  /** Where to go back to when admin is closed. */
  returnTo: FlowScreen;
  data: DataState;
  game: GameState;
}

export type Action =
  | { type: "NEXT" }
  | { type: "GOTO"; screen: FlowScreen }
  | { type: "RESET" }
  | { type: "OPEN_ADMIN" }
  | { type: "CLOSE_ADMIN" }
  | { type: "DATA_LOADING" }
  | { type: "DATA_LOADED"; data: InitialData }
  | { type: "DATA_FAILED"; message: string };

export const newGame = (): GameState => ({ teamName: "" });

export const initialState: AppState = {
  screen: "attract",
  returnTo: "attract",
  data: { status: "loading" },
  game: newGame(),
};

export function nextScreen(screen: FlowScreen): FlowScreen {
  const i = FLOW.indexOf(screen);
  return FLOW[(i + 1) % FLOW.length] ?? "attract";
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "NEXT": {
      if (state.screen === "admin") return state;
      const screen = nextScreen(state.screen);
      // Wrapping round to the attract screen means the previous group is done.
      return screen === "attract" ? { ...state, screen, game: newGame() } : { ...state, screen };
    }
    case "GOTO":
      return { ...state, screen: action.screen };
    case "RESET":
      return { ...state, screen: "attract", returnTo: "attract", game: newGame() };
    case "OPEN_ADMIN":
      if (state.screen === "admin") return state;
      return { ...state, screen: "admin", returnTo: state.screen };
    case "CLOSE_ADMIN":
      if (state.screen !== "admin") return state;
      return { ...state, screen: state.returnTo };
    case "DATA_LOADING":
      return { ...state, data: { status: "loading" } };
    case "DATA_LOADED":
      return { ...state, data: { status: "ready", data: action.data } };
    case "DATA_FAILED":
      return { ...state, data: { status: "error", message: action.message } };
  }
}
