// Player market (S4b): filters, sort, price bands, random ideas and plain-language budget words.
// Pure functions, UI only. Uses ONLY pre-match info (name, club, price, opponent) and the engine's
// availability answers; never points, form, minutes, predictions or reveal data.
import { formatPrice, type AddCheck, type BudgetStatus, type EngineContext, type Player, type Position } from "../engine";

// ---- Price bands ----

export type BandId = "premium" | "mid" | "budget";

export interface PriceBand {
  id: BandId;
  name: string;
  /** Inclusive lower and exclusive upper price, in tenths of £m (null = open). */
  min: number | null;
  max: number | null;
}

/** Per-position cut points (tenths), chosen from the GW37 price spread so every band has players:
 *  e.g. a fixed "£9m+" band would hold 0 goalkeepers/defenders and only 4 midfielders. */
const CUTS: Record<Position, [number, number]> = {
  GK: [45, 50],
  DEF: [45, 55],
  MID: [50, 70],
  FWD: [50, 70],
};

export function priceBands(position: Position): PriceBand[] {
  const [lo, hi] = CUTS[position];
  return [
    { id: "premium", name: "Premium", min: hi, max: null },
    { id: "mid", name: "Mid-price", min: lo, max: hi },
    { id: "budget", name: "Budget", min: null, max: lo },
  ];
}

const m = (tenths: number) => (tenths / 10).toFixed(1);

/** "£7.0m+", "£5.0–6.9m", "under £5.0m". */
export function bandRange(b: PriceBand): string {
  if (b.max === null) return `${formatPrice(b.min!)}+`;
  if (b.min === null) return `under ${formatPrice(b.max)}`;
  return `£${m(b.min)}–${m(b.max - 1)}m`;
}

export const inBand = (price: number, b: PriceBand) => (b.min === null || price >= b.min) && (b.max === null || price < b.max);

// ---- Filters and sort ----

export type SortId = "price-high" | "price-low" | "name" | "club";

export const SORTS: { id: SortId; label: string }[] = [
  { id: "price-high", label: "Price high–low" },
  { id: "price-low", label: "Price low–high" },
  { id: "name", label: "A–Z" },
  { id: "club", label: "Club" },
];

export interface MarketFilter {
  query: string; // already normalised with searchKey
  club: number | null; // team_id, null = all clubs
  band: BandId | null; // null = all prices
  sort: SortId;
  hideUnavailable: boolean;
}

export const DEFAULT_FILTER: MarketFilter = { query: "", club: null, band: null, sort: "price-high", hideUnavailable: false };

/** True if anything that hides players is set ("Clear filters" resets these; sort is kept). */
export const isFiltered = (f: MarketFilter) => f.query !== "" || f.club !== null || f.band !== null || f.hideUnavailable;

export const clearFilters = (f: MarketFilter): MarketFilter => ({ ...DEFAULT_FILTER, sort: f.sort });

/** Players of one position after filters, in the chosen order. `keyOf` gives each player's search text
 *  (normalised the same way as `f.query`); `available` is the engine's answer for this slot. */
export function marketRows(
  players: readonly Player[],
  f: MarketFilter,
  ctx: EngineContext,
  keyOf: (p: Player) => string,
  available: (id: number) => boolean,
): Player[] {
  const band = f.band === null || players.length === 0 ? null : priceBands(players[0]!.position).find((b) => b.id === f.band)!;
  const rows = players.filter(
    (p) =>
      (f.club === null || p.team_id === f.club) &&
      (band === null || inBand(p.price, band)) &&
      (!f.hideUnavailable || available(p.id)) &&
      (f.query === "" || keyOf(p).includes(f.query)),
  );
  const club = (p: Player) => ctx.teams.get(p.team_id)?.name ?? "";
  const byPriceHigh = (a: Player, b: Player) => b.price - a.price || a.id - b.id;
  const cmp: Record<SortId, (a: Player, b: Player) => number> = {
    "price-high": byPriceHigh,
    "price-low": (a, b) => a.price - b.price || a.id - b.id,
    name: (a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }) || a.id - b.id,
    club: (a, b) => club(a).localeCompare(club(b), "en") || byPriceHigh(a, b),
  };
  return rows.sort(cmp[f.sort]);
}

// ---- Random ideas ----
// Randomness here ONLY picks which legal players to suggest. It never touches scoring, the replay or
// the AI, and ideas carry no information about points: any player the engine allows is equally likely.

export type Rng = () => number; // [0, 1), Math.random in the app, seeded in tests

/** Ids the engine allows in this slot right now (excluding whoever is already in it). */
export function availableIds(checks: ReadonlyMap<number, AddCheck>, currentId: number | null): number[] {
  return [...checks].filter(([id, c]) => c.ok && id !== currentId).map(([id]) => id);
}

/** Up to `n` different ids, chosen uniformly at random (partial Fisher-Yates). */
export function randomIdeas(ids: readonly number[], n: number, rng: Rng): number[] {
  const pool = [...ids];
  const k = Math.min(n, pool.length);
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(rng() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, k);
}

/** One random id, or null if nobody fits. */
export const surprisePick = (ids: readonly number[], rng: Rng): number | null => randomIdeas(ids, 1, rng)[0] ?? null;

/** The most expensive price the engine lets you put in this slot now (null if nobody fits). */
export function spendLimit(checks: ReadonlyMap<number, AddCheck>, ctx: EngineContext): number | null {
  let best: number | null = null;
  for (const [id, c] of checks) {
    const p = ctx.players.get(id);
    if (c.ok && p && (best === null || p.price > best)) best = p.price;
  }
  return best;
}

// ---- Budget words ----

export interface BudgetWords {
  problem: boolean;
  spent: string; // "£54.5m"
  left: string; // "£45.5m left for 6 more players" / "£0.5m left"
  average: string | null; // "about £7.6m per player on average"
  reserved: string | null; // "£24.0m"
  free: string | null; // "£21.5m"
}

/** Friendly wording for the engine's budgetStatus numbers (no new money maths, only formatting and
 *  the per-player average, which is just a display division). */
export function budgetWords(b: BudgetStatus): BudgetWords {
  const problem = b.freeToSpend === null || b.freeToSpend < 0 || b.remaining < 0;
  const n = b.emptySlots;
  const left = formatPrice(Math.max(0, b.remaining));
  return {
    problem,
    spent: formatPrice(b.spent),
    left: n > 0 ? `${left} left for ${n} more ${n === 1 ? "player" : "players"}` : `${left} left`,
    average: n > 1 && !problem ? `about ${formatPrice(Math.round(b.remaining / n))} per player on average` : null,
    reserved: n > 0 && b.reservedForEmpty !== null ? formatPrice(b.reservedForEmpty) : null,
    free: problem ? null : formatPrice(b.freeToSpend!),
  };
}

/** Cheapest player in the game (for "every player costs at least £3.7m"). */
export function cheapestPrice(ctx: EngineContext): number {
  let min = Infinity;
  for (const p of ctx.players.values()) min = Math.min(min, p.price);
  return min;
}
