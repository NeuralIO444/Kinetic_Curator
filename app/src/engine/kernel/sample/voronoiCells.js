// #1196 — True Voronoi tessellation (gapless cellular fill).
//
// Sibling of the existing `voronoi` (vein) mode: that one carves empty seams
// as negative space. This one fills the cells — every region is the set of
// points geometrically closest to its seed. Gapless, no overlaps.
//
// Seeds: a Poisson-disc set (#1193) so the cells are even. Assignment is
// nearest-seed (O(nodes × seeds); no Fortune sweep needed at KC-1 counts).
// Each placement index is dealt round-robin into a cell, then rejection-
// sampled inside that cell so the nearest-seed assignment holds exactly.
//
// Cell identity is returned in the `t` lane (0..1 normalized cell index) so
// downstream palette / modulation can key per cell — that's where the visual
// richness lives. Placement is init-time; the motion row keeps it alive.
//
// Deterministic per seed. Dedicated stream 'voronoi-cells' (spatial group).
// Jitter is applied after the cell test so the geometric guarantee is on the
// base point; small jitter stays inside the cell in practice.

import { poissonPointSet } from './poisson.js';
import { rngForChannel, rngForIndex } from '../rng.js';
import { writeSampleColumns } from './columns.js';

/** Target seed count: enough for even cells, not so many that cells vanish. */
export const VORONOI_CELLS_SEED_TARGET = 16;
/** Rejection attempts before falling back to the seed itself. */
export const VORONOI_CELLS_ATTEMPTS = 32;
const CACHE_SIZE = 8;
const _seedCache = new Map();

/**
 * Seed set for a plate. Pure in (seed, seedOffsets, w, h).
 * Uses the Poisson-disc substrate so seeds are even.
 * @returns {{ x: Float64Array, y: Float64Array, n: number }}
 */
export function voronoiCellSeeds(seed, w, h, seedOffsets) {
  const key = `${seed >>> 0}|${w}|${h}|${seedOffsets ? JSON.stringify(seedOffsets) : ''}`;
  const hit = _seedCache.get(key);
  if (hit) return hit;
  // A small Poisson set — the radius law scales so ~2× the target lands.
  const set = poissonPointSet(seed, VORONOI_CELLS_SEED_TARGET, w, h, seedOffsets);
  const n = Math.max(1, set.length);
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    xs[k] = set[k].x;
    ys[k] = set[k].y;
  }
  const out = { x: xs, y: ys, n };
  if (_seedCache.size >= CACHE_SIZE) _seedCache.delete(_seedCache.keys().next().value);
  _seedCache.set(key, out);
  return out;
}

/** Clear the seed cache (tests). */
export function clearVoronoiCellCache() {
  _seedCache.clear();
}

/** Index of the nearest seed to (px, py). Ties break to the lowest index. */
export function nearestSeed(seeds, px, py) {
  let best = 0;
  let bestD = Infinity;
  for (let k = 0; k < seeds.n; k++) {
    const dx = px - seeds.x[k];
    const dy = py - seeds.y[k];
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = k; }
  }
  return best;
}

/**
 * Sampler: (ctx) => { x, y, t }.
 * t is the normalized cell index (0..1) so paletteShift / modulation can key per cell.
 */
export function voronoiCells(ctx) {
  const { i, count, w, h, rng, jitter, seed, seedOffsets, scratch } = ctx;
  const seeds = voronoiCellSeeds(seed, w, h, seedOffsets);
  const cell = i % seeds.n;
  const t = seeds.n > 1 ? cell / (seeds.n - 1) : 0.5;

  // Own stream so cell draws do not consume ctx.rng.
  const r = scratch
    ? scratch.reseed(seed, 'voronoi-cells', i, seedOffsets).draw
    : rngForIndex(seed, 'voronoi-cells', i, seedOffsets);

  let px = seeds.x[cell];
  let py = seeds.y[cell];
  for (let k = 0; k < VORONOI_CELLS_ATTEMPTS; k++) {
    const x = r() * w;
    const y = r() * h;
    if (nearestSeed(seeds, x, y) === cell) {
      px = x;
      py = y;
      break;
    }
  }
  // Fallback is the seed itself (always nearest to itself).

  const j = Number.isFinite(jitter) ? jitter : 0;
  const fx = px + (rng() - 0.5) * j;
  const fy = py + (rng() - 0.5) * j;

  if (writeSampleColumns(ctx, fx, fy, t)) return;
  return { x: fx, y: fy, t };
}
