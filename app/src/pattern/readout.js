// readout.js — PATTERN READOUT mode: a threshold grid that reads out a moving field (#1797).
//
// Spec: docs/PATTERN_SPEC.md — Composition (READOUT).
//
// The other PATTERN modes lay tiles down and move them. READOUT is a display: a fixed grid of
// squircles that never moves position. One shared noise field drifts under it, and every cell
// shows the field's local value two ways at once:
//   colour  — the value thresholded into three states (low / mid / high), three palette swatches
//   size    — how deep the value sits inside its state: deep = the cell swells to fill its slot,
//             near a threshold = it shrinks to a dot. So state borders draw themselves as dot-lines.
// Mid-state cells carry a small square "eye" in the high-state colour.
// Over time the field breathes from blotchy patches into broad horizontal bands and back.
//
// Pure: no DOM, no Math.random, no clock. Everything is a function of (seed, density, mix, palette,
// drift, t) — same inputs, same pixels (the replay law). `t` is loop time in seconds; DRIFT scales it,
// so DRIFT 0 is one still frame and the pattern is cached like any other still.

import { createNoise } from '../engine/noise.js';
import { registerCostTier } from '../engine/kernel/costRegistry.mjs';
import { hash32, toRgba, parseHex, glyphRoles } from './engine.js';

/** DENSITY 4..12 → 8..24 cells across (the reference grid is about 20 across). */
export const READOUT_CELLS_PER_DENSITY = 2;
export const READOUT_DEFAULT_DENSITY = 10;
export const READOUT_DEFAULT_MIX = 0.4;

/** Field frequency in noise units per cell: MIX 0 = broad patches, MIX 1 = fine speckle. */
export const READOUT_FREQ_MIN = 0.07;
export const READOUT_FREQ_MAX = 0.26;
/** Seconds of DRIFT-scaled time for one blotchy → banded → blotchy breath. */
export const READOUT_BREATH_S = 9;
/** How far the field squashes sideways at full band (1 = pure horizontal stripes). */
export const READOUT_BAND_SQUASH = 0.9;
/** Travelling wave: field units per DRIFT-second, downward. */
export const READOUT_TRAVEL = 0.32;
/** The field's own slow evolution along z, per DRIFT-second. */
export const READOUT_EVOLVE = 0.12;
/** Smallest drawn size (a dot), as a fraction of the full squircle. */
export const READOUT_SIZE_MIN = 0.14;
/** The full squircle's half-width as a fraction of the cell: the rest is the gap between cells. */
export const READOUT_FILL = 0.46;
/** Superellipse exponent: 2 = circle, large = square. 4 reads as a squircle. */
export const READOUT_SQUIRCLE_N = 4;
/** Eye half-width as a fraction of the drawn squircle half-width; drawn only when the cell is this big or more. */
export const READOUT_EYE = 0.26;
export const READOUT_EYE_MIN_SIZE = 0.5;
/** The noise sample is scaled by this before thresholding: simplex rarely leaves ±0.7. */
const GAIN = 1.45;

const TAU = Math.PI * 2;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const lum = (hex) => {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** cols for a DENSITY. Rows follow the frame height at the same square cell. */
export function readoutCols(density) {
  const d = Math.round(Number(density) || READOUT_DEFAULT_DENSITY);
  return Math.max(4, d * READOUT_CELLS_PER_DENSITY);
}

/**
 * The three state colours: the palette's strongest non-ground swatches (by weight, #1049), sorted
 * dark → light. Low state = darkest, mid = middle (it carries the eye), high = lightest (the eye's colour).
 * Fewer than three swatches cycle; none falls back to ink.
 */
export function readoutRoles(palette) {
  const { ground, pool } = glyphRoles(palette);
  const src = pool.length ? pool : [palette?.ink || '#ffffff'];
  const three = [0, 1, 2].map((i) => src[i % src.length]);
  const states = three.slice().sort((a, b) => lum(a) - lum(b));
  return { ground, states };
}

/**
 * The grid: pure function of its inputs. Holds no time — time enters at sample/raster.
 * @returns {{kind:'readout', cols, rows, ground, groundRgba, states, rgba, freq, noise}}
 */
export function assignReadout(seed, density, mix, palette, rows) {
  const cols = readoutCols(density);
  const nrows = Math.max(1, Math.round(rows ?? cols));
  const { ground, states } = readoutRoles(palette);
  return {
    kind: 'readout',
    cols,
    rows: nrows,
    ground,
    groundRgba: toRgba(ground),
    states,
    rgba: states.map(toRgba),
    freq: READOUT_FREQ_MIN + (READOUT_FREQ_MAX - READOUT_FREQ_MIN) * clamp01(Number(mix) || 0),
    // One isolated field per seed (no shared perm table): the seed's own weather.
    noise: createNoise(hash32(seed, 0x0eadb0) | 0 || 1),
  };
}

/** The breath at DRIFT-time τ: 0 = blotchy patches, 1 = broad horizontal bands. Starts blotchy. */
export function readoutBand(tau) {
  return 0.5 - 0.5 * Math.cos((TAU * tau) / READOUT_BREATH_S);
}

/** DRIFT-scaled time: DRIFT 0 is frozen at τ = 0 whatever the loop clock says. */
export const readoutTau = (drift, t) => {
  const d = clamp01(Number(drift) || 0);
  return d === 0 ? 0 : d * (Number(t) || 0);
};

/** The field value at cell (c, r) at DRIFT-time τ, in [0, 1]. */
export function readoutValue(grid, c, r, tau) {
  const band = readoutBand(tau);
  const fx = grid.freq * (1 - READOUT_BAND_SQUASH * band);
  const n = grid.noise.noise3D(c * fx, r * grid.freq - tau * READOUT_TRAVEL, tau * READOUT_EVOLVE);
  return clamp01(0.5 + 0.5 * GAIN * n);
}

/**
 * A value → { state, size }. state ∈ {0,1,2} by thresholds at 1/3 and 2/3. size ∈ [SIZE_MIN, 1]:
 * how deep the value sits in its state, measured from the threshold(s) it borders — the field's
 * extremes are full cells, the borders are dots.
 */
export function readoutCellOf(v) {
  const u = clamp01(v);
  const state = u < 1 / 3 ? 0 : u < 2 / 3 ? 1 : 2;
  let depth;
  if (state === 0) depth = (1 / 3 - u) * 3;
  else if (state === 2) depth = (u - 2 / 3) * 3;
  else depth = 1 - Math.abs((u - 0.5) * 6);
  const size = READOUT_SIZE_MIN + (1 - READOUT_SIZE_MIN) * Math.sqrt(clamp01(depth));
  return { state, size };
}

/** Every cell's {state, size} for a frame, row-major. */
export function readoutCells(grid, drift, t) {
  const tau = readoutTau(drift, t);
  const out = new Array(grid.cols * grid.rows);
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) out[r * grid.cols + c] = readoutCellOf(readoutValue(grid, c, r, tau));
  }
  return out;
}

