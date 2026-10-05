import { useRef, useState } from "react";
import { formatPrice, type EngineContext, type Player } from "../engine";
import { kitColors } from "./clubColors";
import { initials, shortName, tinyName } from "./names";

export function KitBadge({ player, ctx, size = "md" }: { player: Player; ctx: EngineContext; size?: "sm" | "md" }) {
  const kit = kitColors(ctx.teams.get(player.team_id)?.short_name);
  return (
    <span className={`kit kit--${size}`} style={{ background: kit.bg, color: kit.fg }} aria-hidden="true">
      {initials(player.name)}
    </span>
  );
}

/** "vs LIV (H)" */
export function opponentLabel(player: Player, ctx: EngineContext): string {
  return `vs ${ctx.teams.get(player.opponent_team_id)?.short_name ?? "?"} (${player.home ? "H" : "A"})`;
}

interface SlotCardProps {
  player: Player;
  ctx: EngineContext;
  badge?: "C" | "V" | null;
}

/** Compact card for a pitch/bench spot. Long-press (touch) or hover shows the full name. */
export function SlotCard({ player, ctx, badge }: SlotCardProps) {
  const [showFull, setShowFull] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const start = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setShowFull(true), 450);
  };
  const stop = () => {
    window.clearTimeout(timer.current);
    if (showFull) window.setTimeout(() => setShowFull(false), 1200);
  };
  const club = ctx.teams.get(player.team_id)?.short_name ?? "";
  return (
    <span className="slot-card" title={player.name} onPointerDown={start} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}>
      <KitBadge player={player} ctx={ctx} />
      {badge && <span className={`cv-badge cv-badge--${badge}`}>{badge}</span>}
      <span className="slot-card__name slot-card__name--wide">{shortName(player.name, 14)}</span>
      <span className="slot-card__name slot-card__name--narrow">{tinyName(player.name)}</span>
      <span className="slot-card__meta">
        {club} · {formatPrice(player.price)}
      </span>
      <span className="slot-card__meta">{opponentLabel(player, ctx)}</span>
      {showFull && <span className="slot-card__full" role="tooltip">{player.name}</span>}
    </span>
  );
}
