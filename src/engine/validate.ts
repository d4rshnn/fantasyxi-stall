// Legality checks with plain-language reasons, budget status, and "can this player go in this spot?".

import { cheapestFill, rankInClubGroup } from "./budget";
import { clubName, formatPrice, formationName, isValidXICounts, POSITION_NAMES, zeroCounts, type PositionCounts } from "./rules";
import { squadOf } from "./team";
import { POSITIONS, type EngineContext, type Lineup, type Player, type Team } from "./types";

// ---- Finished team -------------------------------------------------------------

export type IssueCode =
  | "xi-size"
  | "bench-size"
  | "unknown-player"
  | "duplicate"
  | "squad-positions"
  | "formation"
  | "club-limit"
  | "budget"
  | "no-captain"
  | "no-vice"
  | "captain-not-starter"
  | "vice-not-starter"
  | "captain-is-vice";

export interface Issue {
  code: IssueCode;
  message: string;
}

const plural = (n: number, pos: keyof typeof POSITION_NAMES) => (n === 1 ? POSITION_NAMES[pos].one : POSITION_NAMES[pos].many);

/** Every rule the team breaks, in plain words. An empty list means the team is legal. */
export function validateTeam(team: Team, ctx: EngineContext): Issue[] {
  const { rules } = ctx;
  const issues: Issue[] = [];
  const add = (code: IssueCode, message: string) => issues.push({ code, message });

  if (team.starting.length !== rules.xi_size) {
    add("xi-size", `Pick ${rules.xi_size} starters (you have ${team.starting.length}).`);
  }
  if (team.bench.length !== rules.bench_size) {
    add("bench-size", `Pick ${rules.bench_size} bench players (you have ${team.bench.length}).`);
  }

  const squad = squadOf(team);
  const seen = new Set<number>();
  for (const id of squad) {
    const pl = ctx.players.get(id);
    if (!pl) add("unknown-player", `Unknown player (id ${id}).`);
    else if (seen.has(id)) add("duplicate", `${pl.name} is in your team twice.`);
    seen.add(id);
  }
  const known = [...new Set(squad)].map((id) => ctx.players.get(id)).filter((p): p is Player => !!p);

  // Squad position counts (2/5/5/3).
  const squadCounts = countPositions(known);
  for (const pos of POSITIONS) {
    const need = rules.squad_positions[pos];
    if (squadCounts[pos] !== need) {
      add("squad-positions", `You need exactly ${need} ${plural(need, pos)} in your squad (you have ${squadCounts[pos]}).`);
    }
  }

  // Starting XI formation limits.
  const xiPlayers = team.starting.map((id) => ctx.players.get(id)).filter((p): p is Player => !!p);
  const xiCounts = countPositions(xiPlayers);
  if (team.starting.length === rules.xi_size && !isValidXICounts(xiCounts, rules)) {
    for (const pos of POSITIONS) {
      const [lo, hi] = rules.xi_limits[pos];
      if (xiCounts[pos] < lo || xiCounts[pos] > hi) {
        const range = lo === hi ? `exactly ${lo}` : `${lo} to ${hi}`;
        add("formation", `Your starting XI needs ${range} ${plural(hi, pos)} (you have ${xiCounts[pos]}).`);
      }
    }
  }

  // Max per club.
  const perClub = new Map<number, number>();
  for (const p of known) perClub.set(p.team_id, (perClub.get(p.team_id) ?? 0) + 1);
  for (const [club, n] of [...perClub].sort((a, b) => a[0] - b[0])) {
    if (n > rules.max_per_club) {
      add("club-limit", `Max ${rules.max_per_club} players from one club (you have ${n} from ${clubName(ctx, club)}).`);
    }
  }

  // Budget.
  const cost = known.reduce((s, p) => s + p.price, 0);
  if (cost > rules.budget) add("budget", `Over budget by ${formatPrice(cost - rules.budget)}.`);

  // Captain and vice.
  const starters = new Set(team.starting);
  if (team.captainId === null) add("no-captain", "Pick a captain.");
  else if (!starters.has(team.captainId)) add("captain-not-starter", "Your captain must be in the starting XI.");
  if (team.viceCaptainId === null) add("no-vice", "Pick a vice-captain.");
  else if (!starters.has(team.viceCaptainId)) add("vice-not-starter", "Your vice-captain must be in the starting XI.");
  if (team.captainId !== null && team.captainId === team.viceCaptainId) {
    add("captain-is-vice", "Captain and vice-captain must be different players.");
  }
  return issues;
}

