// kinemes.js — KINEME, the motion library (#781 Build A).
//
// A kineme is the smallest unit of motion (as a phoneme is of speech). Assets
// stay plain static SVG sources: motion never lives on an asset definition. A
// kineme is a named, reusable preset; `assetKineme` (store + project document)
// maps asset ids to kineme ids. The GPU evaluates the motion per instance in
// QUAD_VS, which every render path shares (in-thread loop, worker, stills).
//
// Build A kinds move the WHOLE mark. Motion inside a mark (a needle over a
// still dial face) is Build C: cell kinemes, not this module's kinds.
//
// Browser-safe, pure.

/** Shader kind ids (QUAD_VS switches on these). 0 is reserved for "none". */
export const KINEME_KINDS = Object.freeze({ spin: 1, osc: 2, pulse: 3, blink: 4, bob: 5 });

/**
 * The library. `period` in seconds; `amp` per kind: osc = ± degrees,
 * pulse = ± scale fraction, blink = duty (fraction of the period visible),
 * bob = ± scene units along the screen's y. spin ignores amp (one turn/period).
 */
export const KINEMES = Object.freeze([
  { id: 'spin', kind: 'spin', period: 4.0, amp: 0 },
  { id: 'rock', kind: 'osc', period: 2.4, amp: 18 },
  { id: 'pulse', kind: 'pulse', period: 1.6, amp: 0.12 },
  { id: 'blink', kind: 'blink', period: 1.0, amp: 0.5 },
  { id: 'bob', kind: 'bob', period: 3.0, amp: 6 },
].map(Object.freeze));

/** Most kinemes one frame may reference — the QUAD_VS uniform table size. */
export const KINEME_TABLE_MAX = 16;

const BY_ID = new Map(KINEMES.map((k) => [k.id, k]));

/** The kineme for an id, or undefined. */
export function getKineme(id) {
  return BY_ID.get(id);
}

/**
 * Sanitize an asset → kineme map (project document / import trust boundary).
 * Unknown kineme ids and non-string keys are dropped. Returns null when
 * nothing valid remains, so callers can omit the field entirely.
 */
export function sanitizeAssetKineme(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};
  for (const [assetId, kid] of Object.entries(raw)) {
    if (typeof assetId === 'string' && assetId && typeof kid === 'string' && BY_ID.has(kid)) out[assetId] = kid;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Per-instance phase in [0, 1) from instance identity, so copies of one asset
 * never move in lockstep. Deterministic: same (seedOffset, key) → same phase.
 */
export function kinemePhase(seedOffset, key) {
  const s = `${seedOffset ?? ''}:${key ?? ''}`;
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return ((h >>> 0) % 1000) / 1000;
}

/**
 * The motion clock with a performer RATE (0 = frozen, 1 = real time, 4 = 4x).
 * Anchored, not `t * rate`: a rate change re-anchors at the current motion
 * time, so moving the rate never jumps. Rate never changed from 1 → the clock
 * IS the loop time, exactly. Loop time already stops on pause/hold/freeze.
 */
export function createKinemeClock() {
  let anchorLoop = 0;
  let anchorMotion = 0;
  let rate = 1;
  return {
    at(loopSec, nextRate = 1) {
      const t = Number(loopSec) || 0;
      const n = Number(nextRate);
      const r = Number.isFinite(n) ? Math.max(0, n) : 1;
      if (r !== rate) {
        anchorMotion += (t - anchorLoop) * rate;
        anchorLoop = t;
        rate = r;
      }
      return anchorMotion + (t - anchorLoop) * rate;
    },
  };
}
