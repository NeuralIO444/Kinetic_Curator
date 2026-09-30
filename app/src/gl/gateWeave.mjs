// gateWeave.mjs — #741 projector gate weave: sub-pixel whole-frame drift.
// Browser-safe, pure. The resolve pass adds the returned offset (output pixels)
// to its sample position; zero offset = byte-identical, so "off" is provably off.
//
// A whisper, never a bug: slow drift (two sines per axis) plus a tiny
// deterministic per-frame jitter, bounded by WEAVE_MAX_PX. Wall-clock phase is
// fine — this is a live finish, not a golden input (stills never apply it).

/** Hard bound on |offset| per axis, in output pixels. */
export const WEAVE_MAX_PX = 0.6;

// Integer hash → [0,1): deterministic per frame, no Math.random (mathRandomGuard).
function hash01(n) {
  let h = Math.imul((n | 0) + 0x9e3779b9, 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2545f491) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  return h / 4294967296;
}

const TAU = Math.PI * 2;

/**
 * @param {number} nowMs wall-clock ms (any monotonic clock)
 * @param {number} frame frame index (drives the jitter hash)
 * @returns {[number, number]} [dx, dy] in output pixels, |each| <= WEAVE_MAX_PX
 */
export function gateWeaveOffset(nowMs, frame) {
  const t = (Number.isFinite(nowMs) ? nowMs : 0) / 1000;
  const f = Number.isFinite(frame) ? frame : 0;
  // drift: <= 0.32 + 0.08 = 0.40 (x), 0.22 + 0.06 = 0.28 (y)
  const dx = 0.32 * Math.sin(TAU * 0.37 * t) + 0.08 * Math.sin(TAU * 1.1 * t + 1.3);
  const dy = 0.22 * Math.sin(TAU * 0.23 * t + 0.7) + 0.06 * Math.sin(TAU * 0.83 * t + 2.1);
  // jitter: <= 0.10 per axis
  const jx = (hash01(f * 2) - 0.5) * 0.2;
  const jy = (hash01(f * 2 + 1) - 0.5) * 0.2;
  return [dx + jx, dy + jy];
}
