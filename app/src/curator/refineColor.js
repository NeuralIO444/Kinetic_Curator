// refineColor.js — #1365 Q2: in REFINE, a CURATOR press gently varies colour around the palette that was kept.
//
// Matt (2026-10-12): a small hue drift and a little warmer / cooler, bounded like refine's layout spread (0.10).
// Contrast is left alone (and so are bg and ink), so the look that was kept keeps its punch.
//
// Around what was KEPT, never a walk: every refine press deals a fresh (hue, warmth) offset from the ANCHOR — the
// palette as it stood when refine started varying it — not from the last press, so a hundred presses stay as close
// to the kept palette as one. The anchor resets when anything else changes the palette (a new palette, an artist's
// edit, a voice) or when a new keep lands.
//
// Locked swatches (the strip's pins, #56) never drift. Pure: the caller passes the rng (one seeded stream per
// press, on the colour channel) and the resolved anchor swatches.
import { DEFAULT_SPREAD, clampSpread } from './refineMutate.js';
import { hueRotateHex, normalizeHex } from '../data/palettes.js';

/** The colour "dice range" spans the spread scales: hue 120 degrees, warmth 2 (-1..1). At 0.10: ±12°, ±0.2. */
export const REFINE_HUE_RANGE = 120;
export const REFINE_WARM_RANGE = 2;
/** Warmth 1 adds this share of full scale to red and takes it from blue. */
export const WARM_K = 0.25;

/** One press's offset: triangular noise, like refine's layout mutation. */
export function colorDeal(rng, spread = DEFAULT_SPREAD) {
  const s = clampSpread(spread);
  const tri = () => rng() + rng() - 1;
  // noise x spread x the full span, exactly like refineMutate's mutateOne: at 0.10, +/-12 degrees and +/-0.2
  return { hue: tri() * s * REFINE_HUE_RANGE, warm: tri() * s * REFINE_WARM_RANGE };
}

/** Warmer (+) or cooler (−): red up and blue down by warm × WARM_K of full scale, clamped. Lightness barely moves. */
export function warmHex(hex, warm) {
  const h = normalizeHex(hex);
  if (!h || !warm) return h ?? hex;
  const n = parseInt(h.slice(1), 16);
  const d = warm * WARM_K * 255;
  const c = (v) =>
    Math.round(Math.min(255, Math.max(0, v)))
      .toString(16)
      .padStart(2, '0');
  return `#${c(((n >> 16) & 255) + d)}${c((n >> 8) & 255)}${c((n & 255) - d)}`;
}

/** The anchor swatches with one deal applied; locked slots keep the anchor colour exactly. */
export function nudgeSwatches(swatches, deal, locks = null) {
  const isLocked = (i) => (Array.isArray(locks) ? !!locks[i] : !!(locks && locks[i]));
  return swatches.map((c, i) => (isLocked(i) ? c : warmHex(hueRotateHex(c, deal.hue), deal.warm)));
}

/**
 * Is the store's anchor still the palette refine should vary around? Stale when the palette id changed, when the
 * overrides are not the ones the last nudge wrote (something else edited them), or when a keep landed since.
 */
export function anchorValid(anchor, state, keepCount) {
  return (
    !!anchor &&
    anchor.paletteId === state.paletteId &&
    anchor.lastOverrides === state.paletteOverrides &&
    anchor.keepCount === keepCount
  );
}
