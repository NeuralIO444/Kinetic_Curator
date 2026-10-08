// hitBands.js — the vibe bands on a HITS pill: what the canvas was, frozen at the moment it was kept (#1124).
//
// Four bands. Three are the palette's dominant colours (the strongest swatches by weight, #1049) and one is the
// KIN heat the instrument was showing (4 steps, cool → hot). They are a frozen history, so they render TE: stepped,
// never animated, and each one traces to a captured signal. A keep from before the bands existed gets its colours
// from the palette it already stores and a cool heat band (silence, not a guess).
import { resolvePalette, normalizeHex } from '../data/palettes.js';
import { rankedSwatches } from '../data/swatchWeights.js';

export const HEAT_STEPS = 4; // 0 cool (dark), 1 low, 2 warm, 3 hot

/** The three strongest swatches of a palette, as #rrggbb. */
export function dominantColors(palette) {
  const ranked = rankedSwatches(palette).map((c) => normalizeHex(c)).filter(Boolean);
  return ranked.slice(0, 3);
}

/** What a keep stores: { c: [3 hex], h: 0..3 }. `heat` is the KIN heat shown at that instant (0..1). */
export function captureBands(paletteId, overrides, userPalettes, heatStepNow) {
  const pal = resolvePalette(paletteId, overrides ?? null, userPalettes ?? []);
  const c = dominantColors(pal);
  while (c.length < 3) c.push(normalizeHex(pal.ink) || '#888888');
  const h = Number.isInteger(heatStepNow) ? Math.max(0, Math.min(HEAT_STEPS - 1, heatStepNow)) : 0;
  return { c, h };
}

/** A stored value kept only if it is exactly what captureBands writes; anything else is dropped (the keep stays). */
export function sanitizeBands(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.c) || raw.c.length !== 3) return null;
  const c = raw.c.map((x) => (typeof x === 'string' ? normalizeHex(x) : null));
  if (c.some((x) => !x)) return null;
  const h = Number(raw.h);
  if (!Number.isInteger(h) || h < 0 || h > HEAT_STEPS - 1) return null;
  return { c, h };
}

/** The bands to draw for a keep: its own, or the palette it stores + a cool heat band. */
export function bandsFor(fav, userPalettes) {
  const own = sanitizeBands(fav?.bands);
  if (own) return own;
  return captureBands(fav?.config?.palette?.id, null, userPalettes, 0);
}
