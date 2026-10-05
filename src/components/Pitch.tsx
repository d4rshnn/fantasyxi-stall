import { POSITION_NAMES, type EngineContext, type Lineup, type Position } from "../engine";
import { SlotCard } from "./PlayerCard";

interface Props {
  lineup: Lineup;
  ctx: EngineContext;
  onSlot: (slotIndex: number) => void;
  captainId?: number | null;
  viceCaptainId?: number | null;
  /** If given, only these slots can be tapped (others look normal but do nothing). */
  canTap?: (slotIndex: number) => boolean;
  /** Highlight a slot (e.g. the one being edited). */
  activeSlot?: number | null;
}

const ROWS: Position[] = ["FWD", "MID", "DEF", "GK"]; // attack at the top, keeper at the bottom

/** The starting XI on a pitch. Tap an empty spot to add a player, a filled one to change it. */
export function Pitch({ lineup, ctx, onSlot, captainId, viceCaptainId, canTap, activeSlot }: Props) {
  return (
    <div className="pitch" aria-label="Starting XI">
      {ROWS.map((pos) => (
        <div className="pitch__row" key={pos}>
          {lineup.slots.map((slot, i) =>
            slot.kind === "xi" && slot.position === pos ? (
              <SlotButton
                key={i}
                lineup={lineup}
                index={i}
                ctx={ctx}
                onSlot={onSlot}
                badge={slot.playerId === captainId ? "C" : slot.playerId === viceCaptainId ? "V" : null}
                disabled={canTap ? !canTap(i) : false}
                active={activeSlot === i}
              />
            ) : null,
          )}
        </div>
      ))}
    </div>
  );
}

interface SlotButtonProps {
  lineup: Lineup;
  index: number;
  ctx: EngineContext;
  onSlot: (slotIndex: number) => void;
  badge?: "C" | "V" | null;
  disabled?: boolean;
  active?: boolean;
  label?: string;
}

export function SlotButton({ lineup, index, ctx, onSlot, badge, disabled, active, label }: SlotButtonProps) {
  const slot = lineup.slots[index]!;
  const player = slot.playerId !== null ? ctx.players.get(slot.playerId) : undefined;
  const posName = POSITION_NAMES[slot.position].one;
  return (
    <button
      type="button"
      className={`slot ${player ? "slot--filled" : "slot--empty"} ${active ? "slot--active" : ""}`}
      onClick={() => onSlot(index)}
      disabled={disabled}
      aria-label={player ? `${label ?? ""}${player.name}, ${posName}${badge === "C" ? ", captain" : badge === "V" ? ", vice-captain" : ""}` : `${label ?? ""}Add a ${posName}`}
      data-slot={index}
    >
      {player ? (
        <SlotCard player={player} ctx={ctx} badge={badge} />
      ) : (
        <span className="slot__empty">
          <span className="slot__plus" aria-hidden="true">+</span>
          <span className="slot__pos">{slot.position}</span>
        </span>
      )}
    </button>
  );
}
