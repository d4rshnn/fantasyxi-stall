// Runtime shape checks for the static JSON. Each parser either returns typed data or throws a
// DataShapeError naming the file and the exact field, e.g. "pregame.json: players[12].price ...".

import {
  POSITIONS,
  type AiTeam,
  type Fixture,
  type FixtureResult,
  type Manifest,
  type ManifestGameweek,
  type Player,
  type PlayerResult,
  type Position,
  type Prediction,
  type Pregame,
  type Reveal,
  type Rules,
  type TeamInfo,
} from "./types";

export const SUPPORTED_SCHEMA_VERSION = 1;

export class DataShapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DataShapeError";
  }
}

type Obj = Record<string, unknown>;

function fail(path: string, expected: string, got: unknown): never {
  const shown = got === undefined ? "nothing" : JSON.stringify(got)?.slice(0, 40);
  throw new DataShapeError(`${path} should be ${expected} (got ${shown}).`);
}

function obj(v: unknown, path: string): Obj {
  if (typeof v !== "object" || v === null || Array.isArray(v)) fail(path, "an object", v);
  return v as Obj;
}

function int(v: unknown, path: string): number {
  if (typeof v !== "number" || !Number.isInteger(v)) fail(path, "a whole number", v);
  return v as number;
}

function num(v: unknown, path: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) fail(path, "a number", v);
  return v as number;
}

function str(v: unknown, path: string): string {
  if (typeof v !== "string") fail(path, "text", v);
  return v as string;
}

function bool(v: unknown, path: string): boolean {
  if (typeof v !== "boolean") fail(path, "true or false", v);
  return v as boolean;
}

function arr<T>(v: unknown, path: string, item: (x: unknown, p: string) => T): T[] {
  if (!Array.isArray(v)) fail(path, "a list", v);
  return (v as unknown[]).map((x, i) => item(x, `${path}[${i}]`));
}

function oneOf<T extends string>(v: unknown, path: string, options: readonly T[]): T {
  if (typeof v !== "string" || !options.includes(v as T)) fail(path, `one of ${options.join("/")}`, v);
  return v as T;
}

function perPosition<T>(v: unknown, path: string, item: (x: unknown, p: string) => T): Record<Position, T> {
  const o = obj(v, path);
  const out = {} as Record<Position, T>;
  for (const pos of POSITIONS) out[pos] = item(o[pos], `${path}.${pos}`);
  return out;
}

function checkSchema(o: Obj, file: string): void {
  if (o.schema_version !== SUPPORTED_SCHEMA_VERSION) {
    throw new DataShapeError(
      `${file}: unsupported schema_version ${JSON.stringify(o.schema_version)} (expected ${SUPPORTED_SCHEMA_VERSION}).`,
    );
  }
}

function uniqueIds(items: { id: number }[], path: string): void {
  const seen = new Set<number>();
  for (const { id } of items) {
    if (seen.has(id)) throw new DataShapeError(`${path}: id ${id} appears more than once.`);
    seen.add(id);
  }
}

const intList = (v: unknown, p: string) => arr(v, p, int);

// ---- manifest.json -------------------------------------------------------------

export function parseManifest(json: unknown, file = "manifest.json"): Manifest {
  const o = obj(json, file);
  checkSchema(o, file);
  const gameweeks = arr(o.gameweeks, `${file}: gameweeks`, (g, p): ManifestGameweek => {
    const x = obj(g, p);
    return {
      gameweek: int(x.gameweek, `${p}.gameweek`),
      label: str(x.label, `${p}.label`),
      role: oneOf(x.role, `${p}.role`, ["challenge", "spare"] as const),
      pregame: str(x.pregame, `${p}.pregame`),
      reveal: str(x.reveal, `${p}.reveal`),
      ai_target_score: int(x.ai_target_score, `${p}.ai_target_score`),
    };
  });
  const manifest: Manifest = {
    schema_version: SUPPORTED_SCHEMA_VERSION,
    data_version: str(o.data_version, `${file}: data_version`),
    season: str(o.season, `${file}: season`),
    default_gameweek: int(o.default_gameweek, `${file}: default_gameweek`),
    gameweeks,
  };
  if (!gameweeks.some((g) => g.gameweek === manifest.default_gameweek)) {
    throw new DataShapeError(`${file}: default_gameweek ${manifest.default_gameweek} is not in gameweeks.`);
  }
  return manifest;
}

