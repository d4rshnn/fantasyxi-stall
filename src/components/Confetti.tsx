/** Light, CSS-only confetti for a win (hidden with reduced motion). Positions are fixed, not random. */
export function Confetti() {
  const colors = ["#c8ff2e", "#3ddc97", "#ffb547", "#6cabdd", "#ff5a5f", "#f4f6fb"];
  return (
    <div className="confetti" aria-hidden="true">
      {Array.from({ length: 28 }, (_, i) => (
        <span
          key={i}
          style={{
            left: `${(i * 37) % 100}%`,
            background: colors[i % colors.length],
            animationDelay: `${(i % 7) * 90}ms`,
            animationDuration: `${1300 + (i % 5) * 160}ms`,
            transform: `rotate(${(i * 47) % 360}deg)`,
          }}
        />
      ))}
    </div>
  );
}
