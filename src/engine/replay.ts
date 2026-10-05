// Turns the scoring engine's results into an ordered, deterministic replay of the gameweek.
//
// The replay only RE-TELLS what scoreTeam() already decided from real data: which players count, who
// was auto-subbed, who the active captain is, and every point. It invents nothing, uses no randomness,
// and treats both teams with the same code. Order:
//   - fixtures by kickoff time, then fixture id (only fixtures with a player from either team);
//   - inside a fixture: home club's players, then away club's, each by player id;
//     a starter's points land at their match, a captain's bonus right after (if the captain played),
//     bench players are shown but add nothing yet;
//   - players whose fixture isn't listed (e.g. a double gameweek) in an "Other matches" group;
//   - then, as in real FPL after the last match: auto-subs (engine order, your team then FantasyXI),
//     then a vice-captain's double if the captain didn't play.
// Every step carries both running scores; the last one equals the engine totals (assertReplayTotals).

import { explainPoints, isBigMoment, type PointsExplanation } from "./points";
import type { ScoreResult, ScoredPlayer } from "./score";
import type { EngineContext, FixtureResult, PlayerResult, Team } from "./types";

export type Side = "human" | "ai";
export const SIDES: readonly Side[] = ["human", "ai"];

export interface Pair {
  human: number;
  ai: number;
}

/** How a player in a step relates to one team. */
export interface PlayerInTeam {
  role: "starter" | "bench";
  /** 1-based bench order, for bench players. */
  benchOrder: number | null;
  /** Starter whose points count now (not later replaced by an auto-sub). */
  countsNow: boolean;
  /** Starter who didn't play: an auto-sub may replace them at the end. */
  didNotPlay: boolean;
  isCaptain: boolean;
  isVice: boolean;
}

interface Base {
  /** Points added by this step. */
  delta: Pair;
  /** Running totals after this step. */
  score: Pair;
  /** How long to show this step at 1x speed. */
  durationMs: number;
}

export type ReplayStep =
  | (Base & { kind: "fixture-start"; fixtureIndex: number; fixture: FixtureResult | null })
  | (Base & {
      kind: "player";
      fixtureIndex: number;
      playerId: number;
      points: number;
      minutes: number;
      explanation: PointsExplanation;
      teams: Partial<Record<Side, PlayerInTeam>>;
    })
  | (Base & { kind: "captain-bonus"; fixtureIndex: number; side: Side; playerId: number; points: number })
  | (Base & { kind: "fixture-end"; fixtureIndex: number; fixture: FixtureResult | null })
  | (Base & { kind: "auto-sub"; side: Side; outId: number; inId: number; points: number })
  | (Base & { kind: "vice-captain"; side: Side; captainId: number | null; viceId: number; points: number })
  | (Base & { kind: "final" });

/** A step before timing and running score are added (Omit applied to each kind of step). */
type StepDraft = ReplayStep extends infer S ? (S extends unknown ? Omit<S, "durationMs" | "score"> : never) : never;

export interface ReplayFixture {
  /** null = "Other matches" (a fixture not in the list, e.g. a double gameweek). */
  fixture: FixtureResult | null;
  playerIds: number[];
}

export interface Replay {
  fixtures: ReplayFixture[];
  steps: ReplayStep[];
  /** The scoring engine's totals (the replay must end on exactly these). */
  totals: Pair;
}

export interface ReplayInput {
  ctx: EngineContext;
  fixtures: readonly FixtureResult[];
  results: ReadonlyMap<number, PlayerResult>;
  human: { team: Team; score: ScoreResult };
  ai: { team: Team; score: ScoreResult };
  /** Target length of the whole replay at 1x (default 38 s). */
  targetMs?: number;
}

const ZERO_RESULT: Omit<PlayerResult, "id"> = {
  minutes: 0, points: 0, started: false, goals_scored: 0, assists: 0, clean_sheets: 0, goals_conceded: 0, own_goals: 0,
  penalties_saved: 0, penalties_missed: 0, yellow_cards: 0, red_cards: 0, saves: 0, bonus: 0, bps: 0, defensive_contribution: 0,
};

