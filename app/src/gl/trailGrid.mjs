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
// not know or care which. Slice 1 shipped the grid, its sampler and the
// backstage view; slice 2 (#1837) puts a steering consumer on it (the
// moth's ember drive, engine/emberDrive.mjs, fed at cadence by
// trailGridLive.mjs) — the derivation itself is unchanged in meaning and
// bit-identical in output (see the banded loop in deriveTrailGrid).

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
  // #1837 — the banded loop: the steering cadence (trailGridLive) derives
  // this grid live, so slice 1's per-pixel floor divisions and scattered
  // accumulator writes had to go. The optimisation is EXACT — the output
  // is bit-identical to the naive loop, by construction:
  //   · cell boundaries are pure geometry: column cx owns the x-range
  //     [ceil(cx·w/cols), ceil((cx+1)·w/cols)) (the floor map is monotone,
  //     so each cell's pixels form one contiguous band per row), and the
  //     per-cell pixel count is the band widths' product — no counting.
  //   · pixels are still visited in the same y-major, x-minor order, so
  //     every cell's float64 sums accumulate in the same order as before.
  //   · a dead pixel (r = g = b = 0) adds exactly 0 to every sum and can
  //     never enter the age sums (they require light > 0), so skipping it
  //     changes nothing — the dead-pixel skip slice 1's report named.
  const xStart = new Int32Array(cols + 1);
  for (let cx = 0; cx <= cols; cx++) xStart[cx] = Math.ceil((cx * w) / cols);
  const yStart = new Int32Array(rows + 1);
  for (let cy = 0; cy <= rows; cy++) yStart[cy] = Math.ceil((cy * h) / rows);
  for (let cy = 0; cy < rows; cy++) {
    const rowCount = yStart[cy + 1] - yStart[cy];
    for (let cx = 0; cx < cols; cx++) count[cy * cols + cx] = rowCount * (xStart[cx + 1] - xStart[cx]);
  }
  for (let cy = 0; cy < rows; cy++) {
    const cellRow = cy * cols;
    for (let y = yStart[cy]; y < yStart[cy + 1]; y++) {
      const rowBase = y * w;
      for (let cx = 0; cx < cols; cx++) {
        const cell = cellRow + cx;
        for (let x = xStart[cx]; x < xStart[cx + 1]; x++) {
          const o = (rowBase + x) * 4;
          const pr = data[o];
          const pg = data[o + 1];
          const pb = data[o + 2];
          if (pr === 0 && pg === 0 && pb === 0) continue; // dead: contributes exact zeros only
          const light = (pr + pg + pb) / 3;
          sumL[cell] += light;
          sumR[cell] += pr;
          sumG[cell] += pg;
          sumB[cell] += pb;
          if (hasAge) {
            const a = ageData[rowBase + x];
            if (a >= 0 && light > 0) {
              sumAgeW[cell] += light;
              sumAge[cell] += light * a;
            }
          }
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
