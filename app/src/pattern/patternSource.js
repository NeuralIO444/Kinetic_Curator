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
  assign,
  assignQuilt,
  assignGlyph,
  rasterField,
  rasterGlyph,
  createQuiltRaster,
  panOffset,
  quiltMoverMap,
  glyphMoverMap,
} from './engine.js';
import { assignTides, rasterTides, tidesCols } from './tides.js';
import { assignRewrite, rasterRewrite, rewriteCols } from './rewrite.js';
import { assignBlocks, rasterBlocks, blocksCols } from './blocks.js';
import { assignPicture, rasterPicture, pictureCols, pictureMoverMap, normalizePictureImage } from './picture.js';
import { sanitizePattern, PATTERN_FIELD_LIKE } from '../state/patternTrack.js';
import { cultureLevelAt, cultureTidesShift } from '../engine/dishLifeCouple.mjs';

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
export function patternKey(pattern, palette, w, h, t = 0, image = null, culture = null, kinT = t) {
  const p = sanitizePattern(pattern);
  const pal = patternPalette(palette);
  // #1798: a BLOCKS deal is a still — time never changes its pixels, whatever DRIFT says.
  const time = p.drift > 0 && p.mode !== 'BLOCKS' ? Number(t) || 0 : 0;
  // kin and movers change pixels only while the pattern moves, and not at all in the field-like modes (no discrete elements)
  const el = p.drift > 0 && !PATTERN_FIELD_LIKE.includes(p.mode) ? [p.kin, p.movers] : null;
  return JSON.stringify([
    p.mode,
    p.seed,
    p.density,
    p.mix,
    p.grout,
    p.hero,
    p.drift,
    time,
    pal.swatches,
    pal.bg,
    pal.weights ?? null,
    w,
    h,
    el,
    // #2104 step 4 — a boil-bound frame is a function of the kineme time too: the element
    // kinemes read kinT (the world's boil grid) while the mode motions read t. Spread only
    // when kinT actually moves pixels (a moving pattern with elements, stepped off its own
    // t), so every pre-world key stays byte-identical.
    ...(p.drift > 0 && !PATTERN_FIELD_LIKE.includes(p.mode) && p.mode !== 'BLOCKS' && Number(kinT) !== time
      ? ['B', Number(kinT) || 0]
      : []),
    // #1795: a PICTURE frame is a function of its image too — keyed on the image's id (the bundled
    // seed by default). Spread only for PICTURE, so every other mode's key stays byte-identical.
    ...(p.mode === 'PICTURE' ? [normalizePictureImage(image).id] : []),
    // #1923 Phase 2 slice C: a coupled TIDES frame is a function of the culture too — keyed on the
    // field's wake and generation and the dial (bucketed to 1/256: the slider's own resolution
    // class), so a still TIDES (DRIFT 0, no time in the key) still re-draws as the culture evolves.
    // Spread only for a coupled TIDES, so every other key — and every uncoupled key — stays
    // byte-identical. The drift-amplitude modes need no component: their bias rides the block's
    // drift value, which is already in the key.
    // Phase 3 QA follow-up: the component ALSO carries the wake (it did not in slice C). Generation
    // restarts at 0 every cycle, so (gen, dial) named two different cultures the same — slice C
    // judged that collision unreachable, and Phase 3 QA falsified the judgement end to end (shed
    // held through a cycle's last frame, released on the boundary frame: the boundary frame reads
    // the OLD cycle's gen-0 grid, the next frame the NEW cycle's gen-0 grid — one key, two
    // textures, and the renderer's upload gate kept the stale one for a generation interval).
    // Within a wake the published (gen, level) pair is atomic — level is written only where gen is
    // set or incremented — so wake + gen + dial names the frame. A grid carrying no wake keys −1.
    // Phase 4: the component ALSO carries the seed epoch (it did not in Phase 3). The "seed from
    // stage" trigger rebuilds the culture INSIDE a wake — a boundary that arrives early — so at the
    // same (wake, gen) a post-press grid differs from the pre-press one, and two consecutive frames
    // can read both (a press in a cycle's first generations lands the new seed on a generation the
    // old seed just published). The epoch is the seed's ordinal within the wake (0 = the wake's own
    // seed), so wake + epoch + gen + dial names the frame. A grid carrying no epoch keys 0.
    ...(culture && p.mode === 'TIDES'
      ? [
          'K',
          culture.grid && culture.grid.wakeMs != null && Number.isFinite(Number(culture.grid.wakeMs))
            ? Number(culture.grid.wakeMs)
            : -1,
          culture.grid && Number.isFinite(Number(culture.grid.seedEpoch)) && Number(culture.grid.seedEpoch) > 0
            ? Math.floor(Number(culture.grid.seedEpoch))
            : 0,
          culture.grid && Number.isFinite(Number(culture.grid.gen)) ? Number(culture.grid.gen) : -1,
          Math.round(Math.min(1, Math.max(0, Number(culture.coupling) || 0)) * 256),
        ]
      : []),
  ]);
}

