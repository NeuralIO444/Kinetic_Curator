// patternSource.js — the pixels of a PATTERN track at a given size (#1098).
//
// The renderer asks for one RGBA frame per pattern layer and uploads it as a texture.
// This is the ONE place that turns a pattern block + a palette + a time into pixels, so the
// live loop, the worker, stills, exports and the selfchecks all draw the same frame.
//
// It runs the engine's reference rasterizers, which are the ones the PATTERN selfchecks prove.
// Pure and typed-array only: no canvas, no DOM, no clock. `t` is loop time in seconds.
//
// Cost: the rasterizers are per-pixel, so a frame is tens of milliseconds at 1000x700. That is
// fine for a STATIC pattern (DRIFT 0), which is drawn once and cached by `patternKey`. A moving
// pattern re-rasterizes every frame and is not 60 fps yet: #1101 replaces these with path and
// shader drawers, checked against these references.

import {
  assign, assignQuilt, assignGlyph, rasterField, rasterQuilt, rasterGlyph, panOffset,
} from './engine.js';
import { sanitizePattern } from '../state/patternTrack.js';

/** The palette fields a pattern reads. Anything else on the palette object is ignored. */
export const patternPalette = (p) => ({
  swatches: Array.isArray(p?.swatches) ? p.swatches.filter((c) => typeof c === 'string') : [],
  bg: typeof p?.bg === 'string' ? p.bg : '#000000',
  ink: typeof p?.ink === 'string' ? p.ink : '#ffffff',
  ...(Array.isArray(p?.weights) ? { weights: p.weights.slice() } : {}),
});

/**
 * Cache key for a frame: everything that changes a pixel. A pattern at DRIFT 0 is static, so
 * time is left OUT of its key and the frame is reused until a parameter, the palette or the size
 * changes. A drifting pattern keys on `t` (every frame is new).
 */
export function patternKey(pattern, palette, w, h, t = 0) {
  const p = sanitizePattern(pattern);
  const pal = patternPalette(palette);
  const time = p.drift > 0 ? Number(t) || 0 : 0;
  return JSON.stringify([p.mode, p.seed, p.density, p.mix, p.grout, p.hero, p.drift, time, pal.swatches, pal.bg, pal.weights ?? null, w, h]);
}

/**
 * One frame, top row first, little-endian RGBA packed in a Uint32Array (w * h).
 * @param {object} pattern a layer's pattern block (sanitized here)
 * @param {object} palette the active palette ({swatches, bg, ink, weights?})
 */
export function patternPixels(pattern, palette, w, h, t = 0) {
  const p = sanitizePattern(pattern);
  const pal = patternPalette(palette);
  const bw = Math.max(1, Math.round(w)); const bh = Math.max(1, Math.round(h));
  const buf = new Uint32Array(bw * bh);
  const tileW = bw / p.density;
  const rows = Math.max(1, Math.ceil(bh / tileW));
  if (p.mode === 'GLYPH') {
    return rasterGlyph(buf, bw, bh, assignGlyph(p.seed, p.density, p.mix, pal), p.drift, t);
  }
  if (p.mode === 'FIELD') {
    return rasterField(buf, bw, bh, assign(p.seed, p.density, p.mix, pal, rows), tileW, panOffset(p.seed, p.drift, t));
  }
  return rasterQuilt(buf, bw, bh, assignQuilt(p.seed, p.density, p.mix, p.hero, pal, rows), tileW, p.grout, p.drift, t);
}

/** The same frame as bytes, rows flipped to GL's bottom-up order, ready for texImage2D. */
export function patternBytesGL(pattern, palette, w, h, t = 0) {
  const bw = Math.max(1, Math.round(w)); const bh = Math.max(1, Math.round(h));
  const src = patternPixels(pattern, palette, bw, bh, t);
  const out = new Uint32Array(bw * bh);
  for (let y = 0; y < bh; y++) out.set(src.subarray(y * bw, (y + 1) * bw), (bh - 1 - y) * bw);
  return new Uint8Array(out.buffer);
}