/**
 * Rasterize one frame into a little-endian RGBA Uint32 buffer (top row first). Fills the ground,
 * then each cell's squircle by horizontal spans (pixel-centre sampled, hard edges like every PATTERN
 * mode), then the eye. Cells are square: side = bw / cols; rows overflow the bottom edge and clip.
 */
export function rasterReadout(buf, bw, bh, grid, drift = 0, t = 0) {
  buf.fill(grid.groundRgba);
  const cell = bw / grid.cols;
  const cells = readoutCells(grid, drift, t);
  const N = READOUT_SQUIRCLE_N;
  for (let r = 0; r < grid.rows; r++) {
    const cy = (r + 0.5) * cell;
    for (let c = 0; c < grid.cols; c++) {
      const { state, size } = cells[r * grid.cols + c];
      const cx = (c + 0.5) * cell;
      const R = size * READOUT_FILL * cell;
      fillSquircle(buf, bw, bh, cx, cy, R, N, grid.rgba[state]);
      if (state === 1 && size >= READOUT_EYE_MIN_SIZE) fillSquare(buf, bw, bh, cx, cy, R * READOUT_EYE, grid.rgba[2]);
    }
  }
  return buf;
}

function fillSquircle(buf, bw, bh, cx, cy, R, n, rgba) {
  if (!(R > 0)) return;
  const y0 = Math.max(0, Math.ceil(cy - R - 0.5));
  const y1 = Math.min(bh - 1, Math.floor(cy + R - 0.5));
  for (let y = y0; y <= y1; y++) {
    const dy = Math.abs(y + 0.5 - cy) / R;
    if (dy > 1) continue;
    const half = R * Math.pow(1 - Math.pow(dy, n), 1 / n);
    const x0 = Math.max(0, Math.ceil(cx - half - 0.5));
    const x1 = Math.min(bw - 1, Math.floor(cx + half - 0.5));
    if (x1 >= x0) buf.fill(rgba, y * bw + x0, y * bw + x1 + 1);
  }
}

function fillSquare(buf, bw, bh, cx, cy, e, rgba) {
  if (!(e > 0)) return;
  const y0 = Math.max(0, Math.ceil(cy - e - 0.5));
  const y1 = Math.min(bh - 1, Math.floor(cy + e - 0.5));
  const x0 = Math.max(0, Math.ceil(cx - e - 0.5));
  const x1 = Math.min(bw - 1, Math.floor(cx + e - 0.5));
  if (x1 < x0) return;
  for (let y = y0; y <= y1; y++) buf.fill(rgba, y * bw + x0, y * bw + x1 + 1);
}

/**
 * Which cell scene point (x, y) is in, for a frame `w` wide: the ground sampler (#1183) uses this so
 * marks lean toward the state colour under them. Returns the cell's state colours, its u/v and side.
 */
export function readoutCellAt(grid, w, x, y, drift, t) {
  const cell = w / grid.cols;
  const gx = x / cell;
  const gy = y / cell;
  const c = ((Math.floor(gx) % grid.cols) + grid.cols) % grid.cols;
  const r = ((Math.floor(gy) % grid.rows) + grid.rows) % grid.rows;
  const { state, size } = readoutCellOf(readoutValue(grid, c, r, readoutTau(drift, t)));
  const main = grid.states[state];
  const colors = state === 1 && size >= READOUT_EYE_MIN_SIZE ? [main, grid.states[2]] : [main];
  return { state, size, main, colors, u: gx - Math.floor(gx), v: gy - Math.floor(gy), side: cell };
}

// Cost tier, declared at registration (#1797 asked for it). A CPU raster, not a GPU pass, so the governor's
// shed ladder never touches it: tier 0 like the kernel's scent grid. Per frame: cols×rows noise samples
// (≤ 24×17 ≈ 400) plus span fills over the frame; the selfcheck times a moving 1000×700 frame against timeMs.
registerCostTier('pattern/readout', {
  tier: 0,
  memoryBytes: 0,
  timeMs: 3,
  notes:
    '#1797 PATTERN READOUT: CPU threshold grid — ≤400 simplex samples + span-filled squircles into the ' +
    "pattern track's own frame buffer (moving frames capped at 1000 px wide). Still frames are drawn once and cached.",
});
