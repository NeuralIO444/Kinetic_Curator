// #720 — DLA / Eden growth engine.
//
// Two switchable growth organisms in the sampler family (#673 phyllotaxis,
// #674 truchet, #675 voronoi scatter, #676 L-system). Unlike the rest of the
// family the aggregate is temporal: it GROWS, one tick at a time, and the
// sampler reads instance marks off the living form. The trail IS the artwork.
//
//   DLA  — diffusion-limited aggregation. Particles spawn on a circle around
//          the form, wander (8-neighbourhood random walk), and stick on
//          contact with probability `stickiness`. Spindly, coral-like,
//          dendritic; fractal dimension ~1.7.
//   Eden — every step a random frontier cell divides into a random empty
//          4-neighbour. Blobby, compact, organic; no holes, by construction.
//
// AUDIO FIRST — `audioEnergy` (0..1, null when the Stimuli audio bus is
// silent) scales the cells-per-tick drive. The curator engine (#762) owns
// WHICH bands map to rate/branching; this engine only exposes the two knobs
// it drives — growthRate and growthBranch. The per-band mapping is
// deliberately not hardcoded here.
//
// NEVER STATIC — cellsPerTick floors at 1. When silent (audioEnergy null)
// the seeded baseline keeps creeping at 0.4x drive; growthRate 0 still
// creeps. The piece never freezes; it relaxes to its remaining drivers.
//
// DETERMINISM — the aggregate is a pure function of (seed, mode, tick). One
// sequential xorshift32 stream, seeded from the master seed on the 'growth'
// channel (spatial stream), drives every walk and every division. A cache
// miss rebuilds by replaying from tick 0 with the same stream, so eviction
// can never change what (seed, tick) looks like. Audio energy changes only
// the CELLS-PER-TICK count, never the draw order.
//
// BOUND — MAX_GROWTH_CELLS caps the aggregate; past it the oldest cells age
// out FIFO. A physical bound, not a policy: the canvas can never saturate
// permanently. #793's policy engine drives the expressive lifecycle through
// the exported hooks; the bound just keeps the instrument honest.
//
// LIFECYCLE HOOKS (interface for #793) — cellAge, age01, fadeWeight,
// clearGrowth, regrowGrowth. The sampler's `t` output IS age01, so old
// growth already reads differently through the existing band-colour path.

import { hashU32 } from '../rng.js';
import { mkRng } from '../../prng.js';

/** Lattice the aggregate lives on. 128^2 = 16k cells of address space. */
const GROWTH_GRID = 128;
/** Hard cap on live cells — the canvas can never saturate permanently. */
const MAX_GROWTH_CELLS = 2048;
/** Ticks for a cell to go from newborn (t=0) to fully aged (t=1). */
const GROWTH_FADE_TICKS = 480;
/** First ensure() grows at least this many cells, so tick 0 is a form. */
const MIN_INITIAL_CELLS = 64;
/** DLA: spawn ring sits this many cells outside the current radius. */
const DLA_SPAWN_PAD = 6;
/** DLA: walkers past radius+pad respawn instead of wandering forever. */
const DLA_KILL_PAD = 22;
/** DLA: per-particle walk budget; the fallback placer guarantees termination. */
const DLA_WALK_BUDGET = 4000;

const CENTER = GROWTH_GRID / 2;
const TAU = Math.PI * 2;

// 8-neighbourhood walk directions (DLA).
const DX8 = [1, 1, 0, -1, -1, -1, 0, 1];
const DY8 = [0, 1, 1, 1, 0, -1, -1, -1];
// 4-neighbourhood division directions (Eden).
const DX4 = [1, -1, 0, 0];
const DY4 = [0, 0, 1, -1];

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Cells grown per tick. `audioEnergy` is 0..1, or null when the Stimuli bus
 * is silent. Floors at 1 — the never-static guarantee: even silent, even at
 * growthRate 0, the seeded baseline keeps creeping.
 */
export function cellsPerTick(growthRate, audioEnergy) {
  const rate = Number.isFinite(growthRate) ? Math.max(0, growthRate) : 3;
  const drive = audioEnergy == null
    ? 0.4 // seeded baseline — subtle motion and vibe always
    : 0.15 + 0.85 * clamp01(audioEnergy);
  return Math.max(1, Math.round(rate * drive));
}

/** DLA stick probability from the exposed branching knob (0..1). */
export function stickinessFor(growthBranch) {
  const b = Number.isFinite(growthBranch) ? clamp01(growthBranch) : 0.8;
  return 0.25 + 0.75 * b;
}

function newAggregate(seed, mode, seedOffsets) {
  const agg = {
    mode,
    seed: seed >>> 0,
    seedOffsets,
    tick: -1,
    cells: [], // { gx, gy, ux, uy, birth }, birth order
    occ: new Uint8Array(GROWTH_GRID * GROWTH_GRID),
    frontierArr: [], // Eden: encoded empty neighbours of the form
    frontierIdx: new Map(), // Eden: encoded -> index into frontierArr
    maxRadius: 0, // DLA: current form radius, in cells
    killR2: DLA_KILL_PAD * DLA_KILL_PAD,
    stickiness: stickinessFor(0.8),
    stream: mkRng(hashU32(seed >>> 0, 'growth', mode === 'dla' ? 0 : 1, seedOffsets)),
  };
  occupy(agg, CENTER, CENTER, 0); // the zygote
  if (mode === 'eden') addFrontierNeighbours(agg, CENTER, CENTER);
  return agg;
}

