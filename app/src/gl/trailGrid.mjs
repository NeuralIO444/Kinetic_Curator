// trailGrid.mjs — #1808 slice 1: the trail grid, ACCUM-as-memory rung 2's
// read surface.
//
// The ACCUM buffer is a shared, decaying field of light that the creatures
// already live beside. This module derives the coarse grid everything
// downstream reads: never the raw texture, a 32-wide box downsample of the
// buffer carrying, per cell, the light's energy, its mean colour (whose
// channel ratios are the spectral-fade age proxy, #1800), and — when the
// age buffer (#1805) rides along — the dominant age of the cell's light.
//
// Pure: a function of the buffer snapshot it is handed, nothing else. The
// snapshot may come from the JS mirror (selfcheck probes, stills) or from
// the live object's readTrail() (the backstage view); the derivation does
// not know or care which. Slice 1 ships the grid, its sampler and the
// backstage view only — no steering consumes it yet (that is slice 2,
// gated on Matt playing it, per the issue).

import { AGE_VOID } from './accum.mjs';

/** Grid columns, fixed by the issue's design (the #1183 contact-grid
 *  precedent: a coarse field creatures can sample on CPU). Rows follow
 *  the buffer's aspect, so cells stay square: 32×22 at pair aspect. */
export const TRAIL_GRID_COLS = 32;

/** Cell counts for a buffer of w×h: 32 columns, rows from the aspect. */
export function trailGridDims(w, h) {
  const cols = TRAIL_GRID_COLS;
  const rows = Math.max(1, Math.round((cols * h) / Math.max(1, w)));
  return { cols, rows };
}

/**
 * Derive the trail grid from one buffer snapshot.
 *
 * @param {object} args
 * @param {Float32Array|Float64Array} args.data — premultiplied RGBA,
 *   w*h*4, bottom-first (the buffer's own orientation: mirror arrays and
 *   readPixels both arrive this way). Cell row 0 is the buffer's bottom
 *   row; the sampler below speaks the same buffer space (u right, v up).
 * @param {Float32Array|Float64Array} [args.ageData] — per-pixel ages in
 *   seconds (AGE_VOID where the light has died), w*h; omit for the
 *   colour-only read (ages then read AGE_VOID and grid.hasAge is false —
 *   consumers fall back to the channel ratios, per the issue's v1
 *   substitute).
 * @param {number} args.width
 * @param {number} args.height
 * @param {number} [args.stamp] — the snapshot's deterministic stamp
 *   (recipe steps since the buffer began; derived from the step sequence,
 *   never a wall clock), carried through so a consumer can label
 *   staleness. Defaults to 0 for mirror/still snapshots.
 * @returns {{cols:number, rows:number, width:number, height:number,
 *   stamp:number, hasAge:boolean, energy:Float64Array, r:Float64Array,
 *   g:Float64Array, b:Float64Array, age:Float64Array}} — cell arrays are
 *   row-major, row 0 = bottom, float64 like the mirror's own state (the
 *   grid is a measurement; it keeps the buffer's precision). Per cell:
 *   energy = mean pixel light, light(px) = (r+g+b)/3 premultiplied;
 *   r/g/b = channel means (ratios derivable);
 *   age = the light-weighted mean age over the cell's living pixels
 *   (weight = pixel light; dead pixels contribute nothing), or AGE_VOID
 *   when no pixel in the cell carries a living age.
 */
export function deriveTrailGrid({ data, ageData = null, width, height, stamp = 0 }) {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const { cols, rows } = trailGridDims(w, h);
  const n = cols * rows;
  const energy = new Float64Array(n);
  const r = new Float64Array(n);
  const g = new Float64Array(n);
  const b = new Float64Array(n);
  const age = new Float64Array(n).fill(AGE_VOID);
  const hasAge = !!ageData;
  // Float64 accumulators: the grid must agree with the mirror's float64
  // buffer to probe tolerance, not to float32 summation drift.
  const sumL = new Float64Array(n);
  const sumR = new Float64Array(n);
  const sumG = new Float64Array(n);
  const sumB = new Float64Array(n);
  const sumAgeW = new Float64Array(n);
  const sumAge = new Float64Array(n);
  const count = new Float64Array(n);
  for (let y = 0; y < h; y++) {
    const cy = Math.min(rows - 1, Math.floor((y * rows) / h));
    for (let x = 0; x < w; x++) {
      const cx = Math.min(cols - 1, Math.floor((x * cols) / w));
      const cell = cy * cols + cx;
      const o = (y * w + x) * 4;
      const pr = data[o];
      const pg = data[o + 1];
      const pb = data[o + 2];
      const light = (pr + pg + pb) / 3;
      sumL[cell] += light;
      sumR[cell] += pr;
      sumG[cell] += pg;
      sumB[cell] += pb;
      count[cell] += 1;
      if (hasAge) {
        const a = ageData[y * w + x];
        if (a >= 0 && light > 0) {
          sumAgeW[cell] += light;
          sumAge[cell] += light * a;
        }
      }
    }
  }
  for (let cell = 0; cell < n; cell++) {
    const c = count[cell] || 1;
    energy[cell] = sumL[cell] / c;
    r[cell] = sumR[cell] / c;
    g[cell] = sumG[cell] / c;
    b[cell] = sumB[cell] / c;
    if (hasAge && sumAgeW[cell] > 0) age[cell] = sumAge[cell] / sumAgeW[cell];
  }
  return { cols, rows, width: w, height: h, stamp, hasAge, energy, r, g, b, age };
}

/** One cell by index, as a plain record. */
export function trailGridCell(grid, cx, cy) {
  const cell = cy * grid.cols + cx;
  return { energy: grid.energy[cell], r: grid.r[cell], g: grid.g[cell], b: grid.b[cell], age: grid.age[cell] };
}

/**
 * Sample the grid at buffer-space (u, v), u right / v up, both clamped
 * to 0..1. Nearest cell: every sampled value is a real measured cell
 * value, never an interpolation invented between cells. (Smoothing for
 * a steering consumer is slice 2's call, when a drive consumes this.)
 */
export function sampleTrailGrid(grid, u, v) {
  const cx = Math.min(grid.cols - 1, Math.max(0, Math.floor(u * grid.cols)));
  const cy = Math.min(grid.rows - 1, Math.max(0, Math.floor(v * grid.rows)));
  return trailGridCell(grid, cx, cy);
}

/**
 * The view's headline numbers, measured from the grid itself: the peak
 * cell (highest energy; first wins ties), how many cells hold living
 * light (a living age when ages ride along, else any energy at all),
 * and the light-weighted mean age over living cells (AGE_VOID when no
 * cell carries one).
 */
export function summarizeTrailGrid(grid) {
  let peak = { cx: 0, cy: 0, energy: 0, age: AGE_VOID };
  let litCells = 0;
  let ageW = 0;
  let ageSum = 0;
  for (let cy = 0; cy < grid.rows; cy++) {
    for (let cx = 0; cx < grid.cols; cx++) {
      const cell = cy * grid.cols + cx;
      const e = grid.energy[cell];
      if (e > peak.energy) peak = { cx, cy, energy: e, age: grid.age[cell] };
      const living = grid.hasAge ? grid.age[cell] >= 0 : e > 0;
      if (living) litCells += 1;
      if (grid.age[cell] >= 0 && e > 0) {
        ageW += e;
        ageSum += e * grid.age[cell];
      }
    }
  }
  return {
    peak,
    litCells,
    litFraction: grid.cols * grid.rows ? litCells / (grid.cols * grid.rows) : 0,
    meanAge: ageW > 0 ? ageSum / ageW : AGE_VOID,
  };
}
