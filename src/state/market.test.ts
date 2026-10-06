import { describe, expect, it } from "vitest";
import { budgetStatus, canAddPlayer, checkCandidates, POSITIONS, type BudgetStatus, type Player } from "../engine";
import { randomLegalPartialLineup, realGameweek, rng } from "../engine/testing/fixtures";
import { searchKey } from "../components/names";
import { newBuild } from "./build";
import {
  availableIds,
  bandRange,
  budgetWords,
  cheapestPrice,
  clearFilters,
  DEFAULT_FILTER,
  inBand,
  isFiltered,
  marketRows,
  priceBands,
  randomIdeas,
  spendLimit,
  surprisePick,
  type MarketFilter,
} from "./market";

const { ctx } = realGameweek(37);
const mids = ctx.byPosition.MID;
const keyOf = (p: Player) => searchKey(`${p.name} ${ctx.teams.get(p.team_id)!.name} ${ctx.teams.get(p.team_id)!.short_name}`);
const rows = (f: Partial<MarketFilter>, available: (id: number) => boolean = () => true) => marketRows(mids, { ...DEFAULT_FILTER, ...f }, ctx, keyOf, available);

describe("price bands", () => {
  it("split every position into three non-empty bands, each player in exactly one", () => {
    for (const pos of POSITIONS) {
      const bands = priceBands(pos);
      for (const b of bands) expect(ctx.byPosition[pos].some((p) => inBand(p.price, b)), `${pos} ${b.id}`).toBe(true);
      for (const p of ctx.byPosition[pos]) expect(bands.filter((b) => inBand(p.price, b))).toHaveLength(1);
    }
  });

  it("label each chip with its real £ range", () => {
    expect(priceBands("MID").map(bandRange)).toEqual(["£7.0m+", "£5.0–6.9m", "under £5.0m"]);
    expect(priceBands("GK").map(bandRange)).toEqual(["£5.0m+", "£4.5–4.9m", "under £4.5m"]);
    expect(priceBands("DEF").map(bandRange)).toEqual(["£5.5m+", "£4.5–5.4m", "under £4.5m"]);
  });
});

describe("marketRows filters and sort", () => {
  const ars = [...ctx.teams.values()].find((t) => t.short_name === "ARS")!;

  it("filter by club, price band, availability and search", () => {
    const club = rows({ club: ars.id });
    expect(club.length).toBeGreaterThan(0);
    expect(club.every((p) => p.team_id === ars.id)).toBe(true);
    expect(rows({ band: "premium" }).every((p) => p.price >= 70)).toBe(true);
    expect(rows({ band: "budget" }).every((p) => p.price < 50)).toBe(true);
    const both = rows({ club: ars.id, band: "mid" });
    expect(both.every((p) => p.team_id === ars.id && p.price >= 50 && p.price < 70)).toBe(true);
    const even = (id: number) => id % 2 === 0;
    expect(rows({ hideUnavailable: true }, even).every((p) => even(p.id))).toBe(true);
    expect(rows({ query: "saka" }).map((p) => p.name)).toEqual(["Bukayo Saka"]);
    expect(rows({ query: "arsenal" })).toEqual(club);
    // Filters together with everything off = the whole position.
    expect(rows({})).toHaveLength(mids.length);
  });

  it("sort by price both ways, A-Z and club", () => {
    const high = rows({ sort: "price-high" });
    high.slice(1).forEach((p, i) => expect(high[i]!.price >= p.price).toBe(true));
    const low = rows({ sort: "price-low" });
    low.slice(1).forEach((p, i) => expect(low[i]!.price <= p.price).toBe(true));
    const az = rows({ sort: "name" });
    az.slice(1).forEach((p, i) => expect(az[i]!.name.localeCompare(p.name, "en", { sensitivity: "base" }) <= 0).toBe(true));
    const club = rows({ sort: "club" }).map((p) => ctx.teams.get(p.team_id)!.name);
    club.slice(1).forEach((n, i) => expect(club[i]!.localeCompare(n, "en") <= 0).toBe(true));
  });

  it("Clear filters keeps the sort", () => {
    const f: MarketFilter = { query: "x", club: 1, band: "mid", sort: "name", hideUnavailable: true };
    expect(isFiltered(f)).toBe(true);
    expect(clearFilters(f)).toEqual({ ...DEFAULT_FILTER, sort: "name" });
    expect(isFiltered(clearFilters(f))).toBe(false);
    expect(isFiltered({ ...DEFAULT_FILTER, sort: "club" })).toBe(false);
  });
});