function occupy(agg, gx, gy, birth) {
  const G = GROWTH_GRID;
  const code = gy * G + gx;
  if (agg.occ[code]) return false;
  agg.occ[code] = 1;
  agg.cells.push({ gx, gy, ux: (gx + 0.5) / G, uy: (gy + 0.5) / G, birth });
  const dx = gx - CENTER;
  const dy = gy - CENTER;
  const r = Math.sqrt(dx * dx + dy * dy);
  if (r > agg.maxRadius) {
    agg.maxRadius = r;
    agg.killR2 = (r + DLA_KILL_PAD) * (r + DLA_KILL_PAD);
  }
  return true;
}

/** FIFO age-out past the cap. A bound, not a policy — see module header. */
function ageOut(agg) {
  const G = GROWTH_GRID;
  while (agg.cells.length > MAX_GROWTH_CELLS) {
    const old = agg.cells.shift();
    const code = old.gy * G + old.gx;
    agg.occ[code] = 0;
    if (agg.mode === 'eden') {
      // A frontier cell can age out before it ever divides — drop it.
      // Interior cells leave holes: the blob hollows like a lichen while
      // the frontier keeps dividing outward. Intentional.
      const fi = agg.frontierIdx.get(code);
      if (fi !== undefined) {
        const last = agg.frontierArr.pop();
        agg.frontierIdx.delete(code);
        if (fi < agg.frontierArr.length) {
          agg.frontierArr[fi] = last;
          agg.frontierIdx.set(last, fi);
        }
      }
    }
  }
}

function touchesOccupied(occ, gx, gy) {
  const G = GROWTH_GRID;
  for (let dy = -1; dy <= 1; dy++) {
    const y = gy + dy;
    if (y < 0 || y >= G) continue;
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const x = gx + dx;
      if (x < 0 || x >= G) continue;
      if (occ[y * G + x]) return true;
    }
  }
  return false;
}

function addFrontierNeighbours(agg, gx, gy) {
  const G = GROWTH_GRID;
  for (let d = 0; d < 4; d++) {
    const nx = gx + DX4[d];
    const ny = gy + DY4[d];
    if (nx < 1 || nx > G - 2 || ny < 1 || ny > G - 2) continue;
    const code = ny * G + nx;
    if (agg.occ[code] || agg.frontierIdx.has(code)) continue;
    agg.frontierIdx.set(code, agg.frontierArr.length);
    agg.frontierArr.push(code);
  }
}

function dlaAddCell(agg, birth) {
  const G = GROWTH_GRID;
  const { stream, occ } = agg;
  let px = 0;
  let py = 0;
  const spawn = () => {
    const ang = stream() * TAU;
    const r = agg.maxRadius + DLA_SPAWN_PAD;
    px = CENTER + Math.cos(ang) * r;
    py = CENTER + Math.sin(ang) * r;
  };
  spawn();
  let guard = 0;
  while (guard++ < DLA_WALK_BUDGET) {
    const ix = Math.round(px);
    const iy = Math.round(py);
    const code = iy * G + ix;
    if (!occ[code] && touchesOccupied(occ, ix, iy) && stream() < agg.stickiness) {
      occupy(agg, ix, iy, birth);
      ageOut(agg);
      return;
    }
    const d = (stream() * 8) | 0;
    px += DX8[d];
    py += DY8[d];
    if (px < 1) px = 1;
    else if (px > G - 2) px = G - 2;
    if (py < 1) py = 1;
    else if (py > G - 2) py = G - 2;
    const dx = px - CENTER;
    const dy = py - CENTER;
    if (dx * dx + dy * dy > agg.killR2) spawn();
  }
  // Walk budget exhausted (pathological): drop onto a free neighbour of a
  // random existing cell so the tick always terminates with a new cell.
  for (let attempt = 0; attempt < 32; attempt++) {
    const src = agg.cells[(stream() * agg.cells.length) | 0];
    for (let d = 0; d < 8; d++) {
      const nx = src.gx + DX8[d];
      const ny = src.gy + DY8[d];
      if (nx < 1 || nx > G - 2 || ny < 1 || ny > G - 2) continue;
      if (occupy(agg, nx, ny, birth)) {
        ageOut(agg);
        return;
      }
    }
  }
}

function edenAddCell(agg, birth) {
  const G = GROWTH_GRID;
  const { stream, frontierArr, frontierIdx } = agg;
  if (!frontierArr.length) return;
  const pick = (stream() * frontierArr.length) | 0;
  const code = frontierArr[pick];
  const gx = code % G;
  const gy = (code / G) | 0;
  // Swap-remove from the frontier.
  const last = frontierArr.pop();
  frontierIdx.delete(code);
  if (pick < frontierArr.length) {
    frontierArr[pick] = last;
    frontierIdx.set(last, pick);
  }
  if (occupy(agg, gx, gy, birth)) addFrontierNeighbours(agg, gx, gy);
  ageOut(agg);
}

