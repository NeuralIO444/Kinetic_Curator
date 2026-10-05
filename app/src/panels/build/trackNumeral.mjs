// #716 Part 2 — track identity numerals (TX-6 tile grammar, item 1).
// KC tracks speak roman (I–IV, the instrument's four content slots).
// FX tracks speak arabic so a glance separates the two families.
// The edited track inverts in CSS; this module only names the glyph.

const KC_ROMAN = ['I', 'II', 'III', 'IV'];

export function trackNumeral(ordinal, kind) {
  const n = Number(ordinal);
  if (!Number.isInteger(n) || n < 1) return '';
  if (kind === 'fx' || kind === 'math') return String(n);
  return KC_ROMAN[n - 1] || String(n);
}

export function trackNumeralTitle(ordinal, kind, { edited = false, ghost = false } = {}) {
  const family = kind === 'fx' ? 'FX' : kind === 'math' ? 'M' : 'KC';
  const n = Number(ordinal);
  if (ghost) return `${family} ${n} — tap to arm`;
  return `${family} track ${n}${edited ? ' — editing' : ''}`;
}
