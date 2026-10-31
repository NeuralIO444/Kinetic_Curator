// rewrite.js — PATTERN REWRITE mode: a grid that grows itself by rewrite rules (#1823).
//
// Spec: docs/PATTERN_SPEC.md — Composition (REWRITE).
//
// The other PATTERN modes deal a finished grid. REWRITE grows one, MarkovJunior-style
// (kernel/markov.js): seeded growth tips ("heads") sit on an empty grid; per step, one
// rule fires at one seeded-chosen match —
//
//   extend  a head advances into a void cell, leaving path behind it
//   spawn   a path cell buds a new head into adjacent void (weight = MIX)
//   seal    H → P: once growth stalls, leftover heads die into path
//
// Both growth rules are CONTEXT rules (3×3): the target cell's other neighbours must
// still be void. That one constraint is what makes corridors instead of flood fill —
// growth stays one cell wide, corridors keep a cell of void between them and never
// merge, and no 2×2 block of path can ever form. (It is also the issue's point about
// Markov rewriting: the rule sees its neighbourhood before it fires.)
//
// — until the program ends or the hard step budget does. The picture is the growth
// itself: path cells are coloured by WHEN they were born, oldest darkest, along the
// palette's swatches sorted dark → light, so the maze's history reads as strata and
// two corridors that met late are visibly younger than the trunk that spawned them.
// Live heads (while DRIFT runs the growth) wear the ramp's lightest colour.
//
// Time: DRIFT is the growth's own clock. DRIFT 0 = the finished growth, drawn once
// and cached like any still. DRIFT above 0 replays the growth from the seed over
// REWRITE_GROW_S DRIFT-seconds, holds the finished maze for REWRITE_HOLD_S, and
// regrows — a frame is the state after k steps, and k is a pure function of
// (seed, params, drift, t), so any frame replays exactly (the replay law).
//
// Pure: no DOM, no Math.random, no clock. Rules are discrete grid operations —
// countable, true/false, the TE side of the DS — even though the picture is Davis.

import { compileRule, createRewrite } from '../engine/kernel/markov.js';
import { registerCostTier } from '../engine/kernel/costRegistry.mjs';
import { hash32, toRgba, parseHex, glyphRoles } from './engine.js';
import { mkRng } from '../engine/prng.js';

/** Cell states. WALL never occurs in this slice's ruleset output — it is the
 *  alphabet's reserved state for obstacle cells a future ruleset may seed. */
export const RW_VOID = 0;
export const RW_PATH = 1;
export const RW_HEAD = 2;
export const RW_WALL = 3;
const ALPHABET = { '.': RW_VOID, P: RW_PATH, H: RW_HEAD, '#': RW_WALL };

/** DENSITY 4..12 → 8..24 cells across (the TIDES grid rhythm). */
export const REWRITE_CELLS_PER_DENSITY = 2;
export const REWRITE_DEFAULT_DENSITY = 10;
export const REWRITE_DEFAULT_MIX = 0.4;
/**
 * The hard per-run rule-application budget the issue demands: growth stops here,
 * finished or not (a budget-cut growth renders with its heads still lit — it is
 * never allowed to search forever). At the largest grid (24 across) a full fill
 * needs well under half of this; the rest is headroom for bushier rulesets.
 */
