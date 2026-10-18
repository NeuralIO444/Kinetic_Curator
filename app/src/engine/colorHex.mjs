// colorHex.mjs — the canonical CSS-hex parsers/encoder (audit standards,
// hex dedupe slice 1, #1682).
//
// The tree grew 19 local hex helpers. They are not one function: they
// differ in validation, fallback, and output range, and those differences
// are load-bearing at their call sites. This leaf holds the variants
// that had EXACT duplicate implementations, each preserved algorithm-for-
// algorithm and proven equal to its originals by colorHex.selfcheck's
// differential oracle sweep. Zero imports: any layer may use it.
//
// Variants deliberately NOT here (their semantics differ — see #1682):
// the 0..1-float family (accum/contactShadow/light/renderer), the
// null-fallback variants in voices/dishPigment/washBody, particles'
// white-fallback parse, and the HSL family. Slice 2 territory.

/**
 * Lenient parse: '#rrggbb' (or '#rgb') → [r, g, b] 0..255, by string
 * surgery — strips the FIRST '#', expands a 3-digit form, slices six
 * chars, parseInts base 16; anything non-finite lands on [0, 0, 0].
 * Unvalidated on purpose: this is the exact behaviour the kernel color
 * channel, fieldMap, and the pattern engine each wrote locally.
 */
export function hexToRgb255(hex) {
  const s = String(hex).replace('#', '');
  const f = s.length === 3 ? s.split('').map((c) => c + c).join('') : s;
  const n = parseInt(f.slice(0, 6), 16);
  return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [0, 0, 0];
}

/**
 * Strict parse: '#rgb' / '#rrggbb' (with or without '#') → [r, g, b]
 * 0..255, else null. Strings only, trimmed. The exact behaviour the
 * tint wash/inject pair each wrote locally.
 */
export function hexToRgb255Strict(hex) {
  if (typeof hex !== 'string') return null;
  let h = hex.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(h)) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** [r, g, b] 0..255 → '#rrggbb', channels clamped and rounded. */
export function rgb255ToHex([r, g, b]) {
  const q = (v) => Math.min(255, Math.max(0, Math.round(v))).toString(16).padStart(2, '0');
  return `#${q(r)}${q(g)}${q(b)}`;
}