export function countPositions(players: readonly Player[]): PositionCounts {
  const c = zeroCounts();
  for (const p of players) c[p.position]++;
  return c;
}

/** "3-4-3" for a team's starters (unknown ids ignored). */
export function teamFormation(team: Team, ctx: EngineContext): string {
  return formationName(countPositions(team.starting.map((id) => ctx.players.get(id)).filter((p): p is Player => !!p)));
}

// ---- Lineup being built ------------------------------------------------------------

interface LineupState {
  taken: Set<number>;
  clubCounts: Map<number, number>;
  spent: number;
  /** Empty slots per position. */
  needs: PositionCounts;
  emptyCount: number;
}

function lineupState(lineup: Lineup, ctx: EngineContext, clearSlot?: number): LineupState {
  const s: LineupState = { taken: new Set(), clubCounts: new Map(), spent: 0, needs: zeroCounts(), emptyCount: 0 };
  lineup.slots.forEach((slot, i) => {
    const pl = i === clearSlot || slot.playerId === null ? undefined : ctx.players.get(slot.playerId);
    if (!pl) {
      s.needs[slot.position]++;
      s.emptyCount++;
      return;
    }
    s.taken.add(pl.id);
    s.clubCounts.set(pl.team_id, (s.clubCounts.get(pl.team_id) ?? 0) + 1);
    s.spent += pl.price;
  });
  return s;
}

export interface BudgetStatus {
  /** Money spent on picked players (tenths of £m). */
  spent: number;
  /** Budget minus spent. */
  remaining: number;
  /** Cheapest legal cost of filling every empty slot (bench included); null if impossible. */
  reservedForEmpty: number | null;
  /** Remaining minus reserved: the extra you can spend above the cheapest fill. Null if impossible. */
  freeToSpend: number | null;
  emptySlots: number;
}

export function budgetStatus(lineup: Lineup, ctx: EngineContext): BudgetStatus {
  const s = lineupState(lineup, ctx);
  const remaining = ctx.rules.budget - s.spent;
  const reserved = cheapestFill(ctx, { needs: s.needs, taken: s.taken, clubCounts: s.clubCounts });
  return {
    spent: s.spent,
    remaining,
    reservedForEmpty: reserved,
    freeToSpend: reserved === null ? null : remaining - reserved,
    emptySlots: s.emptyCount,
  };
}

/** True if the empty slots can still be filled legally within budget. */
export function isCompletable(lineup: Lineup, ctx: EngineContext): boolean {
  const b = budgetStatus(lineup, ctx);
  return b.freeToSpend !== null && b.freeToSpend >= 0;
}

export type AddBlock = "unknown-player" | "wrong-position" | "already-in-team" | "club-limit" | "too-expensive" | "reserve" | "impossible";

export type AddCheck = { ok: true } | { ok: false; code: AddBlock; reason: string };

const spots = (n: number) => `${n} other empty ${n === 1 ? "spot" : "spots"}`;

/** Checks the non-budget rules for putting `pl` into the (cleared) slot. */
function basicCheck(pl: Player | undefined, slotPosition: Player["position"], s: LineupState, ctx: EngineContext): AddCheck | null {
  if (!pl) return { ok: false, code: "unknown-player", reason: "Unknown player." };
  if (pl.position !== slotPosition) {
    return { ok: false, code: "wrong-position", reason: `This spot is for a ${POSITION_NAMES[slotPosition].one}.` };
  }
  if (s.taken.has(pl.id)) return { ok: false, code: "already-in-team", reason: "Already in your team." };
  const max = ctx.rules.max_per_club;
  if ((s.clubCounts.get(pl.team_id) ?? 0) >= max) {
    return { ok: false, code: "club-limit", reason: `Max ${max} players from one club (you already have ${max} from ${clubName(ctx, pl.team_id)}).` };
  }
  return null;
}