export const REWRITE_MAX_STEPS = 1024;
/** DRIFT-seconds for one full growth replay at DRIFT 1. */
export const REWRITE_GROW_S = 6;
/** DRIFT-seconds the finished maze holds before it regrows. */
export const REWRITE_HOLD_S = 2;
/** Spawn weight at MIX 1 (extend is weight 1): how freely corridors bud new heads. */
export const REWRITE_SPAWN_W_MAX = 0.3;
/** Seeded heads: MIX 0 grows a single trunk; MIX 1 opens with this many. */
export const REWRITE_HEADS_MAX = 4;
/** The drawn cell as a fraction of its slot: the ground seam between cells is the grout. */
export const REWRITE_FILL = 0.94;

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const lum = (hex) => {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** cols for a DENSITY. Rows follow the frame height at the same square cell. */
export function rewriteCols(density) {
  const d = Math.round(Number(density) || REWRITE_DEFAULT_DENSITY);
  return Math.max(4, d * REWRITE_CELLS_PER_DENSITY);
}

/**
 * The colours: the palette's ground plus its non-ground swatches sorted dark →
 * light (the age ramp: a path cell's colour is a step along it). Heads take the
 * ramp's lightest step. Fewer swatches just make a shorter ramp; none falls back
 * to ink.
 */
export function rewriteRoles(palette) {
  const { ground, pool } = glyphRoles(palette);
  const src = pool.length ? pool : [palette?.ink || '#ffffff'];
  const ramp = src.slice().sort((a, b) => lum(a) - lum(b));
  return { ground, ramp };
}

/** How many heads a (seed, mix) opens with: 1 at MIX 0, REWRITE_HEADS_MAX at MIX 1. */
export const rewriteHeadCount = (mix) => 1 + Math.round(clamp01(Number(mix) || 0) * (REWRITE_HEADS_MAX - 1));

/**
 * The grid recipe: pure function of its inputs. Holds no cells and no time — the
 * growth is derived from it by rewriteTrajectory, and time enters at raster.
 * @returns {{kind:'rewrite', cols, rows, ground, groundRgba, ramp, rgba, headRgba,
 *   seed, mix, heads, spawnWeight}}
 */
export function assignRewrite(seed, density, mix, palette, rows) {
  const cols = rewriteCols(density);
  const nrows = Math.max(1, Math.round(rows ?? cols));
  const m = clamp01(Number(mix) || 0);
  const { ground, ramp } = rewriteRoles(palette);
  // Seeded head placement: uniform draws over the grid, kept a few cells apart so
  // trunks start as separate growths; separation gives up after a bounded number
  // of tries rather than searching (the budget law applies to placement too).
  const rng = mkRng(hash32(seed, 0x1823a) | 0 || 1);
  const total = cols * nrows;
  const heads = [];
  for (let tries = 0; tries < 64 && heads.length < rewriteHeadCount(m); tries++) {
    const i = Math.floor(rng() * total);
    const x = i % cols;
    const y = Math.floor(i / cols);
    if (heads.some((h) => Math.abs((h % cols) - x) + Math.abs(Math.floor(h / cols) - y) < 4)) continue;
    if (!heads.includes(i)) heads.push(i);
  }
  if (!heads.length) heads.push(Math.floor(rng() * total));
  return {
    kind: 'rewrite',
    cols,
    rows: nrows,
    ground,
    groundRgba: toRgba(ground),
    ramp,
    rgba: ramp.map(toRgba),
    headRgba: toRgba(ramp[ramp.length - 1]),
    seed: seed >>> 0,
    mix: m,
    heads,
    spawnWeight: REWRITE_SPAWN_W_MAX * m,
  };
}

/** The ruleset, compiled per grid (spawn's weight is the grid's MIX made concrete).
 *  Patterns are written for the rightward case; the engine's symmetries cover the
 *  rest. In each, the middle row is anchor → target, and the '.' cells around the
 *  target are the one-cell-wide constraint: its other neighbours must be void. */
function rewriteProgram(grid) {
  return [
    {
      rules: [
        compileRule(['*.*', 'P..', '*.*'], ['***', 'PH*', '***'], ALPHABET, { weight: grid.spawnWeight }),
        compileRule(['*.*', 'H..', '*.*'], ['***', 'PH*', '***'], ALPHABET, { weight: 1 }),
      ],
      steps: Infinity,
    },
    { rules: [compileRule(['H'], ['P'], ALPHABET)], steps: Infinity },
  ];
}

/**
 * The whole growth, run ONCE from the seed and remembered on the grid object:
 *   cells     the final grid (Uint8Array)
 *   born      per cell, the step it became PATH (-1 = never)
 *   bornHead  per cell, the step it became a HEAD (-1 = never)
 *   finished  whether the program completed inside the budget
 *   totalSteps the steps the run actually took (≤ REWRITE_MAX_STEPS)
 * A cell's state at any step k follows from born/bornHead alone, so every frame
 * of the growth is recoverable without re-running the program.
 */
export function rewriteTrajectory(grid) {
  if (grid._traj) return grid._traj;
  const total = grid.cols * grid.rows;
  const initial = new Uint8Array(total);
  const born = new Int32Array(total).fill(-1);
  const bornHead = new Int32Array(total).fill(-1);
  for (const h of grid.heads) {
    initial[h] = RW_HEAD;
    bornHead[h] = 0;
  }
  const run = createRewrite({
    cols: grid.cols,
    rows: grid.rows,
    phases: rewriteProgram(grid),
    initial,
    seed: hash32(grid.seed, 0x1823b) | 0 || 1,
  });
  let stepNo = 0;
  let ev;
  while (stepNo < REWRITE_MAX_STEPS && (ev = run.step())) {
    stepNo++;
    for (const i of ev.changed) {
      if (run.cells[i] === RW_PATH && born[i] === -1) born[i] = stepNo;
      else if (run.cells[i] === RW_HEAD && bornHead[i] === -1) bornHead[i] = stepNo;
    }
  }
  const traj = { cells: run.cells.slice(), born, bornHead, finished: run.done, totalSteps: stepNo };
  grid._traj = traj;
  return traj;
}

/** A cell's state at growth step k: VOID before its head, HEAD while it grows, PATH once born. */
export function rewriteStateAt(traj, i, k) {
  if (traj.born[i] !== -1 && traj.born[i] <= k) return RW_PATH;
  if (traj.bornHead[i] !== -1 && traj.bornHead[i] <= k) return RW_HEAD;
  return traj.cells[i] === RW_WALL ? RW_WALL : RW_VOID;
}

/** DRIFT-scaled time: DRIFT 0 is frozen at τ = 0 whatever the loop clock says. */
export const rewriteTau = (drift, t) => {
  const d = clamp01(Number(drift) || 0);
  return d === 0 ? 0 : d * (Number(t) || 0);
};

/**
 * The growth step a frame shows. DRIFT 0: the finished growth. DRIFT above 0:
 * the growth replays over REWRITE_GROW_S DRIFT-seconds, holds for
 * REWRITE_HOLD_S, and regrows — k cycles with τ and is capped at the run's length.
 */
export function rewriteStepAt(grid, drift, t) {
  const traj = rewriteTrajectory(grid);
  if (!(Number(drift) > 0)) return traj.totalSteps;
  const tau = rewriteTau(drift, t);
  const cycle = REWRITE_GROW_S + REWRITE_HOLD_S;
  const into = tau % cycle;
  return Math.min(traj.totalSteps, Math.floor((into / REWRITE_GROW_S) * traj.totalSteps));
}

/** A path cell's ramp index: its birth step as a fraction of the whole growth. */
export function rewriteBand(traj, i, rampLength) {
  if (rampLength <= 1 || traj.totalSteps <= 0) return 0;
  return Math.min(rampLength - 1, Math.floor((traj.born[i] / traj.totalSteps) * rampLength));
}

/**
 * Rasterize one frame into a little-endian RGBA Uint32 buffer (top row first).
 * Ground fill, then each grown cell as a hard-edged square at REWRITE_FILL of its
 * slot (the seam between cells is ground, like grout). Cells are square: side =
 * bw / cols; rows overflow the bottom edge and clip, as in every PATTERN mode.
 */
export function rasterRewrite(buf, bw, bh, grid, drift = 0, t = 0) {
  buf.fill(grid.groundRgba);
  const traj = rewriteTrajectory(grid);
  const k = rewriteStepAt(grid, drift, t);
  const cell = bw / grid.cols;
  const R = (REWRITE_FILL / 2) * cell;
  for (let r = 0; r < grid.rows; r++) {
    const cy = (r + 0.5) * cell;
    const y0 = Math.max(0, Math.ceil(cy - R - 0.5));
    const y1 = Math.min(bh - 1, Math.floor(cy + R - 0.5));
    if (y1 < y0) continue;
    for (let c = 0; c < grid.cols; c++) {
      const i = r * grid.cols + c;
      const state = rewriteStateAt(traj, i, k);
      if (state !== RW_PATH && state !== RW_HEAD) continue;
      const rgba = state === RW_HEAD ? grid.headRgba : grid.rgba[rewriteBand(traj, i, grid.ramp.length)];
      const cx = (c + 0.5) * cell;
      const x0 = Math.max(0, Math.ceil(cx - R - 0.5));
      const x1 = Math.min(bw - 1, Math.floor(cx + R - 0.5));
      if (x1 < x0) continue;
      for (let y = y0; y <= y1; y++) buf.fill(rgba, y * bw + x0, y * bw + x1 + 1);
    }
  }
  return buf;
}

/**
 * Which cell scene point (x, y) is in, for a frame `w` wide: the ground sampler
 * (#1183) uses this so marks lean toward the colour under them. Returns the
 * cell's state at the frame's growth step, its painted colour, and its u/v/side.
 */
export function rewriteCellAt(grid, w, x, y, drift, t) {
  const traj = rewriteTrajectory(grid);
  const k = rewriteStepAt(grid, drift, t);
  const cell = w / grid.cols;
  const gx = x / cell;
  const gy = y / cell;
  const c = ((Math.floor(gx) % grid.cols) + grid.cols) % grid.cols;
  const r = ((Math.floor(gy) % grid.rows) + grid.rows) % grid.rows;
  const i = r * grid.cols + c;
  const state = rewriteStateAt(traj, i, k);
  const main =
    state === RW_HEAD
      ? grid.ramp[grid.ramp.length - 1]
      : state === RW_PATH
        ? grid.ramp[rewriteBand(traj, i, grid.ramp.length)]
        : grid.ground;
  return { state, main, colors: [main], u: gx - Math.floor(gx), v: gy - Math.floor(gy), side: cell };
}

// Cost tier, declared at registration (#1823 asked for it). A CPU raster, not a GPU
// pass, so the governor's shed ladder never touches it: tier 0 like TIDES. The
// growth itself is a one-off per (seed, density, mix, size) — bounded by
// REWRITE_MAX_STEPS rule applications — paid when the pattern's plan is built,
// not per frame; the selfcheck times both the build and a moving frame.
registerCostTier('pattern/rewrite', {
  tier: 0,
  memoryBytes: 0,
  timeMs: 3,
  notes:
    "#1823 PATTERN REWRITE: CPU maze growth + square-span raster into the pattern track's own frame " +
    'buffer (moving frames capped at 1000 px wide). Growth is one-off per plan, hard-bounded at ' +
    'REWRITE_MAX_STEPS=1024 rule applications; per frame is the raster only. Still frames are drawn once and cached.',
});
