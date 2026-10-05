// Types for the exported static JSON (public/data) and for teams.
// Pure data shapes: no React, no DOM, no network. Parsing/shape checks live in parse.ts.

export type Position = "GK" | "DEF" | "MID" | "FWD";
export const POSITIONS: readonly Position[] = ["GK", "DEF", "MID", "FWD"];

// ---- manifest.json -------------------------------------------------------------

export interface ManifestGameweek {
  gameweek: number;
  label: string;
  role: "challenge" | "spare";
  pregame: string; // path relative to the data folder, e.g. "gw37/pregame.json"
  reveal: string; // loaded only after the team is locked (spoiler guard, not security)
  ai_target_score: number;
}

export interface Manifest {
  schema_version: number;
  data_version: string;
  season: string;
  default_gameweek: number;
  gameweeks: ManifestGameweek[];
}

// ---- pregame.json --------------------------------------------------------------

export interface Rules {
  budget: number; // tenths of £m (1000 = £100.0m)
  squad_size: number;
  squad_positions: Record<Position, number>;
  max_per_club: number;
  xi_size: number;
  xi_limits: Record<Position, [number, number]>; // [min, max] starters per position
  bench_size: number;
  captain_multiplier: number;
}

export interface TeamInfo {
  id: number;
  name: string;
  short_name: string;
}

export interface Fixture {
  id: number;
  kickoff: string;
  home_team_id: number;
  away_team_id: number;
}

export interface Player {
  id: number;
  name: string;
  position: Position;
  team_id: number;
  price: number; // tenths of £m
  fixture_id: number;
  opponent_team_id: number;
  home: boolean;
}

export interface Pregame {
  schema_version: number;
  season: string;
  gameweek: number;
  rules: Rules;
  teams: TeamInfo[];
  fixtures: Fixture[];
  players: Player[];
}

// ---- reveal.json ---------------------------------------------------------------

export interface FixtureResult extends Fixture {
  home_score: number;
  away_score: number;
}

export interface PlayerResult {
  id: number;
  minutes: number;
  points: number;
  started: boolean;
  goals_scored: number;
  assists: number;
  clean_sheets: number;
  goals_conceded: number;
  own_goals: number;
  penalties_saved: number;
  penalties_missed: number;
  yellow_cards: number;
  red_cards: number;
  saves: number;
  bonus: number;
  bps: number;
  defensive_contribution: number;
}

export interface AiTeam {
  squad: number[];
  starting: number[];
  bench: number[]; // order matters (auto-sub priority)
  captain_id: number;
  vice_captain_id: number;
  formation: string;
  squad_cost: number;
  total_points: number;
  breakdown: {
    starting_points: number;
    captain_bonus: number;
    active_captain_id: number;
    auto_subs: { out: number; in: number }[];
  };
  pipeline: {
    model: string;
    chip_used: string;
    hits: number;
    transfers: number;
    squad_equals_fresh_milp_squad: boolean;
    ppo_action: { aggressiveness: number; budget_level: number; position_bias: number; chip_requested: string };
    candidate_pool_size: Record<Position, number>;
  };
}

export interface Prediction {
  id: number;
  predicted_points: number;
  /** "bilstm" | "bilstm_other_season:<season>" | "xgboost_fallback" (see docs/DATA_SOURCE.md) */
  source: string;
}

export interface Reveal {
  schema_version: number;
  season: string;
  gameweek: number;
  benchmarks: { fpl_average: number; fpl_highest: number };
  fixtures: FixtureResult[];
  ai: AiTeam;
  predictions: Prediction[];
  results: PlayerResult[];
}

// ---- Teams -----------------------------------------------------------------------

/** One spot on the pitch or bench while building. Bench slots are in bench (auto-sub) order. */
export interface Slot {
  kind: "xi" | "bench";
  position: Position;
  playerId: number | null;
}

/** A team being built: a formation such as "4-4-2" plus 11 XI slots and 4 ordered bench slots. */
export interface Lineup {
  formation: string;
  slots: Slot[];
}

/** A finished team, used by validation and scoring. The squad is starting + bench. */
export interface Team {
  starting: number[];
  bench: number[]; // ordered: first = first substitute
  captainId: number | null;
  viceCaptainId: number | null;
}

/** Lookup tables built once from pregame.json and passed to engine functions. */
export interface EngineContext {
  rules: Rules;
  players: ReadonlyMap<number, Player>;
  teams: ReadonlyMap<number, TeamInfo>;
  /** Players of each position, sorted by price then id (cheapest first). */
  byPosition: Readonly<Record<Position, readonly Player[]>>;
}
