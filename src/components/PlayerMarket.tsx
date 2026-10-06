import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useFocusTrap } from "./useFocusTrap";
import { checkCandidates, formatPrice, POSITION_NAMES, type EngineContext, type Lineup, type Player } from "../engine";
import { KitBadge, opponentLabel } from "./PlayerCard";
import { kitColors } from "./clubColors";
import { searchKey, shortName } from "./names";
import {
  availableIds,
  bandRange,
  clearFilters,
  DEFAULT_FILTER,
  isFiltered,
  marketRows,
  priceBands,
  randomIdeas,
  SORTS,
  spendLimit,
  surprisePick,
  type MarketFilter,
} from "../state/market";

interface Props {
  lineup: Lineup;
  slotIndex: number;
  ctx: EngineContext;
  onPick: (playerId: number) => void;
  onRemove: () => void;
  onClose: () => void;
}

const IDEAS = 6;
/** Cards drawn in the first frame; the rest follow right after as a low-priority update (fast open). */
const FIRST_CARDS = 48;

/** Large centred "player market" for one spot: search, club/price filters, sort, random ideas and a
 *  grid of cards. Players who can't be added are greyed out with the engine's reason (checkCandidates).
 *  Shows no points, form or predictions: only pre-match info. */
export function PlayerMarket({ lineup, slotIndex, ctx, onPick, onRemove, onClose }: Props) {
  const slot = lineup.slots[slotIndex]!;
  const current = slot.playerId !== null ? ctx.players.get(slot.playerId) : undefined;
  const [query, setQuery] = useState("");
  const [f, setF] = useState<MarketFilter>(DEFAULT_FILTER);
  const deferredQuery = useDeferredValue(query);
  const panel = useRef<HTMLElement>(null);
  const body = useRef<HTMLDivElement>(null);
  useFocusTrap(panel);

  const checks = useMemo(() => checkCandidates(lineup, slotIndex, ctx), [lineup, slotIndex, ctx]);
  const players = ctx.byPosition[slot.position];
  const keys = useMemo(
    () => new Map(players.map((p) => [p.id, searchKey(`${p.name} ${ctx.teams.get(p.team_id)?.name ?? ""} ${ctx.teams.get(p.team_id)?.short_name ?? ""}`)])),
    [ctx, players],
  );
  const filter = useMemo(() => ({ ...f, query: searchKey(deferredQuery.trim()) }), [f, deferredQuery]);
  const rows = useMemo(
    () => marketRows(players, filter, ctx, (p) => keys.get(p.id)!, (id) => checks.get(id)?.ok ?? false),
    [players, filter, ctx, keys, checks],
  );
  const clubs = useMemo(() => [...new Set(players.map((p) => p.team_id))].map((id) => ctx.teams.get(id)!).sort((a, b) => a.name.localeCompare(b.name)), [players, ctx]);
  const bands = priceBands(slot.position);
  const limit = spendLimit(checks, ctx);
  const [shown, setShown] = useState(FIRST_CARDS);
  useEffect(() => startTransition(() => setShown(Infinity)), []);

  // Random ideas: Math.random only chooses which LEGAL players to suggest. It never affects scoring,
  // the replay or the AI, and ideas say nothing about points (every allowed player is equally likely).
  const pickable = useMemo(() => availableIds(checks, slot.playerId), [checks, slot.playerId]);
  const [ideas, setIdeas] = useState(() => randomIdeas(pickable, IDEAS, Math.random));
  const shuffle = () => setIdeas(randomIdeas(pickable, IDEAS, Math.random));
  const surprise = () => {
    const id = surprisePick(pickable, Math.random);
    if (id !== null) onPick(id);
  };

  // While open, the page behind must not scroll (wheel/touch over the backdrop included).
  useEffect(() => {
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = before;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const set = (patch: Partial<MarketFilter>) => setF((x) => ({ ...x, ...patch }));
  const posName = POSITION_NAMES[slot.position];
  const filtered = isFiltered({ ...f, query: query.trim() });
  const pick = (p: Player) => checks.get(p.id)?.ok && p.id !== slot.playerId && onPick(p.id);

  return (
    <div className="overlay overlay--market" role="presentation" onClick={onClose}>
      <section className="market" ref={panel} role="dialog" aria-modal="true" aria-labelledby="market-title" onClick={(e) => e.stopPropagation()}>
        <header className="market__top">
          <div className="market__heading">
            <h2 className="market__title" id="market-title">
              Choose a {posName.one}
            </h2>
            <p className="market__limit">
              {limit === null ? (
                <>No {posName.one} fits your money here right now.</>
              ) : (
                <>
                  You can spend up to <strong>{formatPrice(limit)}</strong> on this player
                </>
              )}
            </p>
          </div>
          <input
            className="input market__search"
            type="search"
            placeholder={`Search ${posName.many} or clubs`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" || e.key === "PageDown") {
                e.preventDefault();
                body.current?.focus();
              }
            }}
            aria-label="Search players"
            autoFocus
          />
          <button type="button" className="btn btn--ghost btn--small" onClick={onClose}>
            Close
          </button>
        </header>

        {/* The ONLY scrolling part (wheel, touch, keyboard). Focusable so arrows/PgUp/PgDn/Home/End work. */}
        <div className="market__body" ref={body} tabIndex={0} aria-label={`${posName.many}: list`}>
          {current && (
            <div className="market__current">
              <span>
                In this spot: <strong>{current.name}</strong> ({formatPrice(current.price)})
              </span>
              <button type="button" className="btn btn--danger btn--small" onClick={onRemove}>
                Remove
              </button>
            </div>
          )}

          <div className="market__filters">
            <div className="chips" role="group" aria-label="Club">
              <button type="button" className={`mchip ${f.club === null ? "mchip--on" : ""}`} aria-pressed={f.club === null} onClick={() => set({ club: null })}>
                All clubs
              </button>
              {clubs.map((t) => {
                const kit = kitColors(t.short_name);
                return (
                  <button
                    key={t.id}
                    type="button"
                    className={`mchip ${f.club === t.id ? "mchip--on" : ""}`}
                    aria-pressed={f.club === t.id}
                    title={t.name}
                    onClick={() => set({ club: f.club === t.id ? null : t.id })}
                  >
                    <span className="mchip__kit" style={{ background: kit.bg, borderColor: kit.fg }} aria-hidden="true" />
                    {t.short_name}
                  </button>
                );
              })}
            </div>
            <div className="chips" role="group" aria-label="Price">
              <button type="button" className={`mchip ${f.band === null ? "mchip--on" : ""}`} aria-pressed={f.band === null} onClick={() => set({ band: null })}>
                All prices
              </button>
              {bands.map((b) => (
                <button key={b.id} type="button" className={`mchip ${f.band === b.id ? "mchip--on" : ""}`} aria-pressed={f.band === b.id} onClick={() => set({ band: f.band === b.id ? null : b.id })}>
                  {b.name} <span className="mchip__sub">{bandRange(b)}</span>
                </button>
              ))}
            </div>
            <div className="chips" role="radiogroup" aria-label="Sort">
              <span className="chips__label">Sort</span>
              {SORTS.map((s) => (
                <button key={s.id} type="button" role="radio" aria-checked={f.sort === s.id} className={`mchip ${f.sort === s.id ? "mchip--on" : ""}`} onClick={() => set({ sort: s.id })}>
                  {s.label}
                </button>
              ))}
              <label className="toggle market__hide">
                <input type="checkbox" checked={f.hideUnavailable} onChange={(e) => set({ hideUnavailable: e.target.checked })} />
                Hide unavailable
              </label>
            </div>
          </div>

          <section className="ideas" aria-label="Random ideas (not AI picks)">
            <div className="ideas__head">
              <span className="ideas__label">Random ideas (not AI picks)</span>
              <button type="button" className="btn btn--ghost btn--small" onClick={shuffle} disabled={pickable.length === 0}>
                Shuffle
              </button>
              <button type="button" className="btn btn--ghost btn--small" onClick={surprise} disabled={pickable.length === 0}>
                Surprise me
              </button>
            </div>
            <div className="ideas__row">
              {ideas.length === 0 && <span className="ideas__empty">No {posName.one} fits right now.</span>}
              {ideas.map((id) => {
                const p = ctx.players.get(id)!;
                return (
                  <button key={id} type="button" className="idea" title={p.name} onClick={() => pick(p)}>
                    <KitBadge player={p} ctx={ctx} size="sm" />
                    <span className="idea__name">{shortName(p.name, 11)}</span>
                    <span className="idea__price">{formatPrice(p.price)}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <div className="market__count" aria-live="polite">
            <strong>
              {rows.length} {rows.length === 1 ? posName.one : posName.many}
            </strong>
            {filtered && (
              <button
                type="button"
                className="btn btn--ghost btn--small"
                onClick={() => {
                  setQuery("");
                  setF(clearFilters);
                }}
              >
                Clear filters
              </button>
            )}
          </div>

          <ul className="market__grid" aria-label={`${rows.length} ${posName.many}`}>
            {rows.length === 0 && <li className="market__empty">No {posName.many} match these filters.</li>}
            {rows.slice(0, shown).map((p) => {
              const c = checks.get(p.id);
              const ok = c?.ok ?? false;
              const isCurrent = p.id === slot.playerId;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    className={`mcard ${ok ? "" : "mcard--blocked"} ${isCurrent ? "mcard--current" : ""}`}
                    aria-disabled={!ok || isCurrent}
                    // Greyed-out players stay visible (with the reason) but are skipped by Tab.
                    tabIndex={ok && !isCurrent ? 0 : -1}
                    title={p.name}
                    onClick={() => pick(p)}
                    data-player={p.id}
                  >
                    <KitBadge player={p} ctx={ctx} />
                    <span className="mcard__main">
                      <span className="mcard__name">{p.name}</span>
                      <span className="mcard__meta">
                        {ctx.teams.get(p.team_id)?.short_name} · {opponentLabel(p, ctx)}
                      </span>
                      {isCurrent && <span className="mcard__note">In this spot</span>}
                      {c && !c.ok && !isCurrent && <span className="mcard__reason">{c.reason}</span>}
                    </span>
                    <span className="mcard__price">{formatPrice(p.price)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </section>
    </div>
  );
}
