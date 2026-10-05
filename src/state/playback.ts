// What the Simulate screen shows after replay step `index` (pure; no timing here).

import type { Replay, ReplayStep, Side } from "../engine";

export const SPEEDS = [1, 2, 4] as const;
export type Speed = (typeof SPEEDS)[number];

export type FixtureStatus = "waiting" | "playing" | "finished";

export interface PlayerView {
  /** Step index where this player's points landed (-1 = not yet). */
  revealedAt: number;
  /** For a team: replaced by an auto-sub (shown once the auto-sub step has happened). */
  subbedOutBy: number | null;
  /** For a team: came on as an auto-sub (shown once the auto-sub step has happened). */
  cameOnFor: number | null;
  /** Captain/vice bonus applied to this player for this team (once that step has happened). */
  doubled: boolean;
}

export interface PlaybackView {
  index: number;
  step: ReplayStep;
  score: { human: number; ai: number };
  fixtureStatus: FixtureStatus[];
  /** Index (into replay.fixtures) of the match being played or last finished; -1 before the first. */
  currentFixture: number;
  players: Record<Side, Map<number, PlayerView>>;
  finished: boolean;
}

export function viewAt(replay: Replay, index: number): PlaybackView {
  const i = Math.max(0, Math.min(index, replay.steps.length - 1));
  const fixtureStatus: FixtureStatus[] = replay.fixtures.map(() => "waiting");
  const players: Record<Side, Map<number, PlayerView>> = { human: new Map(), ai: new Map() };
  const view = (side: Side, id: number): PlayerView => {
    let v = players[side].get(id);
    if (!v) players[side].set(id, (v = { revealedAt: -1, subbedOutBy: null, cameOnFor: null, doubled: false }));
    return v;
  };
  let currentFixture = -1;
  for (let k = 0; k <= i; k++) {
    const s = replay.steps[k]!;
    switch (s.kind) {
      case "fixture-start":
        fixtureStatus[s.fixtureIndex] = "playing";
        currentFixture = s.fixtureIndex;
        break;
      case "fixture-end":
        fixtureStatus[s.fixtureIndex] = "finished";
        break;
      case "player":
        for (const side of ["human", "ai"] as const) if (s.teams[side]) view(side, s.playerId).revealedAt = k;
        break;
      case "captain-bonus":
        view(s.side, s.playerId).doubled = true;
        break;
      case "auto-sub":
        view(s.side, s.outId).subbedOutBy = s.inId;
        view(s.side, s.inId).cameOnFor = s.outId;
        break;
      case "vice-captain":
        view(s.side, s.viceId).doubled = true;
        break;
      case "final":
        break;
    }
  }
  const step = replay.steps[i]!;
  return { index: i, step, score: step.score, fixtureStatus, currentFixture, players, finished: step.kind === "final" };
}

/** How long to wait before moving past step `index` at the given speed. */
export const stepDelay = (replay: Replay, index: number, speed: Speed): number => Math.round((replay.steps[index]?.durationMs ?? 0) / speed);
