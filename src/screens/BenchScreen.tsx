import { useState } from "react";
import { BENCH_AUTOFILL_RULE_TEXT } from "../engine";
import { BuilderHeader } from "../components/BuilderHeader";
import { SlotButton } from "../components/Pitch";
import { PlayerPicker } from "../components/PlayerPicker";
import { filledCount, slotCount } from "../state/build";
import type { BuildScreenProps } from "./BuildScreen";

export function BenchScreen({ build, ctx, dispatch, timerEnabled, timerMs }: BuildScreenProps) {
  const [picker, setPicker] = useState<number | null>(null);
  const [showRule, setShowRule] = useState(false);
  const { lineup } = build;
  const benchSlots = lineup.slots.flatMap((s, i) => (s.kind === "bench" ? [i] : []));
  const left = slotCount(lineup, "bench") - filledCount(lineup, "bench");

  return (
    <main className="builder">
      <BuilderHeader step="bench" build={build} ctx={ctx} dispatch={dispatch} timerEnabled={timerEnabled} timerMs={timerMs} />

      <section className="bench" aria-label="Bench">
        <div className="bench__intro">
          <h2 className="builder__h2">Your bench</h2>
          <p className="hint">If a starter doesn't play, the first bench player in this order who did play comes on.</p>
          <div className="autofill">
            <button type="button" className="btn btn--primary btn--small" onClick={() => dispatch({ type: "AUTO_FILL_BENCH" })} disabled={left === 0} title={BENCH_AUTOFILL_RULE_TEXT}>
              Auto-fill my bench
            </button>
            <button type="button" className="info-btn" aria-expanded={showRule} aria-label="How auto-fill chooses" onClick={() => setShowRule(!showRule)}>
              i
            </button>
          </div>
          {showRule && <p className="rule-text">{BENCH_AUTOFILL_RULE_TEXT}</p>}
        </div>

        <ol className="bench__list">
          {benchSlots.map((slotIndex, k) => (
            <li key={slotIndex} className="bench__item">
              <span className="bench__order" aria-hidden="true">
                {k + 1}
              </span>
              <SlotButton lineup={lineup} index={slotIndex} ctx={ctx} onSlot={setPicker} label={`Bench ${k + 1}: `} active={picker === slotIndex} />
              <span className="bench__moves">
                <button type="button" className="move-btn" aria-label={`Move bench ${k + 1} up`} disabled={k === 0} onClick={() => dispatch({ type: "MOVE_BENCH", from: k, to: k - 1 })}>
                  ▲
                </button>
                <button
                  type="button"
                  className="move-btn"
                  aria-label={`Move bench ${k + 1} down`}
                  disabled={k === benchSlots.length - 1}
                  onClick={() => dispatch({ type: "MOVE_BENCH", from: k, to: k + 1 })}
                >
                  ▼
                </button>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <footer className="builder-footer">
        <button type="button" className="btn btn--ghost btn--small" onClick={() => dispatch({ type: "GOTO", screen: "build" })}>
          Back
        </button>
        <button type="button" className="btn btn--ghost btn--small" onClick={() => dispatch({ type: "UNDO" })} disabled={build.undo.length === 0}>
          Undo
        </button>
        <span className="builder-footer__hint">{left > 0 ? `${left} bench ${left === 1 ? "spot" : "spots"} to fill` : "Bench complete"}</span>
        <button type="button" className="btn btn--primary" onClick={() => dispatch({ type: "GOTO", screen: "captain" })} disabled={left > 0}>
          Next: captain
        </button>
      </footer>

      {picker !== null && (
        <PlayerPicker
          lineup={lineup}
          slotIndex={picker}
          ctx={ctx}
          onPick={(playerId) => {
            dispatch({ type: "PLACE_PLAYER", slotIndex: picker, playerId });
            setPicker(null);
          }}
          onRemove={() => {
            dispatch({ type: "CLEAR_SLOT", slotIndex: picker });
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
        />
      )}
    </main>
  );
}
