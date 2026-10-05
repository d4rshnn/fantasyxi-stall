import { useState, type Dispatch } from "react";
import { FORMATIONS, type EngineContext } from "../engine";
import { BuilderHeader } from "../components/BuilderHeader";
import { Dialog } from "../components/Dialog";
import { Pitch, SlotButton } from "../components/Pitch";
import { PlayerPicker } from "../components/PlayerPicker";
import { filledCount, slotCount, type BuildState } from "../state/build";
import type { Action } from "../state/machine";

export interface BuildScreenProps {
  build: BuildState;
  ctx: EngineContext;
  dispatch: Dispatch<Action>;
  timerEnabled: boolean;
  timerMs?: number;
}

export function BuildScreen({ build, ctx, dispatch, timerEnabled, timerMs }: BuildScreenProps) {
  const [picker, setPicker] = useState<number | null>(null);
  const [confirmStartOver, setConfirmStartOver] = useState(false);
  const { lineup } = build;
  const xiFilled = filledCount(lineup, "xi");
  const xiTotal = slotCount(lineup, "xi");
  const left = xiTotal - xiFilled;

  return (
    <main className="builder">
      <BuilderHeader step="build" build={build} ctx={ctx} dispatch={dispatch} timerEnabled={timerEnabled} timerMs={timerMs} />

      <div className="formations" role="radiogroup" aria-label="Formation">
        {FORMATIONS.map((f) => (
          <button
            key={f}
            type="button"
            role="radio"
            aria-checked={lineup.formation === f}
            className={`chip ${lineup.formation === f ? "chip--on" : ""}`}
            onClick={() => dispatch({ type: "SET_FORMATION", formation: f })}
          >
            {f}
          </button>
        ))}
      </div>

      <Pitch lineup={lineup} ctx={ctx} onSlot={setPicker} activeSlot={picker} />

      <section className="bench-preview" aria-label="Bench (next step)">
        <span className="bench-preview__label">Bench · next step</span>
        <div className="bench-preview__slots">
          {lineup.slots.map((s, i) =>
            s.kind === "bench" ? <SlotButton key={i} lineup={lineup} index={i} ctx={ctx} onSlot={() => {}} disabled /> : null,
          )}
        </div>
      </section>

      <footer className="builder-footer">
        <button type="button" className="btn btn--ghost btn--small" onClick={() => dispatch({ type: "UNDO" })} disabled={build.undo.length === 0}>
          Undo
        </button>
        <button type="button" className="btn btn--ghost btn--small" onClick={() => setConfirmStartOver(true)} disabled={filledCount(lineup, "xi") + filledCount(lineup, "bench") === 0}>
          Start over
        </button>
        <span className="builder-footer__hint">{left > 0 ? `${left} ${left === 1 ? "spot" : "spots"} to fill` : "Starting XI complete"}</span>
        <button type="button" className="btn btn--primary" onClick={() => dispatch({ type: "GOTO", screen: "bench" })} disabled={left > 0}>
          Next: bench
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

      {confirmStartOver && (
        <Dialog
          title="Start over?"
          onClose={() => setConfirmStartOver(false)}
          actions={
            <>
              <button type="button" className="btn btn--ghost" onClick={() => setConfirmStartOver(false)}>
                Keep my team
              </button>
              <button
                type="button"
                className="btn btn--danger"
                onClick={() => {
                  dispatch({ type: "START_OVER" });
                  setConfirmStartOver(false);
                }}
              >
                Start over
              </button>
            </>
          }
        >
          This removes every player you picked. (You can still press Undo afterwards.)
        </Dialog>
      )}
    </main>
  );
}