function advanceTo(agg, targetTick, opts) {
  const { growthRate, growthBranch, audioEnergy } = opts || {};
  agg.stickiness = stickinessFor(growthBranch);
  while (agg.tick < targetTick) {
    agg.tick++;
    let n = cellsPerTick(growthRate, audioEnergy);
    if (agg.tick === 0 && n < MIN_INITIAL_CELLS) n = MIN_INITIAL_CELLS;
    for (let k = 0; k < n; k++) {
      if (agg.mode === 'dla') dlaAddCell(agg, agg.tick);
      else edenAddCell(agg, agg.tick);
    }
  }
}

// Cached per (seed, mode): the aggregate is a living process, so the cache
// holds the stream state and advances it. A miss REPLAYS from tick 0 with
// the same stream — eviction can never change what (seed, tick) looks like.
// Small Map, same reentrancy rationale as the CA field and Voronoi caches.
const _growthCache = new Map();

function growthKey(seed, mode, seedOffsets) {
  const off = (seedOffsets && seedOffsets.spatial) || 0;
  return `${seed >>> 0}:${mode}:${off}`;
}

/**
 * The aggregate for (seed, mode) advanced to `tick`. Pure in (seed, mode,
 * tick): same inputs always yield the same cells, regardless of cache state.
 */
export function ensureAggregate(seed, mode, tick, opts) {
  const key = growthKey(seed, mode, opts && opts.seedOffsets);
  let agg = _growthCache.get(key);
  if (!agg || agg.tick > tick) {
    agg = newAggregate(seed, mode, opts && opts.seedOffsets);
    if (_growthCache.size > 8) _growthCache.clear();
    _growthCache.set(key, agg);
  }
  if (agg.tick < tick) advanceTo(agg, tick, opts);
  return agg;
}

/**
 * Registry sampler entry. Reads the living aggregate; `t` is the cell's
 * normalised age (0 newborn → 1 oldest), so old growth already reads
 * differently through the band-colour path.
 */
export function sampleGrowthPoint(ctx, mode) {
  const { i, w, h, rng, jitter, seed, seedOffsets } = ctx;
  const tick = Math.max(0, Math.floor(Number(ctx.growthTick) || 0));
  const agg = ensureAggregate(seed, mode, tick, {
    growthRate: ctx.growthRate,
    growthBranch: ctx.growthBranch,
    audioEnergy: ctx.audioEnergy == null ? null : Number(ctx.audioEnergy),
    seedOffsets,
  });
  const n = agg.cells.length;
  if (!n) return { x: w / 2, y: h / 2, t: 0 };
  const cell = agg.cells[i % n];
  const fit = Math.min(w, h) * 0.92;
  return {
    x: w / 2 + (cell.ux - 0.5) * fit + (rng() - 0.5) * jitter,
    y: h / 2 + (cell.uy - 0.5) * fit + (rng() - 0.5) * jitter,
    t: GrowthHooks.age01(cell.birth, agg.tick),
  };
}

/**
 * Lifecycle hooks for #793's policy engine. Mechanism only — this module
 * never decides WHEN to fade, clear, or regrow; it just makes the verbs
 * available and honest.
 */
export const GrowthHooks = {
  /** Ticks since the cell was born. */
  cellAge: (cell, tick) => tick - cell.birth,
  /** Normalised age: 0 newborn → 1 fully aged (GROWTH_FADE_TICKS). */
  age01: (birth, tick) => {
    const b = Number.isFinite(birth) ? birth : 0;
    const t = Number.isFinite(tick) ? tick : 0;
    return clamp01((t - b) / GROWTH_FADE_TICKS);
  },
  /** Fade curve over age01: 1 at birth, 0 when fully aged, smooth between. */
  fadeWeight: (a01) => {
    const t = clamp01(Number.isFinite(a01) ? a01 : 0);
    return 1 - t * t * (3 - 2 * t);
  },
  /** Drop the cached aggregate; the next sample regrows it from the seed. */
  clearGrowth: (seed, mode, seedOffsets) => {
    _growthCache.delete(growthKey(seed, mode, seedOffsets));
  },
  /** Clear, then regrow to `tick` (default 0) with the given params. */
  regrowGrowth: (seed, mode, seedOffsets, tick = 0, opts) => {
    _growthCache.delete(growthKey(seed, mode, seedOffsets));
    return ensureAggregate(seed, mode, Math.max(0, Math.floor(tick) || 0), {
      ...(opts || {}),
      seedOffsets,
    });
  },
  /** Introspection for tests and #793. */
  constants: Object.freeze({
    GROWTH_GRID,
    MAX_GROWTH_CELLS,
    GROWTH_FADE_TICKS,
    MIN_INITIAL_CELLS,
  }),
};
