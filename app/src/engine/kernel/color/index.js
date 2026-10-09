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

/** Accent offset, in swatch slots, from the chosen colour. Exported for the palette-breath applier (#1151), which re-derives accents from shifted slots. */
export const ACCENT_OFFSET = 3;

/**
 * Assign the fill and accent for one placement.
 *
 * @param {{seed:number, index:number, t:number, seedOffsets?:object}} ctx
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
    rng: colorRngForIndex(ctx.seed, ctx.index, ctx.seedOffsets),
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

/** '#rrggbb' (or '#rgb') → [r, g, b]. Local: kernel must not import pattern/. */
function parseHexColor(hex) {
  const s = String(hex).replace('#', '');
  const f = s.length === 3 ? s.split('').map((c) => c + c).join('') : s;
  const n = parseInt(f.slice(0, 6), 16);
  return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [0, 0, 0];
}

function toHexColor(r, g, b) {
  const h = (v) => Math.min(255, Math.max(0, Math.round(v))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/**
 * Tile-color lean (#1183 slice 1): mix a mark's color toward the pattern
 * ground color by `lean` (0..1, clamped).
 *
 * lean = 0 returns the input string UNTOUCHED — byte-identical, not
 * re-encoded — so the lean path at 0 is provably today's render. lean = 1
 * returns the ground color exactly.
 */
export function applyLean(color, groundHex, lean) {
  if (!(lean > 0)) return color;
  const t = Math.min(1, lean);
  const [r1, g1, b1] = parseHexColor(color);
  const [r2, g2, b2] = parseHexColor(groundHex);
  return toHexColor(
    r1 + (r2 - r1) * t,
    g1 + (g2 - g1) * t,
    b1 + (b2 - b1) * t,
  );
}
