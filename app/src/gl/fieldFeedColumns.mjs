/** #1307 — kernel SoA slice 2/5: column loops for the liveResolve FIELD/FEED path.
 *
 * This was the single most allocation-dense per-frame path (~3N+M small
 * objects per patched layer per frame): the `toNorm` maps ×2, applyField /
 * applyFeed's internal per-point maps (with their per-point closures), and
 * the clampHop item map. All of it is now one f64 column loop per branch,
 * with zero per-point allocation and zero per-frame allocation after the
 * scratch columns warm up.
 *
 * BIT-IDENTICAL LAW. Every intermediate is computed in f64 in exactly the
 * same operation order as the object path it replaces
 * (toNorm → applyField/applyFeed → clampHop → pullPx accumulation), so the
 * same seed still produces the same output, bit for bit. Verified by
 * fieldFeedColumns.selfcheck.mjs against golden fixtures captured from the
 * object path BEFORE this slice landed
 * (app/src/gl/testdata/fieldfeed-columns.golden.json).
 *
 * Why f64 scratch columns instead of the SoA PointSet's f32 columns:
 * storing normalized coords in f32 rounds them, which changes the neighbor
 * accumulation's low bits and would need a versioned behavior flag. The law
 * says flags are for paths that CANNOT be made bit-identical — this one
 * can, so it is. (Resolved in #1309: placement stays f64 for the same
 * reason — see the PRECISION RULE in kernel/soa/pointSet.js. Bit-identity
 * wins over uniformity; never a silent precision change.)
 *
 * Why the items are mutated in place instead of spread-copied: in the
 * liveResolve flow every frame's items are fresh objects — buildPlacements'
 * bindSig compares with Object.is on an activeAssets array that liveResolve
 * rebuilds every frame, so its pool-hit path (which aliases last frame's
 * objects) can never fire here; the swarm path maps to fresh objects every
 * frame too. The old spread existed only to avoid mutating shared objects,
 * and there are no shared objects on this path. lastShown/morph still see
 * frozen last-frame values because last frame's objects are never touched
 * again. If a future change ever lets pooled items reach this path, this
 * in-place write must be revisited — hence this note.
 */

import {
  normalizePatch,
  FIELD_RADIUS,
  FIELD_SOFT,
  sampleFlow,
} from '../engine/kernel/tracks/trackGraph.js';

// Matches liveResolve.mjs's clampHop (moved here with the loop).
const HOP_MAX_PX = 4;

// f64 scratch columns for the SOURCE layer's normalized coords, reused
// across frames — the neighbor loop needs random access to them, and
// allocating two arrays per frame would defeat the purpose. Grown
// geometrically; never shrinks. Target coords stay in registers: each
// target point is visited exactly once, in order.
let srcNX = new Float64Array(0);
let srcNY = new Float64Array(0);

function ensureSrcCols(m) {
  if (srcNX.length < m) {
    const n = Math.max(64, m, srcNX.length * 2);
    srcNX = new Float64Array(n);
    srcNY = new Float64Array(n);
  }
}

/**
 * FIELD branch as a single column loop. Bit-identical to the old
 * `(src.items).map(toNorm)` + `(e.items).map(toNorm)` + `applyField` +
 * clampHop item map, including the no-op paths (strength 0 / empty source /
 * mode off → the ±1ulp-or-zero hop the old path produced) and the #507
 * mean-pull diagnostic.
 *
 * @param {Array} items target items; x/y mutated in place (see header note)
 * @param {Array} srcItems source items (read-only)
 * @param {object} patch the same patch object the old path gave applyField
 * @param {number} W,H canvas size (px)
 * @returns {number} mean post-clamp hop in px (0 when items is empty)
 */
export function resolveFieldItems(items, srcItems, patch, W, H) {
  const p = normalizePatch(patch);
  const m = srcItems ? srcItems.length : 0;
  ensureSrcCols(m);
  // Column form of toNorm, over the source set only (targets are streamed).
  for (let j = 0; j < m; j++) {
    const s = srcItems[j];
    srcNX[j] = (Number(s.x) || 0) / W;
    srcNY[j] = (Number(s.y) || 0) / H;
  }
  // applyField's no-op contract, as a column-count check: skip the neighbor
  // loop and fall through to the identity hop below.
  const live = p.mode === 'field' && p.strength !== 0 && m > 0;
  const gain = 0.002 * p.strength * p.polarity;
  const r2 = FIELD_RADIUS * FIELD_RADIUS;
  let pullSumPx = 0;
  const n = items.length;
  for (let i = 0; i < n; i++) {
    const it = items[i];
    const ix = it.x;
    const iy = it.y;
    const qx = (Number(ix) || 0) / W;
    const qy = (Number(iy) || 0) / H;
    let ax = 0;
    let ay = 0;
    if (live) {
      // The neighbor loop, verbatim from applyField: same order, same ops.
      for (let j = 0; j < m; j++) {
        const dx = srcNX[j] - qx;
        const dy = srcNY[j] - qy;
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        const den = d2 + FIELD_SOFT;
        ax += dx / den;
        ay += dy / den;
      }
    }
    const px = qx + ax * gain;
    const py = qy + ay * gain;
    // clampHop, in place. it.x/it.y are read raw here, exactly as before —
    // toNorm's Number()||0 normalization applied only to the pulled side.
    let dxh = px * W - ix;
    let dyh = py * H - iy;
    const mh = Math.hypot(dxh, dyh);
    if (mh > HOP_MAX_PX) {
      const s = HOP_MAX_PX / mh;
      dxh *= s;
      dyh *= s;
    }
    const nx = ix + dxh;
    const ny = iy + dyh;
    // #507 — the hypot runs against the pre-write position, as before.
    pullSumPx += Math.hypot(nx - ix, ny - iy);
    it.x = nx;
    it.y = ny;
  }
  return pullSumPx / Math.max(1, n);
}

/**
 * FEED branch as a single column loop. Bit-identical to the old
 * `(e.items).map(toNorm)` + `feedLive.applyTo`/`applyFeed` + clampHop item
 * map. `field` is the delay-1 field for the source slot, or null when the
 * slot has no history (the old applyTo short-circuit).
 *
 * @returns {number} mean post-clamp hop in px (0 when items is empty)
 */
export function resolveFeedItems(items, field, patch, W, H) {
  const p = normalizePatch(patch);
  // applyFeed's no-op contract: mode off or strength zero → identity hop.
  const live = p.mode === 'feed' && p.strength !== 0 && !!field;
  const amt = p.strength * p.polarity;
  let feedSumPx = 0;
  const n = items.length;
  for (let i = 0; i < n; i++) {
    const it = items[i];
    const ix = it.x;
    const iy = it.y;
    const qx = (Number(ix) || 0) / W;
    const qy = (Number(iy) || 0) / H;
    let px = qx;
    let py = qy;
    if (live) {
      const f = sampleFlow(field, qx, qy);
      px = qx + f.x * amt;
      py = qy + f.y * amt;
    }
    let dxh = px * W - ix;
    let dyh = py * H - iy;
    const mh = Math.hypot(dxh, dyh);
    if (mh > HOP_MAX_PX) {
      const s = HOP_MAX_PX / mh;
      dxh *= s;
      dyh *= s;
    }
    const nx = ix + dxh;
    const ny = iy + dyh;
    feedSumPx += Math.hypot(nx - ix, ny - iy);
    it.x = nx;
    it.y = ny;
  }
  return feedSumPx / Math.max(1, n);
}
