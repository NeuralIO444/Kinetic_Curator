/**
 * Noto Sans Symbols 2 geometric icons for KC-1 (#1262).
 * Load via <link> in index.html. Apply font-family: "Noto Sans Symbols 2", sans-serif;
 * All currentColor-driven, square-corner friendly, reduced-motion safe.
 */
export const icons = {
  warning: '▲',      // ▲
  check: '✓',        // ✓
  x: '✕',            // ✕
  star: '★',         // ★
  plus: '+',          // +
  circle: '●',       // ●
  arrow: '→',        // →
  lightning: '⚡',    // ⚡
  square: '■',       // ■
  crown: '♔',        // ♔ (chess king; or use custom for presence mark)
};

export function Icon({ name, ...props }) {
  const char = icons[name] || '?';
  return (
    <span
      className="kc-icon"
      style={{ fontFamily: '"Noto Sans Symbols 2", sans-serif', lineHeight: 1 }}
      {...props}
    >
      {char}
    </span>
  );
}
