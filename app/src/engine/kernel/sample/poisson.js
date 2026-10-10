// #1193 — Poisson-disc (blue-noise) sampler: Bridson's algorithm.
//
// Even, natural scatter with a strict minimum distance between points — no
// grid ghost (like `grid`), no spiral structure (like `phyllotaxis`), no
// clumping (like `random`). This is the everyday "organic even" layout, and
// the substrate the #1193–#1197 program wants for seeds and attractors.
//
// ALGORITHM — Bridson 2007, textbook form:
//   1. background grid, cell size r/√2 (each cell holds at most one point);
//   2. seed one random point, push it on the active list;
//   3. pick a random active point, propose k=30 candidates in the annulus
//      [r, 2r] around it, accept the first with no neighbour inside r;
//   4. an active point that rejects all k leaves the list; the set is done
//      when the list empties. Init-time CPU only, zero per-frame GPU cost.
//
// NEIGHBOUR CHECKS — a note on the existing quadtree: the module in this
// directory (`quadtree.js`) is an adaptive-subdivision *signal* tree — it
// answers "where is the field hot", not "what points are near (x, y)". It
// exposes no point-query API, so Bridson's neighbour checks use the
// algorithm's own canonical background grid (a Map-free cell array local to
// the generation, ~15 lines). No new spatial-index module was added.
//
// RNG DISCIPLINE — the whole set is generated on one dedicated stream,
// `rngForChannel(seed, 'poisson', seedOffsets)` ('poisson' rides the spatial
// stream via STRING_CHANNEL_GROUPS, so re-rolling SPATIAL re-rolls the
// scatter and nothing else). ctx.rng is never touched, so other draws don't
// shift. Jitter is deliberately NOT applied (like `brush`): jitter would
// break the min-distance guarantee the selfcheck asserts exactly.
//
// DEALING — Bridson yields a maximal set sized by r, not by count. The set
// is deterministically shuffled, then the sampler deals `set[i % set.length]`
// (the lsystem/brush round-robin precedent). With the radius law below the
// set runs ~2× count, so indices never wrap in practice; if they ever do,
// points repeat rather than the sampler failing.

import { rngForChannel } from '../rng.js';
import { writeSampleColumns } from './columns.js'; // #1309 — column-writing protocol

/** Density constant: r = K·√(A/n). K≈0.65 lands maximal sets near 2× count. */
export const POISSON_DENSITY_K = 0.65;
/** Candidates proposed per active point (Bridson's k). */
export const POISSON_CANDIDATES = 30;
/** Cache size: the family's small-evicting-Map discipline (cf. lsystem). */
const POISSON_CACHE_SIZE = 8;

const _poissonCache = new Map();

/**
 * Minimum separation for `count` points on a w×h plate.
 * Scales with node count and canvas size so density stays sensible from
 * ~50 to ~500 nodes. `radiusOverride` (ctx.poissonRadius) wins when finite.
 */
export function poissonMinDistance(count, w, h, radiusOverride) {
  const n = Math.max(1, Math.round(count) || 1);
  const cw = Math.max(1, w);
  const ch = Math.max(1, h);
  let r = POISSON_DENSITY_K * Math.sqrt((cw * ch) / n);
  if (Number.isFinite(radiusOverride) && radiusOverride > 0) r = radiusOverride;
  // Clamp: never larger than half the short side (tiny counts), never
  // below 1px (absurd counts) — both degrade gracefully, never hang.
  return Math.min(Math.max(r, 1), Math.min(cw, ch) * 0.5);
}

/** Cache key: everything the set is a pure function of. */
function poissonKey(seed, count, w, h, r, seedOffsets) {
  const off = (seedOffsets && seedOffsets.spatial) || 0;
  return `${seed >>> 0}:${off}:${Math.max(1, Math.round(count) || 1)}:${w}x${h}:${r.toFixed(3)}`;
}

/**
 * Generate the full Bridson point set. Exported for the selfcheck and for
 * the #1195–#1197 samplers, which want this set as seeds.
 * @returns {Array<{x:number,y:number}>} shuffled, in-bounds, min-distance held
 */
