// curator/soil.js — #1355: the SOIL MAP the PIN tool shows while it is armed (Matt, 2026-10-13, option A).
//
// A pin forms a creature only where the dish's hidden fertility is above the band's bar (curator/formation.js).
// That map was invisible, so "will this click work?" was a guess. While PIN is armed the canvas now shades it: where a
// moth could form stays clear with a faint lift, where it cannot is dimmed, deepest where the field is poorest.
//
// Honest by construction: it samples the SAME field the formation rule samples (fertilityField, same seed and
// offsets) and compares it with the SAME threshold the rule uses for the current band (thresholdsFor), so a click on
// a clear patch passes the fertility test. A moth also needs a crowd: that is the marks themselves, already visible.
// Pure (no DOM): the panel turns the grid into an image.

/** The map's resolution: cells across. Rows follow the canvas aspect. Cheap: a few thousand samples. */
export const SOIL_COLS = 160;
/** How far below the bar the dimming ramps to its deepest (field units). */
export const SOIL_RAMP = 0.35;
/** The deepest dimming (alpha of black) and the lift on fertile ground (alpha of white). */
export const SOIL_DIM = 0.42;
export const SOIL_LIFT = 0.1;

const clamp01 = (v) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/**
 * @param at         (x, y) => fertility 0..1 in scene units (fertilityField().at)
 * @param threshold  the fertility a pin needs (thresholdsFor(band).attraction)
 * @returns { cols, rows, rgba: Uint8ClampedArray }  rgba rows run top to bottom
 */
export function soilGrid(at, canvasW, canvasH, threshold, cols = SOIL_COLS) {
  const w = canvasW > 0 ? canvasW : 1000;
  const h = canvasH > 0 ? canvasH : 700;
  const c = Math.max(2, Math.floor(cols));
  const r = Math.max(2, Math.round((c * h) / w));
  const rgba = new Uint8ClampedArray(c * r * 4);
  const bar = clamp01(threshold);
  for (let j = 0; j < r; j++) {
    for (let i = 0; i < c; i++) {
      const v = clamp01(at(((i + 0.5) / c) * w, ((j + 0.5) / r) * h));
      const o = (j * c + i) * 4;
      if (v > bar) { // strictly above: the rule's own comparison
        rgba[o] = rgba[o + 1] = rgba[o + 2] = 255;
        rgba[o + 3] = Math.round(255 * SOIL_LIFT);
      } else {
        const depth = clamp01((bar - v) / SOIL_RAMP);
        rgba[o] = rgba[o + 1] = rgba[o + 2] = 0;
        rgba[o + 3] = Math.round(255 * SOIL_DIM * (0.35 + 0.65 * depth));
      }
    }
  }
  return { cols: c, rows: r, rgba };
}
