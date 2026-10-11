/**
 * Icons for KC-1 (#1262).
 * Geometric set uses Noto Sans Symbols 2 Unicode.
 * Queen uses chunky stepped crown SVG.
 * Lois uses chunky empty square SVG.
 */
export const icons = {
  // Noto geometric
  warning: '▲',
  check: '✓',
  x: '✕',
  star: '★',
  plus: '+',
  circle: '●',
  arrow: '→',
  lightning: '⚡',
  square: '■',

  // Special (SVG)
  queen: 'queen-crown',
  lois: 'lois-square',
};

export function Icon({ name, ...props }) {
  const special = icons[name];
  if (special === 'queen-crown' || special === 'lois-square' || special === 'nested-target') {
    return (
      <img
        src={`/src/icons/${special}.svg`}
        alt=""
        className="kc-icon"
        style={{ width: '1em', height: '1em', display: 'inline-block' }}
        {...props}
      />
    );
  }
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
