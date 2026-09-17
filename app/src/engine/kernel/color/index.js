// Kernel K5 — colour assignment channel (#64).
//
// Colour is a *channel*: it draws only from the `color` RNG stream (K0), so
// changing strategy or palette repaints the composition without disturbing
// a single coordinate. Geometry channels never see these draws.
//
// Palette overrides and the user library stay outside the kernel — callers
// hand in an already-resolved palette (resolvePalette) and get colours back.
// The kernel neither knows nor cares where the swatches came from (AC2).

import { colorForPlacement } from '../../color.js';
import { colorRngForIndex } from '../rng.js';

/** Accent offset, in swatch slots, from the chosen colour. */
const ACCENT_OFFSET = 3;

/**
 * Assign the fill and accent for one placement.
 *
 * @param {{seed:number, index:number, t:number}} ctx
 * @param {{swatches:string[]}} palette  already resolved
 * @param {string} strategy  'band' | 'zone' | 'split' | other → random
 * @returns {{color:string, accent:string, slot:number}}
 */
export function assignColor(ctx, palette, strategy) {
  const swatches = palette?.swatches;
  if (!swatches || swatches.length === 0) {
    return { color: '#ffffff', accent: '#ffffff', slot: -1 };
  }

  const { color, slot } = colorForPlacement({
    swatches,
    strategy,
    t: ctx.t,
    index: ctx.index,
    rng: colorRngForIndex(ctx.seed, ctx.index),
  });

  // Derive the accent from the SLOT, not from indexOf(color). A palette may
  // legitimately repeat a hex — the catalog's praystation ends in the same
  // near-black twice, and user palettes and harmony shuffles can produce
  // duplicates freely — in which case indexOf silently returns the first
  // match and every duplicate gets the same wrong accent.
  const accent = swatches[(slot + ACCENT_OFFSET) % swatches.length] || swatches[0];
  return { color, accent, slot };
}

/**
 * Resolve which strategy applies: an explicit operator choice (#54) wins,
 * otherwise the composition preset's authored one, otherwise 'band'.
 */
export function resolveStrategy(layoutParams, preset) {
  const chosen = layoutParams?.paletteShift;
  if (chosen && chosen !== 'auto') return chosen;
  return preset?.paletteShift || 'band';
}
