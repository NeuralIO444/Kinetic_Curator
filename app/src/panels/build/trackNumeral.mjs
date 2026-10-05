// #1016 — one numeral system across the stack: KC, FX and MATH all speak
// arabic, matching displayLayerName (KC-1 · FX 1 · M 1) and the PATCH
// target dropdown. Roman is retired here (the ghost double-encoding
// `IV` + `KC-4` dies with it); the M5 design migration will handle
// numerals globally later. The edited track inverts in CSS; this module
// only names the glyph.

export function trackNumeral(ordinal, kind) {
  const n = Number(ordinal);
  if (!Number.isInteger(n) || n < 1) return '';
  return String(n);
}

export function trackNumeralTitle(ordinal, kind, { edited = false, ghost = false } = {}) {
  const family = kind === 'fx' ? 'FX' : kind === 'math' ? 'M' : 'KC';
  const n = Number(ordinal);
  if (ghost) return `${family} ${n} — tap to arm`;
  return `${family} track ${n}${edited ? ' — editing' : ''}`;
}