function budgetCheck(pl: Player, remaining: number, fill: number | null, otherEmpty: number, ctx: EngineContext): AddCheck {
  if (pl.price > remaining) {
    return { ok: false, code: "too-expensive", reason: `Too expensive: you have ${formatPrice(remaining)} left.` };
  }
  if (fill === null) {
    return {
      ok: false,
      code: "impossible",
      reason: `Picking this player would leave no legal way to fill your ${spots(otherEmpty)} (max ${ctx.rules.max_per_club} per club).`,
    };
  }
  if (pl.price + fill > remaining) {
    return { ok: false, code: "reserve", reason: `Not enough money: keep ${formatPrice(fill)} for your ${spots(otherEmpty)}.` };
  }
  return { ok: true };
}

function withPlayer(s: LineupState, pl: Player, slotPosition: Player["position"]) {
  const needs = { ...s.needs, [slotPosition]: s.needs[slotPosition] - 1 };
  const clubCounts = new Map(s.clubCounts).set(pl.team_id, (s.clubCounts.get(pl.team_id) ?? 0) + 1);
  return { needs, clubCounts };
}

/** Can `playerId` go into slot `slotIndex`? If the slot already holds someone, this is a swap.
 *  Allowed only if the rest of the squad can still be completed legally within budget. */
export function canAddPlayer(lineup: Lineup, slotIndex: number, playerId: number, ctx: EngineContext): AddCheck {
  const slot = lineup.slots[slotIndex];
  if (!slot) throw new Error(`No slot ${slotIndex}`);
  const s = lineupState(lineup, ctx, slotIndex);
  const pl = ctx.players.get(playerId);
  const basic = basicCheck(pl, slot.position, s, ctx);
  if (basic) return basic;
  const { needs, clubCounts } = withPlayer(s, pl!, slot.position);
  const fill = cheapestFill(ctx, { needs, taken: s.taken, clubCounts, exclude: pl!.id });
  return budgetCheck(pl!, ctx.rules.budget - s.spent, fill, s.emptyCount - 1, ctx);
}

/** A reusable checker for one slot: same answers as canAddPlayer, but shares work between players
 *  of the same club, so checking many candidates (player picker, auto-complete) stays fast. */
export function slotChecker(lineup: Lineup, slotIndex: number, ctx: EngineContext): (playerId: number) => AddCheck {
  const slot = lineup.slots[slotIndex];
  if (!slot) throw new Error(`No slot ${slotIndex}`);
  const s = lineupState(lineup, ctx, slotIndex);
  const remaining = ctx.rules.budget - s.spent;
  const perClub = new Map<number, number | null>();

  return (playerId) => {
    const pl = ctx.players.get(playerId);
    const basic = basicCheck(pl, slot.position, s, ctx);
    if (basic) return basic;
    if (pl!.price > remaining) return budgetCheck(pl!, remaining, 0, s.emptyCount - 1, ctx);
    const { needs, clubCounts } = withPlayer(s, pl!, slot.position);
    // cheapestFill only ever uses the first min(need, allowance) available players of a club+position.
    // If this player ranks beyond that, leaving them "available" can't change the answer, so share it.
    const usable = Math.min(needs[pl!.position], ctx.rules.max_per_club - (clubCounts.get(pl!.team_id) ?? 0));
    let fill: number | null;
    if (rankInClubGroup(ctx, pl!, s.taken) >= usable) {
      if (!perClub.has(pl!.team_id)) perClub.set(pl!.team_id, cheapestFill(ctx, { needs, taken: s.taken, clubCounts }));
      fill = perClub.get(pl!.team_id)!;
    } else {
      fill = cheapestFill(ctx, { needs, taken: s.taken, clubCounts, exclude: pl!.id });
    }
    return budgetCheck(pl!, remaining, fill, s.emptyCount - 1, ctx);
  };
}

/** canAddPlayer for every player of the slot's position (for the player picker). */
export function checkCandidates(lineup: Lineup, slotIndex: number, ctx: EngineContext): Map<number, AddCheck> {
  const check = slotChecker(lineup, slotIndex, ctx);
  const position = lineup.slots[slotIndex]!.position;
  return new Map(ctx.byPosition[position].map((pl) => [pl.id, check(pl.id)]));
}
