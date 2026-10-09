import { makeSmallCache } from '../cache.js'; // #1243 — one cache discipline

// #721 — quadtree sampler core: adaptive subdivision scatter.
//
// Pure; no React, no audio imports. The tree answers "where is point i"
// hierarchically: subdivide the plate where one "interesting" signal runs
// hot, then deal instance marks to the leaves (slice 3), denser per unit
// area where the tree ran deeper.
//
// Interestingness is INJECTED (slice 1) — a pure (x, y, depth) => 0..1
// callback over normalized cell-center coords. Slice 2 wires the real
// audio+field signal; the tree never knows the difference.

/** Hard ceiling: the tree can never hold more leaves than this. */
export const QUAD_LEAF_BUDGET = 1024;
/** Absolute max subdivision depth (spec: builder's call, 6 is the box). */
export const QUAD_MAX_DEPTH = 6;
/**
 * Split threshold (spec §Subdivision suggested ~0.35 as a starting point;
 * calibrated to 0.22 against the actual term scales: the field term's
 * scale-aware stencil reads ~0.25 at the root of a typical seed, and the
 * audio term spans 0..1 — 0.22 splits real ridges and hot bands without
 * turning a busy field uniform).
 */
export const QUAD_THRESHOLD = 0.22;
/**
 * Cache size, shared with the family's other small kernel caches (#1243:
 * cap + evict-oldest, see kernel/cache.js). Formerly a hand-rolled
 * FIFO-ish single delete on a Map.
 */
const QUAD_CACHE_SIZE = 8;

const _quadCache = makeSmallCache(QUAD_CACHE_SIZE);

/**
 * Build (or fetch from cache) the leaf array for one interestingness signal.
 *
 * Best-first subdivision: repeatedly split the highest-scoring splittable
 * leaf until the budget is spent or nothing clears the threshold. Greedy
 * and exact — leaves.length never exceeds leafBudget, and a pathological
 * all-interesting signal degrades to a uniform grid at maxDepth, not a hang.
 *
 * @param {object} opts
 * @param {(x:number,y:number,w:number,h:number,depth:number)=>number} opts.interestingness
 *   cell center (x,y), cell size (w,h), depth → 0..1
 * @param {number} [opts.maxDepth=5]
 * @param {number} [opts.leafBudget=1024]
 * @param {number} [opts.threshold=0.35]
 * @param {number} [opts.seed=1]
 * @param {object|null} [opts.seedOffsets=null]
 * @param {string} [opts.signalKey=''] — opaque caller key folded into the cache key
 * @returns {Array<{x:number,y:number,w:number,h:number,depth:number,score:number}>}
 *   flat leaf array in normalized 0..1 coords; tiles the plate exactly once
 */
export function buildQuadtree(opts) {
  const {
    interestingness,
    maxDepth = 5,
    leafBudget = QUAD_LEAF_BUDGET,
    threshold = QUAD_THRESHOLD,
    seed = 1,
    seedOffsets = null,
    signalKey = '',
  } = opts || {};
  if (typeof interestingness !== 'function') {
    throw new TypeError('buildQuadtree: interestingness must be a function');
  }
  const depth = Math.min(QUAD_MAX_DEPTH, Math.max(1, Math.round(maxDepth)));
  const budget = Math.max(1, Math.round(leafBudget));
  const key = `${seed >>> 0}:${(seedOffsets && seedOffsets.spatial) || 0}:${depth}:${budget}:${threshold}:${signalKey}`;
  let leaves = _quadCache.get(key);
  if (!leaves) {
    leaves = subdivide(interestingness, depth, budget, threshold);
    _quadCache.set(key, leaves); // evicts oldest when full (kernel/cache.js)
  }
  return leaves;
}

/** Clear the tree cache (tests; never needed in the live path). */
export function clearQuadtreeCache() {
  _quadCache.clear();
}

function subdivide(interestingness, maxDepth, leafBudget, threshold) {
  // Non-finite scores fail safe to 0 (never interesting, never a split).
  // The callback gets the cell center AND bounds: point signals (field
  // ridges) sample the center; smooth signals (audio geography) can take
  // the max over the cell so a hot band inside a cool cell still splits it.
  const scoreOf = (x, y, w, h, d) => {
    const s = interestingness(x + w / 2, y + h / 2, w, h, d);
    return Number.isFinite(s) ? Math.min(1, Math.max(0, s)) : 0;
  };
  const leaves = [{ x: 0, y: 0, w: 1, h: 1, depth: 0, score: scoreOf(0, 0, 1, 1, 0) }];
  for (;;) {
    // Splitting one leaf into four nets +3; stop before we'd exceed budget.
    if (leaves.length + 3 > leafBudget) break;
    let bi = -1;
    let bs = -Infinity;
    for (let i = 0; i < leaves.length; i++) {
      const L = leaves[i];
      // Strict > keeps the earliest leaf on ties: deterministic order.
      if (L.depth < maxDepth && L.score >= threshold && L.score > bs) {
        bs = L.score;
        bi = i;
      }
    }
    if (bi < 0) break;
    const L = leaves[bi];
    leaves[bi] = leaves[leaves.length - 1];
    leaves.pop();
    const hw = L.w / 2;
    const hh = L.h / 2;
    const nd = L.depth + 1;
    const quads = [[L.x, L.y], [L.x + hw, L.y], [L.x, L.y + hh], [L.x + hw, L.y + hh]];
    for (const [qx, qy] of quads) {
      leaves.push({ x: qx, y: qy, w: hw, h: hh, depth: nd, score: scoreOf(qx, qy, hw, hh, nd) });
    }
  }
  return leaves;
}
