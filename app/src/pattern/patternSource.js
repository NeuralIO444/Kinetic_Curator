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
  assign, assignQuilt, assignGlyph, rasterField, rasterGlyph, createQuiltRaster, panOffset,
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
 * A pattern that MOVES is drawn at no more than this width (the scene's own 1000 units) and scaled up by the GPU.
 * A still pattern is drawn at the full target size, once. Without the cap a 4K stage would rasterize a moving
 * pattern at four times the cost of a laptop, every frame.
 */
export const PATTERN_LIVE_MAX_W = 1000;

/** The size to draw a pattern at for a w x h target: full size while still, capped while it moves. */
export function patternDrawSize(drift, w, h) {
  const tw = Math.max(1, Math.round(w)); const th = Math.max(1, Math.round(h));
  if (!(drift > 0) || tw <= PATTERN_LIVE_MAX_W) return { w: tw, h: th, scaled: false };
  return { w: PATTERN_LIVE_MAX_W, h: Math.max(1, Math.round((th * PATTERN_LIVE_MAX_W) / tw)), scaled: true };
}

/** What decides the PICTURE (everything but time): the key a still frame, and a drifting frame's tables, are cached on. */
const staticKey = (p, pal, w, h) => JSON.stringify([p.mode, p.seed, p.density, p.mix, p.grout, p.hero, pal.swatches, pal.bg, pal.weights ?? null, w, h]);

function buildGrid(p, pal, bw, bh) {
  const tileW = bw / p.density;
  const rows = Math.max(1, Math.ceil(bh / tileW));
  if (p.mode === 'GLYPH') return { tileW, grid: assignGlyph(p.seed, p.density, p.mix, pal) };
  if (p.mode === 'FIELD') return { tileW, grid: assign(p.seed, p.density, p.mix, pal, rows) };
  return { tileW, grid: assignQuilt(p.seed, p.density, p.mix, p.hero, pal, rows) };
}

/**
 * A pattern track's frame source (#1101): one per track. It remembers what does not change between frames, so
 * a still pattern is drawn ONCE and a moving one pays only for what moves:
 *   QUILT  the still picture is drawn once; each frame repaints just the turning tiles
 *   GLYPH  the marks pulse, so each frame redraws the (culled) marks over a ground fill
 *   FIELD  the pan shifts every pixel, so each frame is a full (hoisted) raster
 * Every frame is pixel-identical to the reference rasterizers (rasterFast.selfcheck proves it).
 * The pixels it returns belong to the source and are overwritten by the next frame: upload, do not keep.
 */
export function createPatternFrames() {
  let sKey = null; let plan = null; let still = null; let out = null;
  return {
    /** @returns {{pixels: Uint32Array, w: number, h: number, key: string}} top row first */
    frame(pattern, palette, w, h, t = 0) {
      const p = sanitizePattern(pattern);
      const pal = patternPalette(palette);
      const bw = Math.max(1, Math.round(w)); const bh = Math.max(1, Math.round(h));
      const k = staticKey(p, pal, bw, bh);
      if (k !== sKey) {
        const { tileW, grid } = buildGrid(p, pal, bw, bh);
        plan = { tileW, grid, quilt: p.mode === 'QUILT' ? createQuiltRaster(grid, bw, bh, tileW, p.grout) : null };
        sKey = k; still = null;
        if (!out || out.length !== bw * bh) out = new Uint32Array(bw * bh);
      }
      const key = patternKey(p, pal, bw, bh, t);
      if (p.drift === 0) {
        if (!still) {
          if (p.mode === 'QUILT') still = plan.quilt.base;
          else if (p.mode === 'GLYPH') still = rasterGlyph(new Uint32Array(bw * bh), bw, bh, plan.grid, 0, 0);
          else still = rasterField(new Uint32Array(bw * bh), bw, bh, plan.grid, plan.tileW, panOffset(p.seed, 0, 0));
        }
        return { pixels: still, w: bw, h: bh, key };
      }
      if (p.mode === 'QUILT') plan.quilt.draw(out, p.drift, t);
      else if (p.mode === 'GLYPH') rasterGlyph(out, bw, bh, plan.grid, p.drift, t);
      else rasterField(out, bw, bh, plan.grid, plan.tileW, panOffset(p.seed, p.drift, t));
      return { pixels: out, w: bw, h: bh, key };
    },
  };
}

/**
 * One frame, top row first, little-endian RGBA packed in a Uint32Array (w * h). Stateless: it builds the grid
 * every call. The renderer uses createPatternFrames; this is for stills, tests and one-off callers.
 * @param {object} pattern a layer's pattern block (sanitized here)
 * @param {object} palette the active palette ({swatches, bg, ink, weights?})
 */
export function patternPixels(pattern, palette, w, h, t = 0) {
  return createPatternFrames().frame(pattern, palette, w, h, t).pixels.slice();
}

/** The same frame as bytes, rows flipped to GL's bottom-up order, ready for texImage2D. */
export function patternBytesGL(pattern, palette, w, h, t = 0) {
  const bw = Math.max(1, Math.round(w)); const bh = Math.max(1, Math.round(h));
  const src = patternPixels(pattern, palette, bw, bh, t);
  const outp = new Uint32Array(bw * bh);
  for (let y = 0; y < bh; y++) outp.set(src.subarray(y * bw, (y + 1) * bw), (bh - 1 - y) * bw);
  return new Uint8Array(outp.buffer);
}

/** A frame's pixels as bytes, top row first, with no copy (upload with UNPACK_FLIP_Y_WEBGL). */
export const patternBytes = (frame) => new Uint8Array(frame.pixels.buffer, frame.pixels.byteOffset, frame.pixels.byteLength);
