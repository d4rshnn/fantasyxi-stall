// Explains a player's REAL gameweek points as labelled events ("Goal +5", "Clean sheet +4", ...).
//
// This never changes any total: the points that count always come from the exported real results
// (and the scoring engine). The table below is FPL's 2025-26 scoring, used only to label events.
// If a player's labelled events don't add up exactly to their real points, `addsUp` is false and the
// UI must show the events without per-event points (only the real total). For GW37/GW38 every
// player adds up (checked in points.test.ts).

import type { PlayerResult, Position } from "./types";

export type PointEventKind =
  | "played60"
  | "played"
  | "goal"
  | "assist"
  | "clean_sheet"
  | "goals_conceded"
  | "saves"
  | "pen_saved"
  | "pen_missed"
  | "own_goal"
  | "yellow"
  | "red"
  | "bonus"
  | "defensive";

export interface PointItem {
  kind: PointEventKind;
  label: string;
  count: number;
  points: number;
}

export interface PointsExplanation {
  items: PointItem[];
  /** The player's real points (from the data). */
  total: number;
  /** True if the labelled items add up exactly to `total`. */
  addsUp: boolean;
}

const GOAL: Record<Position, number> = { GK: 10, DEF: 6, MID: 5, FWD: 4 };
const CLEAN_SHEET: Record<Position, number> = { GK: 4, DEF: 4, MID: 1, FWD: 0 };
const DEFENSIVE_THRESHOLD: Record<Position, number> = { GK: Infinity, DEF: 10, MID: 12, FWD: 12 };

const times = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : `${n} ${many}`);

export function explainPoints(position: Position, r: Pick<PlayerResult, Exclude<keyof PlayerResult, "id" | "started">>): PointsExplanation {
  const items: PointItem[] = [];
  const add = (kind: PointEventKind, label: string, count: number, points: number) => {
    if (count > 0 && points !== 0) items.push({ kind, label, count, points });
  };
  if (r.minutes >= 60) add("played60", "Played 60+ min", 1, 2);
  else if (r.minutes > 0) add("played", "Played under 60 min", 1, 1);
  add("goal", times(r.goals_scored, "Goal"), r.goals_scored, r.goals_scored * GOAL[position]);
  add("assist", times(r.assists, "Assist"), r.assists, r.assists * 3);
  add("clean_sheet", "Clean sheet", r.clean_sheets, r.clean_sheets * CLEAN_SHEET[position]);
  if (position === "GK" || position === "DEF") {
    add("goals_conceded", `Conceded ${r.goals_conceded}`, r.goals_conceded, -Math.floor(r.goals_conceded / 2));
  }
  if (position === "GK") add("saves", `${r.saves} saves`, r.saves, Math.floor(r.saves / 3));
  add("pen_saved", times(r.penalties_saved, "Penalty saved", "penalties saved"), r.penalties_saved, r.penalties_saved * 5);
  add("pen_missed", times(r.penalties_missed, "Penalty missed", "penalties missed"), r.penalties_missed, -2 * r.penalties_missed);
  add("own_goal", times(r.own_goals, "Own goal"), r.own_goals, -2 * r.own_goals);
  add("yellow", "Yellow card", r.yellow_cards, -r.yellow_cards);
  add("red", "Red card", r.red_cards, -3 * r.red_cards);
  add("defensive", "Defensive contribution", r.defensive_contribution >= DEFENSIVE_THRESHOLD[position] ? 1 : 0, 2);
  add("bonus", "Bonus", r.bonus, r.bonus);
  const sum = items.reduce((s, i) => s + i.points, 0);
  return { items, total: r.points, addsUp: sum === r.points };
}

/** A big moment slows the replay down a little (goals, assists, red cards, penalties, hauls). */
export function isBigMoment(e: PointsExplanation): boolean {
  return e.total >= 6 || e.total <= -2 || e.items.some((i) => ["goal", "assist", "red", "pen_saved", "pen_missed", "own_goal"].includes(i.kind));
}