export function buildReplay(input: ReplayInput): Replay {
  const { ctx, results } = input;
  const sides = { human: input.human, ai: input.ai };
  const scored: Record<Side, Map<number, ScoredPlayer>> = {
    human: new Map(input.human.score.players.map((p) => [p.id, p])),
    ai: new Map(input.ai.score.players.map((p) => [p.id, p])),
  };

  // ---- Group every player of either team by fixture --------------------------------------
  const everyone = [...new Set([...scored.human.keys(), ...scored.ai.keys()])];
  const orderedFixtures = [...input.fixtures].sort((a, b) => a.kickoff.localeCompare(b.kickoff) || a.id - b.id);
  const fixtureIds = new Set(orderedFixtures.map((f) => f.id));
  const groups: ReplayFixture[] = [];
  for (const f of orderedFixtures) {
    const inFixture = everyone.filter((id) => ctx.players.get(id)?.fixture_id === f.id);
    if (inFixture.length === 0) continue;
    const club = (id: number) => ctx.players.get(id)!.team_id;
    const home = inFixture.filter((id) => club(id) === f.home_team_id).sort((a, b) => a - b);
    const away = inFixture.filter((id) => club(id) !== f.home_team_id).sort((a, b) => a - b);
    groups.push({ fixture: f, playerIds: [...home, ...away] });
  }
  const others = everyone.filter((id) => !fixtureIds.has(ctx.players.get(id)?.fixture_id ?? -1)).sort((a, b) => a - b);
  if (others.length > 0) groups.push({ fixture: null, playerIds: others });

  // ---- Build steps ----------------------------------------------------------------------
  const score: Pair = { human: 0, ai: 0 };
  const raw: (StepDraft & { score: Pair; weight: number })[] = [];
  const push = (step: StepDraft, weight: number) => {
    score.human += step.delta.human;
    score.ai += step.delta.ai;
    raw.push({ ...step, weight, score: { ...score } } as never);
  };
  const result = (id: number) => results.get(id) ?? { id, ...ZERO_RESULT };
  const captainPlayed = (s: Side) => {
    const sp = scored[s].get(sides[s].team.captainId ?? -1);
    return !!sp && sp.isActiveCaptain && sp.played;
  };

  groups.forEach((g, fixtureIndex) => {
    push({ kind: "fixture-start", fixtureIndex, fixture: g.fixture, delta: { human: 0, ai: 0 } }, 0.8);
    for (const playerId of g.playerIds) {
      const r = result(playerId);
      const explanation = explainPoints(ctx.players.get(playerId)!.position, r);
      const teams: Partial<Record<Side, PlayerInTeam>> = {};
      const delta: Pair = { human: 0, ai: 0 };
      for (const s of SIDES) {
        const sp = scored[s].get(playerId);
        if (!sp) continue;
        const countsNow = sp.role === "starter" && sp.counted;
        teams[s] = {
          role: sp.role,
          benchOrder: sp.benchOrder === null ? null : sp.benchOrder + 1,
          countsNow,
          didNotPlay: sp.role === "starter" && !sp.played,
          isCaptain: sp.isCaptain,
          isVice: sp.isViceCaptain,
        };
        if (countsNow) delta[s] = sp.points;
      }
      const counts = SIDES.some((s) => teams[s]?.countsNow);
      const weight = !counts ? 0.45 : isBigMoment(explanation) ? 1.6 : explanation.total >= 3 ? 0.95 : 0.6;
      push({ kind: "player", fixtureIndex, playerId, points: r.points, minutes: r.minutes, explanation, teams, delta }, weight);
      // Captain's bonus right after their own points (only when the captain actually played).
      for (const s of SIDES) {
        if (sides[s].team.captainId === playerId && captainPlayed(s) && sides[s].score.captainBonus !== 0) {
          const pts = sides[s].score.captainBonus;
          push({ kind: "captain-bonus", fixtureIndex, side: s, playerId, points: pts, delta: { human: s === "human" ? pts : 0, ai: s === "ai" ? pts : 0 } }, 1.5);
        }
      }
    }
    push({ kind: "fixture-end", fixtureIndex, fixture: g.fixture, delta: { human: 0, ai: 0 } }, 0.9);
  });

  // ---- After the last match: auto-subs, then a vice-captain's double ----------------------
  for (const s of SIDES) {
    for (const sub of sides[s].score.autoSubs) {
      const pts = scored[s].get(sub.in)?.points ?? 0;
      push({ kind: "auto-sub", side: s, outId: sub.out, inId: sub.in, points: pts, delta: { human: s === "human" ? pts : 0, ai: s === "ai" ? pts : 0 } }, 1.3);
    }
  }
  for (const s of SIDES) {
    const { score: sc, team } = sides[s];
    if (sc.captainBonus !== 0 && !captainPlayed(s)) {
      push(
        {
          kind: "vice-captain",
          side: s,
          captainId: team.captainId,
          viceId: sc.activeCaptainId!,
          points: sc.captainBonus,
          delta: { human: s === "human" ? sc.captainBonus : 0, ai: s === "ai" ? sc.captainBonus : 0 },
        },
        1.5,
      );
    }
  }
  push({ kind: "final", delta: { human: 0, ai: 0 } }, 0.6);

  // ---- Timing: scale weights to the target length -----------------------------------------
  const target = input.targetMs ?? 38_000;
  const totalWeight = raw.reduce((s, x) => s + x.weight, 0);
  const steps = raw.map(({ weight, ...step }) => ({ ...step, durationMs: Math.max(220, Math.round((weight / totalWeight) * target)) })) as ReplayStep[];

  return { fixtures: groups, steps, totals: { human: input.human.score.total, ai: input.ai.score.total } };
}

/** Throws if the replay's final running score differs from the engine totals (never expected). */
export function assertReplayTotals(replay: Replay): void {
  const last = replay.steps.at(-1)!.score;
  if (last.human !== replay.totals.human || last.ai !== replay.totals.ai) {
    throw new Error(
      `Replay totals ${last.human}/${last.ai} differ from engine totals ${replay.totals.human}/${replay.totals.ai}.`,
    );
  }
}

/** Index of the last step of each fixture group (for "skip"/progress). */
export function fixtureEndIndexes(replay: Replay): number[] {
  return replay.steps.flatMap((s, i) => (s.kind === "fixture-end" ? [i] : []));
}
