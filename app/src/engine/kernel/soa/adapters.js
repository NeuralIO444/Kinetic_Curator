// Kernel SoA 1/5 — boundary adapters (#1305).
//
// toObjects() / fromObjects() convert between point-set columns and the
// legacy array-of-objects shape the hot paths use today. They exist ONLY
// to let the migration slices (2–5/5) straddle the boundary while one
// path at a time converts to columns. They are not a permanent dual
// data model.
//
// ═══ KILL LIST ═══
// Each migration slice PR deletes the adapter usage for the path it
// converts. When the last path converts, THIS FILE IS DELETED.
//   slice 1/5 (trackGraph.applyField no-op path): no adapter use — the
//     path becomes a column-count check returning the input set untouched.
//   slice 2/5 (liveResolve FIELD/FEED: toNorm maps ×2, per-point closures
//     in forNeighbors, item map → column loops): deletes every
//     toObjects/fromObjects call in liveResolve.mjs and its callees.
//   slice 3/5 (feed delay slots — feedDelay.js / feedLive.js rasterize →
//     double-buffered column pairs): deletes adapter use in both files.
//   slice 4/5 (placement orchestrator writes columns directly; sampler ctx
//     column-writing mode): deletes adapter use in the orchestrator and
//     sampler ctx; then deletes adapters.js itself once zero call sites
//     remain (grep must come back empty before this file goes).
// ═════════════════
// A grep for `soa/adapters` must return only this file and its selfcheck
// after slice 4/5 lands.

import { createPointSet } from './pointSet.js';

/**
 * Columns → objects. Reads [0, set.count).
 * @returns {Array<{x,y,vx,vy,slot,energy,id,family,source}>}
 */
export function toObjects(set) {
  const n = set.count | 0;
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = {
      x: set.x[i],
      y: set.y[i],
      vx: set.vx[i],
      vy: set.vy[i],
      slot: set.slot[i],
      energy: set.energy[i],
      id: set.id[i],
      family: set.family[i],
      source: set.source[i],
    };
  }
  return out;
}

/**
 * Objects → columns. Missing fields default to 0; out-of-range integer
 * fields wrap with the column's bit width (& 0xFFFFFFFF / & 0xFFFF /
 * & 0xFF) — deterministic, no clamping surprises. Float lanes store
 * through Float32Array, so values round to float32 on the way in (a
 * toObjects→fromObjects→toObjects round trip is still exact, because the
 * second toObjects reads the already-rounded lanes).
 */
export function fromObjects(objects) {
  const arr = Array.isArray(objects) ? objects : [];
  const set = createPointSet(Math.max(1, arr.length));
  const n = arr.length;
  for (let i = 0; i < n; i++) {
    const o = arr[i] || {};
    set.x[i] = Number(o.x) || 0;
    set.y[i] = Number(o.y) || 0;
    set.vx[i] = Number(o.vx) || 0;
    set.vy[i] = Number(o.vy) || 0;
    set.slot[i] = (Number(o.slot) || 0) & 0xffff;
    set.energy[i] = Number(o.energy) || 0;
    set.id[i] = (Number(o.id) || 0) >>> 0;
    set.family[i] = (Number(o.family) || 0) & 0xff;
    set.source[i] = (Number(o.source) || 0) & 0xffff;
  }
  set.count = n;
  return set;
}
