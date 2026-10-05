import { budgetStatus, formatPrice, type EngineContext, type Lineup } from "../engine";

/** Spent / left / kept for empty spots / free to spend, from the engine's budgetStatus. */
export function BudgetBar({ lineup, ctx }: { lineup: Lineup; ctx: EngineContext }) {
  const b = budgetStatus(lineup, ctx);
  const total = ctx.rules.budget;
  const reserved = b.reservedForEmpty ?? 0;
  const problem = b.freeToSpend === null || b.freeToSpend < 0;
  const pct = (x: number) => `${Math.max(0, Math.min(100, (x / total) * 100))}%`;
  return (
    <div className={`budget ${problem ? "budget--problem" : ""}`} role="group" aria-label="Budget">
      <div className="budget__bar" aria-hidden="true">
        <span className="budget__spent" style={{ width: pct(b.spent) }} />
        <span className="budget__reserved" style={{ width: pct(reserved) }} />
      </div>
      <div className="budget__labels">
        <span>
          <strong>{formatPrice(b.spent)}</strong> spent
        </span>
        <span>
          <strong>{formatPrice(b.remaining)}</strong> left
        </span>
        {b.emptySlots > 0 && (
          <span className="budget__reserve-label">
            keep <strong>{formatPrice(reserved)}</strong> for {b.emptySlots} empty {b.emptySlots === 1 ? "spot" : "spots"}
          </span>
        )}
        <span className="budget__free">
          {problem ? (
            <strong>Over budget: remove a player</strong>
          ) : (
            <>
              <strong>{formatPrice(b.freeToSpend!)}</strong> free to spend
            </>
          )}
        </span>
      </div>
    </div>
  );
}