/**
 * A pattern that MOVES is drawn at no more than this width (the scene's own 1000 units) and scaled up by the GPU.
 * A still pattern is drawn at the full target size, once. Without the cap a 4K stage would rasterize a moving
 * pattern at four times the cost of a laptop, every frame.
 */
export const PATTERN_LIVE_MAX_W = 1000;

/** The size to draw a pattern at for a w x h target: full size while still, capped while it moves. */
export function patternDrawSize(drift, w, h) {
  const tw = Math.max(1, Math.round(w));
  const th = Math.max(1, Math.round(h));
  if (!(drift > 0) || tw <= PATTERN_LIVE_MAX_W) return { w: tw, h: th, scaled: false };
  return { w: PATTERN_LIVE_MAX_W, h: Math.max(1, Math.round((th * PATTERN_LIVE_MAX_W) / tw)), scaled: true };
}

/** What decides the frame (everything but time): the key a still frame, and a drifting frame's tables, are cached on. */
const staticKey = (p, pal, w, h, image = null) =>
  JSON.stringify([
    p.mode,
    p.seed,
    p.density,
    p.mix,
    p.grout,
    p.hero,
    pal.swatches,
    pal.bg,
    pal.weights ?? null,
    w,
    h,
    PATTERN_FIELD_LIKE.includes(p.mode) ? null : [p.kin, p.movers],
    // #1795: PICTURE's grid is built from its image; the image's id stands for its pixels.
    // Spread only for PICTURE, so every other mode's key stays byte-identical.
    ...(p.mode === 'PICTURE' ? [normalizePictureImage(image).id] : []),
  ]);

function buildGrid(p, pal, bw, bh, image = null) {
  const tileW = bw / p.density;
  const rows = Math.max(1, Math.ceil(bh / tileW));
  if (p.mode === 'GLYPH') return { tileW, grid: assignGlyph(p.seed, p.density, p.mix, pal) };
  if (p.mode === 'TIDES') {
    const cell = bw / tidesCols(p.density);
    return { tileW: cell, grid: assignTides(p.seed, p.density, p.mix, pal, Math.max(1, Math.ceil(bh / cell))) };
  }
  if (p.mode === 'REWRITE') {
    const cell = bw / rewriteCols(p.density);
    return { tileW: cell, grid: assignRewrite(p.seed, p.density, p.mix, pal, Math.max(1, Math.ceil(bh / cell))) };
  }
  if (p.mode === 'FIELD') return { tileW, grid: assign(p.seed, p.density, p.mix, pal, rows) };
  if (p.mode === 'BLOCKS') {
    const cell = bw / blocksCols(p.density);
    return { tileW: cell, grid: assignBlocks(p.seed, p.density, p.mix, pal, Math.max(1, Math.ceil(bh / cell))) };
  }
  if (p.mode === 'PICTURE') {
    // #1795: the frame's image (patternSource's optional argument), or the bundled seed picture
    const cell = bw / pictureCols(p.density);
    return {
      tileW: cell,
      grid: assignPicture(p.seed, p.density, p.mix, pal, Math.max(1, Math.ceil(bh / cell)), image),
    };
  }
  return { tileW, grid: assignQuilt(p.seed, p.density, p.mix, p.hero, pal, rows) };
}

