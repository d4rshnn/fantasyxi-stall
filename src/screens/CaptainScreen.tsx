import { useState } from "react";
import { BuilderHeader } from "../components/BuilderHeader";
import { Pitch } from "../components/Pitch";
import type { BuildScreenProps } from "./BuildScreen";

export function CaptainScreen({ build, ctx, dispatch, timerEnabled, timerMs }: BuildScreenProps) {
  const [mode, setMode] = useState<"C" | "V">(build.captainId === null ? "C" : "V");
  const { lineup, captainId, viceCaptainId } = build;
  const name = (id: number | null) => (id === null ? "—" : (ctx.players.get(id)?.name ?? "—"));

  const onSlot = (slotIndex: number) => {
    const playerId = lineup.slots[slotIndex]?.playerId;
    if (playerId == null) return;
    if (mode === "C") {
      dispatch({ type: "SET_CAPTAIN", playerId });
      if (viceCaptainId === null || viceCaptainId === playerId) setMode("V");
    } else {
      dispatch({ type: "SET_VICE", playerId });
    }
  };

  return (
    <main className="builder">
      <BuilderHeader step="captain" build={build} ctx={ctx} dispatch={dispatch} timerEnabled={timerEnabled} timerMs={timerMs} />

      <div className="captain-bar">
        <p className="hint">Your captain's points count double. If your captain doesn't play, the vice-captain's do.</p>
        <div className="segmented" role="radiogroup" aria-label="Choosing">
          <button type="button" role="radio" aria-checked={mode === "C"} className={`chip ${mode === "C" ? "chip--on" : ""}`} onClick={() => setMode("C")}>
            Captain (C): {name(captainId)}
          </button>
          <button type="button" role="radio" aria-checked={mode === "V"} className={`chip ${mode === "V" ? "chip--on" : ""}`} onClick={() => setMode("V")}>
            Vice (V): {name(viceCaptainId)}
          </button>
        </div>
        <p className="hint hint--strong">Tap a player to make them {mode === "C" ? "captain" : "vice-captain"}.</p>
      </div>

      <Pitch lineup={lineup} ctx={ctx} onSlot={onSlot} captainId={captainId} viceCaptainId={viceCaptainId} />

      <footer className="builder-footer">
        <button type="button" className="btn btn--ghost btn--small" onClick={() => dispatch({ type: "GOTO", screen: "bench" })}>
          Back
        </button>
        <span className="builder-footer__hint">{captainId === null ? "Pick a captain" : viceCaptainId === null ? "Pick a vice-captain" : "Ready to lock"}</span>
        <button type="button" className="btn btn--primary" onClick={() => dispatch({ type: "GOTO", screen: "lock" })} disabled={captainId === null || viceCaptainId === null}>
          Next: lock
        </button>
      </footer>
    </main>
  );
}