// ---- pregame.json --------------------------------------------------------------

function parseRules(v: unknown, p: string): Rules {
  const o = obj(v, p);
  const rules: Rules = {
    budget: int(o.budget, `${p}.budget`),
    squad_size: int(o.squad_size, `${p}.squad_size`),
    squad_positions: perPosition(o.squad_positions, `${p}.squad_positions`, int),
    max_per_club: int(o.max_per_club, `${p}.max_per_club`),
    xi_size: int(o.xi_size, `${p}.xi_size`),
    xi_limits: perPosition(o.xi_limits, `${p}.xi_limits`, (x, q) => {
      const [lo, hi] = arr(x, q, int);
      if (lo === undefined || hi === undefined || lo > hi) fail(q, "[min, max]", x);
      return [lo, hi] as [number, number];
    }),
    bench_size: int(o.bench_size, `${p}.bench_size`),
    captain_multiplier: int(o.captain_multiplier, `${p}.captain_multiplier`),
  };
  const total = POSITIONS.reduce((s, pos) => s + rules.squad_positions[pos], 0);
  if (total !== rules.squad_size) throw new DataShapeError(`${p}: squad_positions add up to ${total}, not squad_size.`);
  if (rules.xi_size + rules.bench_size !== rules.squad_size) {
    throw new DataShapeError(`${p}: xi_size + bench_size must equal squad_size.`);
  }
  return rules;
}

const parseTeamInfo = (v: unknown, p: string): TeamInfo => {
  const o = obj(v, p);
  return { id: int(o.id, `${p}.id`), name: str(o.name, `${p}.name`), short_name: str(o.short_name, `${p}.short_name`) };
};

const parseFixture = (v: unknown, p: string): Fixture => {
  const o = obj(v, p);
  return {
    id: int(o.id, `${p}.id`),
    kickoff: str(o.kickoff, `${p}.kickoff`),
    home_team_id: int(o.home_team_id, `${p}.home_team_id`),
    away_team_id: int(o.away_team_id, `${p}.away_team_id`),
  };
};

const parsePlayer = (v: unknown, p: string): Player => {
  const o = obj(v, p);
  return {
    id: int(o.id, `${p}.id`),
    name: str(o.name, `${p}.name`),
    position: oneOf(o.position, `${p}.position`, POSITIONS),
    team_id: int(o.team_id, `${p}.team_id`),
    price: int(o.price, `${p}.price`),
    fixture_id: int(o.fixture_id, `${p}.fixture_id`),
    opponent_team_id: int(o.opponent_team_id, `${p}.opponent_team_id`),
    home: bool(o.home, `${p}.home`),
  };
};

export function parsePregame(json: unknown, file = "pregame.json"): Pregame {
  const o = obj(json, file);
  checkSchema(o, file);
  const pregame: Pregame = {
    schema_version: SUPPORTED_SCHEMA_VERSION,
    season: str(o.season, `${file}: season`),
    gameweek: int(o.gameweek, `${file}: gameweek`),
    rules: parseRules(o.rules, `${file}: rules`),
    teams: arr(o.teams, `${file}: teams`, parseTeamInfo),
    fixtures: arr(o.fixtures, `${file}: fixtures`, parseFixture),
    players: arr(o.players, `${file}: players`, parsePlayer),
  };
  if (pregame.players.length === 0) throw new DataShapeError(`${file}: players is empty.`);
  uniqueIds(pregame.teams, `${file}: teams`);
  uniqueIds(pregame.players, `${file}: players`);
  const teamIds = new Set(pregame.teams.map((t) => t.id));
  for (const pl of pregame.players) {
    if (!teamIds.has(pl.team_id)) throw new DataShapeError(`${file}: player ${pl.id} has unknown team ${pl.team_id}.`);
  }
  return pregame;
}

// ---- reveal.json ---------------------------------------------------------------

const parseFixtureResult = (v: unknown, p: string): FixtureResult => {
  const o = obj(v, p);
  return { ...parseFixture(v, p), home_score: int(o.home_score, `${p}.home_score`), away_score: int(o.away_score, `${p}.away_score`) };
};

