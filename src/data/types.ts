// Shapes of the static JSON in public/data.
// Only the pre-game files are typed here; reveal.json types arrive with the engine (S3).

export type Position = "GK" | "DEF" | "MID" | "FWD";

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

export interface Rules {
  budget: number; // tenths of £m (1000 = £100.0m)
  squad_size: number;
  squad_positions: Record<Position, number>;
  max_per_club: number;
  xi_size: number;
  xi_limits: Record<Position, [number, number]>;
  bench_size: number;
  captain_multiplier: number;
}

export interface Team {
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
  teams: Team[];
  fixtures: Fixture[];
  players: Player[];
}

/** Everything the app needs before the team is locked. */
export interface InitialData {
  manifest: Manifest;
  gameweek: ManifestGameweek;
  pregame: Pregame;
}
