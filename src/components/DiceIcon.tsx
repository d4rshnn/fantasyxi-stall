/** Dice icon for the "Random …" buttons (inline SVG: no emoji font needed offline). */
export function DiceIcon() {
  return (
    <svg className="dice-icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
      <rect x="3" y="3" width="18" height="18" rx="4" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="8" cy="8" r="1.6" fill="currentColor" />
      <circle cx="16" cy="8" r="1.6" fill="currentColor" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
      <circle cx="8" cy="16" r="1.6" fill="currentColor" />
      <circle cx="16" cy="16" r="1.6" fill="currentColor" />
    </svg>
  );
}
