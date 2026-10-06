import { useState } from "react";
import { budgetStatus, formatPrice, type EngineContext, type Lineup } from "../engine";
import { budgetWords, cheapestPrice } from "../state/market";

interface Props {
  lineup: Lineup;
  ctx: EngineContext;
  step: "build" | "bench" | "captain";
}

/** Spent / reserved for the rest of the squad / free, in plain words. Numbers come only from the
 *  engine's budgetStatus (budgetWords just formats them). */
export function BudgetBar({ lineup, ctx, step }: Props) {
  const [help, setHelp] = useState(false);
  const b = budgetStatus(lineup, ctx);
  const w = budgetWords(b);
  const total = ctx.rules.budget;
  const pct = (x: number) => `${Math.max(0, Math.min(100, (x / total) * 100))}%`;
  const benchEmpty = lineup.slots.some((s) => s.kind === "bench" && s.playerId === null);
  const note =
    step === "build" && benchEmpty
      ? "Your bench is kept at the cheapest price; upgrade it on the Bench step."
      : step === "bench" && benchEmpty
        ? "Spend leftover money to upgrade your bench."
        : null;
  const why = `Every player costs at least ${formatPrice(cheapestPrice(ctx))}, so we set money aside so you can always finish a legal team.`;
  return (
    <div className={`budget ${w.problem ? "budget--problem" : ""}`} role="group" aria-label="Budget">
      <div className="budget__bar" aria-hidden="true">
        <span className="budget__spent" style={{ width: pct(b.spent) }} />
        <span className="budget__reserved" style={{ width: pct(b.reservedForEmpty ?? 0) }} />
      </div>
      <div className="budget__labels">
        <span>
          <strong>{w.spent}</strong> spent
        </span>
        <span>{w.left}</span>
        {w.average && <span>{w.average}</span>}
        <span className="budget__free">
          {w.problem ? (
            <strong>Over budget: remove a player</strong>
          ) : (
            <>
              Free to spend now: <strong>{w.free}</strong>
            </>
          )}
        </span>
      </div>
      {w.reserved && (
        <div className="budget__legend" title={why}>
          <span className="budget__swatch" aria-hidden="true" />
          <span>
            <strong>{w.reserved}</strong> reserved for the rest of your squad.{note && ` ${note}`}
          </span>
          <button type="button" className="budget__why" aria-expanded={help} onClick={() => setHelp(!help)}>
            Why?
          </button>
        </div>
      )}
      {w.reserved && help && <p className="budget__help">{why}</p>}
    </div>
  );
}
