import {
  makeQuadtreeInterestingness,
  quantizeBands,
  readSmoothedBands,
  QUAD_BAND_ORDER,
} from './quadtreeSignal.js';

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
/** Cache size: the family's small-evicting-Map discipline (cf. lsystem). */
const QUAD_CACHE_SIZE = 8;

const _quadCache = new Map();

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
    if (_quadCache.size >= QUAD_CACHE_SIZE) {
      _quadCache.delete(_quadCache.keys().next().value);
    }
    _quadCache.set(key, leaves);
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

/**
 * Slice 3 — the scatter layer.
 *
 * quadtreeTree builds (and caches) the leaf array for one signal state.
 * fieldBucket is the slow-tick bucket; fieldZ = bucket * 0.25 noise units.
 * The signal key carries the quantized bands, the bucket, and the depth so
 * any of them changing rebuilds the tree (and nothing else does).
 */
export function quadtreeTree({ seed, seedOffsets = null, quadAudio = 0.5, quadField = 0.5, quadDepth = 5, bands = null, fieldBucket = 0 }) {
  const interestingness = makeQuadtreeInterestingness({
    seed, seedOffsets, quadAudio, quadField, fieldZ: fieldBucket * 0.25, bands,
  });
  return buildQuadtree({
    interestingness,
    maxDepth: Math.min(6, Math.max(1, Math.round(quadDepth) || 5)),
    seed,
    seedOffsets,
    signalKey: `${quantizeBands(bands)}:z${fieldBucket | 0}:d${Math.round(quadDepth) || 5}`,
  });
}

/**
 * Density-by-depth dealing: each leaf's share of `count` is proportional to
 * 2^depth × area(leaf) — deeper leaves are denser per unit area. Largest-
 * remainder distribution, so the total is EXACTLY `count`: the instance
 * budget is a distribution, never a multiplier.
 */
export function dealLeafCounts(leaves, count) {
  const n = Math.max(0, count | 0);
  const weights = new Array(leaves.length);
  let total = 0;
  for (let j = 0; j < leaves.length; j++) {
    const L = leaves[j];
    const w = Math.pow(2, L.depth) * L.w * L.h;
    weights[j] = w;
    total += w;
  }
  const dealt = new Array(leaves.length).fill(0);
  if (total <= 0 || n === 0) return dealt;
  const frac = new Array(leaves.length);
  let assigned = 0;
  for (let j = 0; j < leaves.length; j++) {
    const q = (n * weights[j]) / total;
    const b = Math.floor(q);
    dealt[j] = b;
    frac[j] = q - b;
    assigned += b;
  }
  // Largest remainder: hand the leftover seats to the biggest fractions.
  // `assigned` is within leaves.length of n, so the order array covers it.
  const order = frac.map((f, j) => j).sort((a, b) => frac[b] - frac[a] || a - b);
  for (let k = 0; k < n - assigned; k++) dealt[order[k]]++;
  return dealt;
}

/** Prefix sums of a dealing: prefix[j] = marks in leaves 0..j. */
export function dealPrefix(dealt) {
  const prefix = new Array(dealt.length);
  let acc = 0;
  for (let j = 0; j < dealt.length; j++) {
    acc += dealt[j];
    prefix[j] = acc;
  }
  return prefix;
}

/** Item i (0-based, i < count) → leaf index via binary search on the prefix. */
export function leafIndexFor(prefix, i) {
  let lo = 0;
  let hi = prefix.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (prefix[mid] > i) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/**
 * The sampler body, testable with an explicit clock. Reads the throttled
 * smoothed bands (the single readMeterBandLevels touch point), picks the
 * slow-tick bucket (4 Hz while audio is live, 0.25 Hz idle — the field
 * still drifts, so the tree relaxes rather than snapping), deals item i
 * to its leaf, and jitters inside the leaf bounds (the JITTER knob contract).
 */
export function quadtreePlacement(ctx, nowMs) {
  const { i, count, w, h, rng, jitter, seed, seedOffsets } = ctx;
  const quadAudio = Number.isFinite(ctx.quadAudio) ? ctx.quadAudio : 0.5;
  const quadField = Number.isFinite(ctx.quadField) ? ctx.quadField : 0.5;
  const quadDepth = Math.min(6, Math.max(1, Math.round(Number.isFinite(ctx.quadDepth) ? ctx.quadDepth : 5)));

  const bands = readSmoothedBands(nowMs);
  const audioLive = !!bands && QUAD_BAND_ORDER.some((k) => (bands[k] || 0) >= 0.02);
  const fieldBucket = Math.floor(nowMs / (audioLive ? 250 : 4000));

  const leaves = quadtreeTree({ seed, seedOffsets, quadAudio, quadField, quadDepth, bands, fieldBucket });

  // Dealing is per (tree, count); memoize on the ctx, which is fresh per
  // computeGeometrySoA call (same discipline as the brush's ctx._brush).
  // The cached tree array is identical on a cache hit, so reference
  // equality is a sound key.
  let deal = ctx._quad;
  if (!deal || deal.leaves !== leaves || deal.count !== count) {
    deal = ctx._quad = { leaves, count, prefix: dealPrefix(dealLeafCounts(leaves, count)) };
  }
  const L = leaves[leafIndexFor(deal.prefix, Math.min(Math.max(0, i | 0), Math.max(0, (count | 0) - 1)))];
  return {
    x: (L.x + rng() * L.w) * w + (rng() - 0.5) * jitter,
    y: (L.y + rng() * L.h) * h + (rng() - 0.5) * jitter,
    t: quadDepth > 0 ? L.depth / quadDepth : 0,
  };
}

/** The registered sampler: placement-time only, never per-frame. */
export function quadtree(ctx) {
  const nowMs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  return quadtreePlacement(ctx, nowMs);
}
