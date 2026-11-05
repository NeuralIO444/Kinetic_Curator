// app/src/engine/beastTrace.js — #1868 S5b: the dish writing. A roaming beast's feet leave a signed trace.
//
// Each crank turn the stance foot sets down one signature ovoid (S5a's closed curve, here as its bounding ellipse) where
// the beast stands; the mark stays where it was set and fades as the animal walks on. A plain fading graphic — the wet
// field coupling (#1814/#1841) is a named follow-up: the trace would deposit into the dish instead of being drawn over it.
// Pure: (measures, roam spec, t, params) in, marks out. Marks are fixed in time (turn n is set at n / crank rate), so a
// mark only ever fades — it never slides — and the same t gives the same marks.

import { roamAt } from './beastRoam.js';
import { footSignature } from './beastTrails.js';
import { linkageInfo, LINKAGE_TILE_K, LINKAGE_CRANK_HZ } from './beastRig.js';

/** The tuning (ruled parameters; the feel gate is Matt's). `doc.beastTrace = {…}` / `window.__KC_BEAST_TRACE = {…}`. */
export const BEAST_TRACE = Object.freeze({
  count: 6, // the most marks alive at once (the cost: one instance each)
  fade: 8, // seconds: a mark's opacity falls by 1/e every `fade` seconds after it is set
  alpha: 0.35, // a fresh mark's opacity, against the beast's own
  ramp: 0.4, // seconds a mark takes to ink in, so a new one never pops
  size: 1, // the ovoid's size against the foot curve's own bounds
});
const RANGE = Object.freeze({ count: [0, 24], fade: [0.2, 60], alpha: [0, 1], ramp: [0.02, 5], size: [0.25, 3] });

/** The defaults with `raw`'s numeric overrides laid over them, each clamped; junk is ignored. */
export function sanitizeTrace(raw) {
  const out = { ...BEAST_TRACE };
  if (raw && typeof raw === 'object') {
    for (const k of Object.keys(RANGE)) {
      const v = Number(raw[k]);
      if (raw[k] != null && Number.isFinite(v)) out[k] = Math.min(RANGE[k][1], Math.max(RANGE[k][0], v));
    }
  }
  out.count = Math.floor(out.count);
  return out;
}

const boxCache = new Map(); // measures fingerprint -> { w, h } of the foot curve in tile units, or null
function ovoidBox(measures) {
  const key = JSON.stringify(measures);
  if (boxCache.has(key)) return boxCache.get(key);
  const sig = footSignature(measures);
  let box = null;
  if (sig) {
    const xs = sig.map((p) => p.x);
    const ys = sig.map((p) => p.y);
    const k = measures.scale * LINKAGE_TILE_K;
    box = { w: (Math.max(...xs) - Math.min(...xs)) * k, h: (Math.max(...ys) - Math.min(...ys)) * k };
  }
  if (boxCache.size >= 64) boxCache.delete(boxCache.keys().next().value);
  boxCache.set(key, box);
  return box;
}

/**
 * The marks alive at `t`, oldest first. `spec` is the roam spec (`{seedKey, stride, params}`) the beast walks by. Each
 * mark is in the tile frame, y down: `{x, y, heading, w, h, alpha, age}` — the ovoid's centre, its axis (radians), its
 * extent (tile units) and its opacity factor. Empty for a stillbirth, a count of 0, or t before the first turn.
 */
export function traceMarks(measures, spec, t, rawParams = null) {
  const p = sanitizeTrace(rawParams);
  const info = linkageInfo(measures);
  const box = info.feasible ? ovoidBox(measures) : null;
  if (!box || !p.count || !(t > 0)) return [];
  const last = Math.floor(t * LINKAGE_CRANK_HZ); // the newest turn already completed
  const footY = 50 - (info.stanceMean * LINKAGE_TILE_K) / 2; // the stance foot's row, tile frame (the body centre is y 50)
  const marks = [];
  for (let n = Math.max(1, last - p.count + 1); n <= last; n++) {
    const tn = n / LINKAGE_CRANK_HZ;
    const age = t - tn;
    const alpha = p.alpha * Math.exp(-age / p.fade) * Math.min(1, age / p.ramp);
    if (alpha < 0.004) continue;
    const r = roamAt(spec, tn);
    const c = Math.cos(r.heading);
    const s = Math.sin(r.heading);
    marks.push({
      x: 50 + 0 * c - (footY - 50) * s + r.x,
      y: 50 + 0 * s + (footY - 50) * c + r.y,
      heading: r.heading,
      w: box.w * p.size,
      h: box.h * p.size,
      alpha,
      age,
    });
  }
  return marks;
}