describe("random ideas (suggestions only, no points data)", () => {
  it("are always legal for the slot, never repeat, and follow the seed", () => {
    const r = rng(37);
    for (let t = 0; t < 40; t++) {
      const lineup = randomLegalPartialLineup(ctx, r, r());
      const slotIndex = Math.floor(r() * lineup.slots.length);
      const current = lineup.slots[slotIndex]!.playerId;
      const checks = checkCandidates(lineup, slotIndex, ctx);
      const ids = availableIds(checks, current);
      const ideas = randomIdeas(ids, 6, rng(t));
      expect(ideas).toHaveLength(Math.min(6, ids.length));
      expect(new Set(ideas).size).toBe(ideas.length);
      for (const id of ideas) {
        expect(id).not.toBe(current);
        expect(canAddPlayer(lineup, slotIndex, id, ctx).ok).toBe(true);
      }
      expect(randomIdeas(ids, 6, rng(t))).toEqual(ideas);
      const s = surprisePick(ids, rng(t + 1000));
      if (ids.length === 0) expect(s).toBeNull();
      else expect(canAddPlayer(lineup, slotIndex, s!, ctx).ok).toBe(true);
    }
  });

  it("handle short and empty pools", () => {
    expect(randomIdeas([], 6, rng(1))).toEqual([]);
    expect(randomIdeas([5, 7], 6, rng(1)).sort()).toEqual([5, 7]);
    expect(surprisePick([], rng(1))).toBeNull();
  });

  it("vary between shuffles", () => {
    const ids = mids.map((p) => p.id);
    const r = rng(9);
    const sets = new Set(Array.from({ length: 10 }, () => randomIdeas(ids, 6, r).join(",")));
    expect(sets.size).toBeGreaterThan(1);
  });
});

describe("spendLimit", () => {
  it("is the most expensive player the engine allows in the slot", () => {
    const r = rng(5);
    for (let t = 0; t < 20; t++) {
      const lineup = randomLegalPartialLineup(ctx, r, r());
      const slotIndex = Math.floor(r() * lineup.slots.length);
      const checks = checkCandidates(lineup, slotIndex, ctx);
      const ok = [...checks].filter(([, c]) => c.ok).map(([id]) => ctx.players.get(id)!.price);
      expect(spendLimit(checks, ctx)).toBe(ok.length ? Math.max(...ok) : null);
    }
  });
});

describe("budget words", () => {
  it("empty squad", () => {
    const b = budgetStatus(newBuild(ctx).lineup, ctx);
    const w = budgetWords(b);
    expect(w.problem).toBe(false);
    expect(w.spent).toBe("£0.0m");
    expect(w.left).toBe("£100.0m left for 15 more players");
    expect(w.average).toBe("about £6.7m per player on average");
    expect(w.reserved).toBe(`£${(b.reservedForEmpty! / 10).toFixed(1)}m`);
    expect(w.free).toBe(`£${(b.freeToSpend! / 10).toFixed(1)}m`);
  });

  const status = (s: Partial<BudgetStatus>): BudgetStatus => ({ spent: 955, remaining: 45, reservedForEmpty: 0, freeToSpend: 45, emptySlots: 0, ...s });

  it("full squad, one spot left, and a problem", () => {
    expect(budgetWords(status({}))).toEqual({ problem: false, spent: "£95.5m", left: "£4.5m left", average: null, reserved: null, free: "£4.5m" });
    const one = budgetWords(status({ spent: 920, remaining: 80, reservedForEmpty: 40, freeToSpend: 40, emptySlots: 1 }));
    expect(one.left).toBe("£8.0m left for 1 more player");
    expect(one.average).toBeNull();
    expect(one.reserved).toBe("£4.0m");
    const bad = budgetWords(status({ spent: 1010, remaining: -10, reservedForEmpty: null, freeToSpend: null, emptySlots: 2 }));
    expect(bad.problem).toBe(true);
    expect(bad.left).toBe("£0.0m left for 2 more players"); // never a scary negative number
    expect(bad.free).toBeNull();
    expect(bad.average).toBeNull();
  });

  it("cheapest player price", () => {
    expect(cheapestPrice(ctx)).toBe(Math.min(...[...ctx.players.values()].map((p) => p.price)));
  });
});