const RESULT_INT_FIELDS = [
  "minutes", "points", "goals_scored", "assists", "clean_sheets", "goals_conceded", "own_goals",
  "penalties_saved", "penalties_missed", "yellow_cards", "red_cards", "saves", "bonus", "bps",
  "defensive_contribution",
] as const;

const parsePlayerResult = (v: unknown, p: string): PlayerResult => {
  const o = obj(v, p);
  const out = { id: int(o.id, `${p}.id`), started: bool(o.started, `${p}.started`) } as PlayerResult;
  for (const f of RESULT_INT_FIELDS) out[f] = int(o[f], `${p}.${f}`);
  return out;
};

function parseAiTeam(v: unknown, p: string): AiTeam {
  const o = obj(v, p);
  const b = obj(o.breakdown, `${p}.breakdown`);
  const pl = obj(o.pipeline, `${p}.pipeline`);
  const act = obj(pl.ppo_action, `${p}.pipeline.ppo_action`);
  return {
    squad: intList(o.squad, `${p}.squad`),
    starting: intList(o.starting, `${p}.starting`),
    bench: intList(o.bench, `${p}.bench`),
    captain_id: int(o.captain_id, `${p}.captain_id`),
    vice_captain_id: int(o.vice_captain_id, `${p}.vice_captain_id`),
    formation: str(o.formation, `${p}.formation`),
    squad_cost: int(o.squad_cost, `${p}.squad_cost`),
    total_points: int(o.total_points, `${p}.total_points`),
    breakdown: {
      starting_points: int(b.starting_points, `${p}.breakdown.starting_points`),
      captain_bonus: int(b.captain_bonus, `${p}.breakdown.captain_bonus`),
      active_captain_id: int(b.active_captain_id, `${p}.breakdown.active_captain_id`),
      auto_subs: arr(b.auto_subs, `${p}.breakdown.auto_subs`, (s, q) => {
        const x = obj(s, q);
        return { out: int(x.out, `${q}.out`), in: int(x.in, `${q}.in`) };
      }),
    },
    pipeline: {
      model: str(pl.model, `${p}.pipeline.model`),
      chip_used: str(pl.chip_used, `${p}.pipeline.chip_used`),
      hits: int(pl.hits, `${p}.pipeline.hits`),
      transfers: int(pl.transfers, `${p}.pipeline.transfers`),
      squad_equals_fresh_milp_squad: bool(pl.squad_equals_fresh_milp_squad, `${p}.pipeline.squad_equals_fresh_milp_squad`),
      ppo_action: {
        aggressiveness: int(act.aggressiveness, `${p}.pipeline.ppo_action.aggressiveness`),
        budget_level: int(act.budget_level, `${p}.pipeline.ppo_action.budget_level`),
        position_bias: int(act.position_bias, `${p}.pipeline.ppo_action.position_bias`),
        chip_requested: str(act.chip_requested, `${p}.pipeline.ppo_action.chip_requested`),
      },
      candidate_pool_size: perPosition(pl.candidate_pool_size, `${p}.pipeline.candidate_pool_size`, int),
    },
  };
}

export function parseReveal(json: unknown, file = "reveal.json"): Reveal {
  const o = obj(json, file);
  checkSchema(o, file);
  const bm = obj(o.benchmarks, `${file}: benchmarks`);
  const reveal: Reveal = {
    schema_version: SUPPORTED_SCHEMA_VERSION,
    season: str(o.season, `${file}: season`),
    gameweek: int(o.gameweek, `${file}: gameweek`),
    benchmarks: {
      fpl_average: int(bm.fpl_average, `${file}: benchmarks.fpl_average`),
      fpl_highest: int(bm.fpl_highest, `${file}: benchmarks.fpl_highest`),
    },
    fixtures: arr(o.fixtures, `${file}: fixtures`, parseFixtureResult),
    ai: parseAiTeam(o.ai, `${file}: ai`),
    predictions: arr(o.predictions, `${file}: predictions`, (v, p): Prediction => {
      const x = obj(v, p);
      return {
        id: int(x.id, `${p}.id`),
        predicted_points: num(x.predicted_points, `${p}.predicted_points`),
        source: str(x.source, `${p}.source`),
      };
    }),
    results: arr(o.results, `${file}: results`, parsePlayerResult),
  };
  uniqueIds(reveal.results, `${file}: results`);
  return reveal;
}
