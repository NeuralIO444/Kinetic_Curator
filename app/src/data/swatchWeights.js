// swatchWeights.js — how strong each swatch of a palette is (#1049).
//
// PATTERN's GLYPH mode (#1041) restricts itself to the strongest roles of the
// active palette. A weight is a number in 0..1 per swatch, parallel to
// `swatches`. Catalog palettes carry a baked `weights` array (written by
// scripts/bake-swatch-weights.mjs, then hand-reviewed: a hand edit is the
// source of truth). Any palette without one — user-saved, imported, generated,
// or edited in the palette wing — derives it here at read time.
//
// Pure: no store, no DOM, no randomness.

import { parseHex } from '../pattern/engine.js';

const CHROMA_SHARE = 0.6;
const CONTRAST_SHARE = 0.4;

const luma = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
const chroma = ([r, g, b]) => (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
const round2 = (v) => Math.round(v * 100) / 100;
const swatchesOf = (palette) => (palette && Array.isArray(palette.swatches) ? palette.swatches : []);

/**
 * One weight in 0..1 per swatch, same order as `swatches`:
 * 0.6 × chroma + 0.4 × contrast against bg, each normalized inside the palette
 * (the most saturated swatch scores 1 on chroma, the one furthest from bg in
 * luminance scores 1 on contrast). Rounded to 2 decimals.
 */
export function deriveSwatchWeights(palette) {
  const rgb = swatchesOf(palette).map(parseHex);
  if (!rgb.length) return [];
  const bg = luma(parseHex(palette.bg || '#000000'));
  const c = rgb.map(chroma);
  const k = rgb.map((v) => Math.abs(luma(v) - bg));
  const cMax = Math.max(...c); const kMax = Math.max(...k);
  return rgb.map((_, i) => round2(
    CHROMA_SHARE * (cMax > 0 ? c[i] / cMax : 0) + CONTRAST_SHARE * (kMax > 0 ? k[i] / kMax : 0),
  ));
}

/** True when `weights` is usable for this palette: one finite 0..1 value per swatch. */
export function validWeights(palette) {
  const w = palette?.weights; const n = swatchesOf(palette).length;
  return Array.isArray(w) && n > 0 && w.length === n && w.every((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1);
}

/** The palette's own weights when they are usable, derived ones otherwise. Never throws. */
export function swatchWeights(palette) {
  return validWeights(palette) ? palette.weights.slice() : deriveSwatchWeights(palette);
}

/**
 * Swatches sorted strongest first. Ties keep their original order, so the
 * result is stable. Returns a new array; the palette is not touched.
 */
export function rankedSwatches(palette) {
  const w = swatchWeights(palette);
  return swatchesOf(palette)
    .map((color, i) => ({ color, i, w: w[i] }))
    .sort((a, b) => b.w - a.w || a.i - b.i)
    .map((e) => e.color);
}
