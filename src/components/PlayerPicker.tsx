import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useFocusTrap } from "./useFocusTrap";
import { checkCandidates, formatPrice, POSITION_NAMES, type EngineContext, type Lineup } from "../engine";
import { KitBadge, opponentLabel } from "./PlayerCard";
import { searchKey } from "./names";

interface Props {
  lineup: Lineup;
  slotIndex: number;
  ctx: EngineContext;
  onPick: (playerId: number) => void;
  onRemove: () => void;
  onClose: () => void;
}

/** Full-height list of players for one spot. Players who can't be added are greyed out with the
 *  engine's reason (checkCandidates). Shows no points, form or predictions: only pre-match info. */
export function PlayerPicker({ lineup, slotIndex, ctx, onPick, onRemove, onClose }: Props) {
  const slot = lineup.slots[slotIndex]!;
  const current = slot.playerId !== null ? ctx.players.get(slot.playerId) : undefined;
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"high" | "low">("high");
  const [hideUnavailable, setHideUnavailable] = useState(false);
  const deferredQuery = useDeferredValue(query);
  const panel = useRef<HTMLElement>(null);
  useFocusTrap(panel);

  const checks = useMemo(() => checkCandidates(lineup, slotIndex, ctx), [lineup, slotIndex, ctx]);
  const keyed = useMemo(
    () => ctx.byPosition[slot.position].map((p) => ({ p, key: searchKey(`${p.name} ${ctx.teams.get(p.team_id)?.name ?? ""} ${ctx.teams.get(p.team_id)?.short_name ?? ""}`) })),
    [ctx, slot.position],
  );
  const rows = useMemo(() => {
    const q = searchKey(deferredQuery.trim());
    const list = keyed.filter(({ p, key }) => (!q || key.includes(q)) && (!hideUnavailable || checks.get(p.id)?.ok)).map(({ p }) => p);
    // byPosition is cheapest first (ties: lower id).
    return sort === "low" ? list : [...list].reverse().sort((a, b) => b.price - a.price || a.id - b.id);
  }, [keyed, deferredQuery, sort, hideUnavailable, checks]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const posName = POSITION_NAMES[slot.position];
  return (
    <div className="overlay overlay--sheet" role="presentation" onClick={onClose}>
      <section className="picker" ref={panel} role="dialog" aria-modal="true" aria-label={`Choose a ${posName.one}`} onClick={(e) => e.stopPropagation()}>
        <header className="picker__header">
          <h2 className="picker__title">Choose a {posName.one}</h2>
          <button type="button" className="btn btn--ghost btn--small" onClick={onClose}>
            Close
          </button>
        </header>
        {current && (
          <div className="picker__current">
            <span>
              In this spot: <strong>{current.name}</strong>
            </span>
            <button type="button" className="btn btn--danger btn--small" onClick={onRemove}>
              Remove
            </button>
          </div>
        )}
        <div className="picker__controls">
          <input
            className="input"
            type="search"
            placeholder={`Search ${posName.many} or clubs`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search players"
            autoFocus
          />
          <button type="button" className="btn btn--ghost btn--small" onClick={() => setSort(sort === "high" ? "low" : "high")} aria-label="Sort by price">
            Price {sort === "high" ? "▼ high first" : "▲ low first"}
          </button>
          <label className="toggle">
            <input type="checkbox" checked={hideUnavailable} onChange={(e) => setHideUnavailable(e.target.checked)} />
            Hide unavailable
          </label>
        </div>
        <ul className="picker__list" aria-label={`${rows.length} ${posName.many}`}>
          {rows.length === 0 && <li className="picker__empty">No {posName.many} match “{query}”.</li>}
          {rows.map((p) => {
            const c = checks.get(p.id);
            const ok = c?.ok ?? false;
            const isCurrent = p.id === slot.playerId;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  className={`pick-row ${ok ? "" : "pick-row--blocked"} ${isCurrent ? "pick-row--current" : ""}`}
                  aria-disabled={!ok}
                  // Greyed-out players stay visible (with the reason) but are skipped by Tab.
                  tabIndex={ok && !isCurrent ? 0 : -1}
                  onClick={() => ok && !isCurrent && onPick(p.id)}
                  data-player={p.id}
                >
                  <KitBadge player={p} ctx={ctx} size="sm" />
                  <span className="pick-row__main">
                    <span className="pick-row__name">{p.name}</span>
                    <span className="pick-row__meta">
                      {ctx.teams.get(p.team_id)?.short_name} · {opponentLabel(p, ctx)}
                    </span>
                    {c && !c.ok && !isCurrent && <span className="pick-row__reason">{c.reason}</span>}
                  </span>
                  <span className="pick-row__price">{formatPrice(p.price)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
