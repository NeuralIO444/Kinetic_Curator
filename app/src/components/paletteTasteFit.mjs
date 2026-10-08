// paletteTasteFit — #1123: the palette-row taste-fit shimmer path (KC-1 DS).
//
// The diamond grammar migrates here: each named palette's chips shimmer amber
// at the taste model's fit confidence (4 compressive levels, capped dim).
// Color = the swatch itself; taste-fit = the amber shimmer (rule 5: no collisions).
//
// Rule 3 (honest signals) bites hard here: there is NO palette scoring yet.
// The taste head (curator/tasteHead.js) scores recipe/layout params, not
// palettes, and no taste.json has landed from #762 — so this returns null and
// the chips stay QUIET. Do not fake a signal: no heuristic, no hash of the
// palette id, no "looks tasty" guess. When a real per-palette fit exists,
// return it as 0..1 here and the strip lights the amber shimmer.

/**
 * Fit of one palette to the loaded taste, 0..1 — or null when there is no
 * real signal to score against. Currently always null: the scoring side
 * doesn't exist yet (#762).
 */
export function paletteTasteFit(paletteId, taste) {
  void paletteId;
  void taste;
  return null; // no signal, no shimmer — rule 3
}

/** 0..1 fit → one of 4 compressive shimmer levels (1 = faintest, 4 = strongest, capped dim). */
export function fitLevel(fit) {
  if (fit === null || fit === undefined) return 0;
  const f = Math.min(1, Math.max(0, Number(fit)));
  if (!(f > 0)) return 0;
  // Compressive: most fits land in the low levels; level 4 needs a real standout.
  if (f >= 0.85) return 4;
  if (f >= 0.6) return 3;
  if (f >= 0.35) return 2;
  return 1;
}