/**
 * A pattern track's frame source (#1101): one per track. It remembers what does not change between frames, so
 * a still pattern is drawn ONCE and a moving one pays only for what moves:
 *   QUILT  the still picture is drawn once; each frame repaints just the turning tiles
 *   GLYPH  the marks pulse, so each frame redraws the (culled) marks over a ground fill
 *   FIELD  the pan shifts every pixel, so each frame is a full (hoisted) raster
 *   TIDES the grid is fixed but every cell re-reads the moving field, so each frame is a full (span-filled) raster
 *   REWRITE the growth runs once per plan (hard-bounded); each frame re-rasters the state at its step
 *   BLOCKS a deal is a still whatever DRIFT says, so it always takes the drawn-once path
 *   PICTURE the picture is sampled into a grid of marks once per plan; each frame redraws the (culled) marks, like GLYPH
 * Every frame is pixel-identical to the reference rasterizers (rasterFast.selfcheck proves it).
 * The pixels it returns belong to the source and are overwritten by the next frame: upload, do not keep.
 */
export function createPatternFrames() {
  let sKey = null;
  let plan = null;
  let still = null;
  let out = null;
  return {
    /**
     * @param {object} [image] #1795 PICTURE only: the still to sample ({id, w, h, rgb}); the bundled
     *   seed picture when omitted. Every other mode ignores it.
     * @param {object} [culture] #1923 Phase 2 slice C: the dish-life coupling's TIDES descriptor
     *   ({ coupling, grid } — the seam's level snapshot), carried on the resolved block. TIDES only;
     *   the drift-amplitude modes receive their bias already folded into the block's drift value.
     * @param {number} [kinT] #2104 step 4: the time the ELEMENT KINEMES read — the standing
     *   world's boil-quantized time while a world stands, the frame's own t otherwise. Only the
     *   element transforms (elementXform) read it; mode motions (pan, pulse, growth) keep t.
     * @returns {{pixels: Uint32Array, w: number, h: number, key: string}} top row first
     */
    frame(pattern, palette, w, h, t = 0, image = null, culture = null, kinT = t) {
      const p = sanitizePattern(pattern);
      const pal = patternPalette(palette);
      const bw = Math.max(1, Math.round(w));
      const bh = Math.max(1, Math.round(h));
      const k = staticKey(p, pal, bw, bh, image);
      if (k !== sKey) {
        const { tileW, grid } = buildGrid(p, pal, bw, bh, image);
        // #1137: the seeded few elements that carry a KINEME motion (null = none, the picture as it was)
        const movers =
          p.mode === 'QUILT'
            ? quiltMoverMap(grid, p.seed, p.kin, p.movers)
            : p.mode === 'GLYPH'
              ? glyphMoverMap(grid, p.seed, p.kin, p.movers)
              : p.mode === 'PICTURE'
                ? pictureMoverMap(grid, p.seed, p.kin, p.movers)
                : null;
        plan = {
          tileW,
          grid,
          movers,
          quilt: p.mode === 'QUILT' ? createQuiltRaster(grid, bw, bh, tileW, p.grout, movers) : null,
        };
        sKey = k;
        still = null;
        if (!out || out.length !== bw * bh) out = new Uint32Array(bw * bh);
      }
      // #1923 Phase 2 slice C — the coupling's TIDES read: each cell's dealt value shifts by the
      // culture LEVEL under the cell (the seam's snapshot, sampled at the cell's centre; the raster's
      // own clamp — tidesCellOf — bounds the shifted value). Null for every other mode and every
      // uncoupled frame: the dealt readout exactly.
      const tidesBias =
        culture && p.mode === 'TIDES'
          ? (c, r, v) =>
              v +
              cultureTidesShift(
                cultureLevelAt(culture.grid, (c + 0.5) / plan.grid.cols, (r + 0.5) / plan.grid.rows),
                culture.coupling,
              )
          : null;
      const key = patternKey(p, pal, bw, bh, t, image, culture, kinT);
      if (p.drift === 0 || p.mode === 'BLOCKS') {
        // A coupled TIDES still is NOT a still: the culture evolves under it, so it re-rasters every
        // frame (into the scratch buffer, never the drawn-once cache) and its key carries the field's
        // wake and generation, so the renderer re-uploads as the culture moves.
        if (tidesBias) {
          rasterTides(out, bw, bh, plan.grid, 0, 0, tidesBias);
          return { pixels: out, w: bw, h: bh, key };
        }
        if (!still) {
          if (p.mode === 'QUILT') still = plan.quilt.base;
          else if (p.mode === 'GLYPH') still = rasterGlyph(new Uint32Array(bw * bh), bw, bh, plan.grid, 0, 0);
          else if (p.mode === 'TIDES') still = rasterTides(new Uint32Array(bw * bh), bw, bh, plan.grid, 0, 0);
          else if (p.mode === 'REWRITE') still = rasterRewrite(new Uint32Array(bw * bh), bw, bh, plan.grid, 0, 0);
          else if (p.mode === 'BLOCKS') still = rasterBlocks(new Uint32Array(bw * bh), bw, bh, plan.grid);
          else if (p.mode === 'PICTURE') still = rasterPicture(new Uint32Array(bw * bh), bw, bh, plan.grid, 0, 0);
          else still = rasterField(new Uint32Array(bw * bh), bw, bh, plan.grid, plan.tileW, panOffset(p.seed, 0, 0));
        }
        return { pixels: still, w: bw, h: bh, key };
      }
      if (p.mode === 'QUILT') plan.quilt.draw(out, p.drift, t, kinT);
      else if (p.mode === 'GLYPH') rasterGlyph(out, bw, bh, plan.grid, p.drift, t, plan.movers, kinT);
      else if (p.mode === 'TIDES') rasterTides(out, bw, bh, plan.grid, p.drift, t, tidesBias);
      else if (p.mode === 'REWRITE') rasterRewrite(out, bw, bh, plan.grid, p.drift, t);
      else if (p.mode === 'PICTURE') rasterPicture(out, bw, bh, plan.grid, p.drift, t, plan.movers, kinT);
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
export function patternPixels(pattern, palette, w, h, t = 0, image = null, culture = null) {
  return createPatternFrames().frame(pattern, palette, w, h, t, image, culture).pixels.slice();
}

/** The same frame as bytes, rows flipped to GL's bottom-up order, ready for texImage2D. */
export function patternBytesGL(pattern, palette, w, h, t = 0, image = null, culture = null) {
  const bw = Math.max(1, Math.round(w));
  const bh = Math.max(1, Math.round(h));
  const src = patternPixels(pattern, palette, bw, bh, t, image, culture);
  const outp = new Uint32Array(bw * bh);
  for (let y = 0; y < bh; y++) outp.set(src.subarray(y * bw, (y + 1) * bw), (bh - 1 - y) * bw);
  return new Uint8Array(outp.buffer);
}

/** A frame's pixels as bytes, top row first, with no copy (upload with UNPACK_FLIP_Y_WEBGL). */
export const patternBytes = (frame) =>
  new Uint8Array(frame.pixels.buffer, frame.pixels.byteOffset, frame.pixels.byteLength);