export function poissonPointSet(seed, count, w, h, seedOffsets = null, radiusOverride) {
  const r = poissonMinDistance(count, w, h, radiusOverride);
  const key = poissonKey(seed, count, w, h, r, seedOffsets);
  let set = _poissonCache.get(key);
  if (set) return set;

  const cw = Math.max(1, w);
  const ch = Math.max(1, h);
  const stream = rngForChannel(seed, 'poisson', seedOffsets);

  // Background grid: cell r/√2 ⇒ a disc of radius r spans at most ±2 cells.
  const cell = r / Math.SQRT2;
  const cols = Math.max(1, Math.ceil(cw / cell));
  const rows = Math.max(1, Math.ceil(ch / cell));
  const grid = new Int32Array(cols * rows).fill(-1);
  const xs = [];
  const ys = [];

  const cellOf = (x, y) => {
    const gx = Math.min(cols - 1, Math.max(0, Math.floor(x / cell)));
    const gy = Math.min(rows - 1, Math.max(0, Math.floor(y / cell)));
    return gy * cols + gx;
  };

  function farEnough(x, y) {
    const ccx = Math.floor(x / cell);
    const ccy = Math.floor(y / cell);
    const r2 = r * r;
    for (let dy = -2; dy <= 2; dy++) {
      const gy = ccy + dy;
      if (gy < 0 || gy >= rows) continue;
      for (let dx = -2; dx <= 2; dx++) {
        const gx = ccx + dx;
        if (gx < 0 || gx >= cols) continue;
        const pi = grid[gy * cols + gx];
        if (pi < 0) continue;
        const ddx = x - xs[pi];
        const ddy = y - ys[pi];
        if (ddx * ddx + ddy * ddy < r2) return false;
      }
    }
    return true;
  }

  function insert(x, y) {
    const pi = xs.length;
    xs.push(x);
    ys.push(y);
    grid[cellOf(x, y)] = pi;
    return pi;
  }

  // Seed point, then the active-list front.
  const active = [insert(stream() * cw, stream() * ch)];
  let activeCount = 1;
  const TAU = Math.PI * 2;

  while (activeCount > 0) {
    const ai = Math.floor(stream() * activeCount);
    const pi = active[ai];
    const px = xs[pi];
    const py = ys[pi];
    let accepted = false;
    for (let k = 0; k < POISSON_CANDIDATES && !accepted; k++) {
      const ang = stream() * TAU;
      const rad = r * (1 + stream()); // annulus [r, 2r]
      const x = px + Math.cos(ang) * rad;
      const y = py + Math.sin(ang) * rad;
      if (x < 0 || x >= cw || y < 0 || y >= ch) continue;
      if (farEnough(x, y)) {
        active[activeCount++] = insert(x, y);
        accepted = true;
      }
    }
    if (!accepted) {
      // Swap-remove: the front shrinks exactly as fast as it stalls.
      active[ai] = active[--activeCount];
    }
  }

  // Deterministic shuffle on the same stream: the generation order grows
  // outward from the seed point, so dealing it raw would bias early indices
  // to one region. A shuffled maximal set deals as a uniform blue-noise
  // subset.
  set = xs.map((x, k) => ({ x, y: ys[k] }));
  for (let k = set.length - 1; k > 0; k--) {
    const j = Math.floor(stream() * (k + 1));
    const tmp = set[k];
    set[k] = set[j];
    set[j] = tmp;
  }

  if (_poissonCache.size >= POISSON_CACHE_SIZE) {
    _poissonCache.delete(_poissonCache.keys().next().value);
  }
  _poissonCache.set(key, set);
  return set;
}

/** Clear the set cache (tests; never needed in the live path). */
export function clearPoissonCache() {
  _poissonCache.clear();
}

/**
 * Sampler: (ctx) => { x, y }. Deals from the cached set; pure per index.
 * No jitter, no ctx.rng — the min-distance guarantee is exact, not
 * approximate (same discipline as `brush`).
 */
export function poisson(ctx) {
  const { i, count, w, h, seed, seedOffsets, poissonRadius } = ctx;
  const set = poissonPointSet(seed, count, w, h, seedOffsets, poissonRadius);
  if (!set.length) {
    if (writeSampleColumns(ctx, w / 2, h / 2)) return; // #1309 — column mode
    return { x: w / 2, y: h / 2 };
  }
  const p = set[i % set.length];
  if (writeSampleColumns(ctx, p.x, p.y)) return; // #1309 — column mode
  return { x: p.x, y: p.y };
}
