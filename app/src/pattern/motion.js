// motion.js — PATTERN motion: what DRIFT means in each mode (#1042).
//
// Spec: docs/PATTERN_SPEC.md — Motion, Parameters (DRIFT).
//
// DRIFT means exactly one thing per mode:
//   QUILT  rotation of pinwheels and medallions: a breath, not a spin
//   GLYPH  a phase-offset scale pulse about each tile center
//   FIELD  a pan across the torus, in a direction fixed by the seed
// It is never a hue cycle (that is MATH / HUE ROTATE), a motif morph (parked),
// a crossfade or a beat swap. This module takes no beat input and returns no
// color, and it imports nothing: it is a function of (mode, drift, time, ctx).
//
// Time is LOOP time in seconds (the loop clock, not wall time), so a held clock
// holds the motion. At DRIFT 0 every mode returns the frozen IDENTITY, which is
// what keeps a DRIFT-0 frame pixel-identical across time.
//
// Constants are signed (Matt, 2026-10-06): QUILT ±15° over 10 s, GLYPH 6 s,
// FIELD 0.25 tile/s at DRIFT 100%.

export const QUILT_ROTATION_DEG = 15;
export const QUILT_PERIOD_S = 10;
export const GLYPH_PULSE_DEPTH = 0.2;
export const GLYPH_PERIOD_S = 6;
export const FIELD_PAN_TILES_PER_S = 0.25;

/** The motifs QUILT's DRIFT rotates, by spec name. Nothing else in a quilt moves. */
export const QUILT_ROTATING = Object.freeze(['pinwheel', 'medallion']);

/** Nothing moves. Returned for DRIFT 0 and for any mode with no motion. */
export const IDENTITY = Object.freeze({ kind: 'none' });

const TAU = Math.PI * 2;
const clamp01 = (v) => Math.min(1, Math.max(0, Number(v) || 0));
const seconds = (t) => (Number.isFinite(Number(t)) ? Number(t) : 0);

/** Phase of tile `i` of `n`: one full wave across the grid, row-major. */
export const phaseOf = (i, n) => (n > 0 ? (TAU * i) / n : 0);

/** QUILT: tile `i`'s rotation in radians at loop time `t`. Zero at DRIFT 0. */
export function quiltAngle(drift, t, i, n) {
  const d = clamp01(drift);
  if (d === 0) return 0;
  return ((QUILT_ROTATION_DEG * Math.PI) / 180) * d * Math.sin((TAU * seconds(t)) / QUILT_PERIOD_S + phaseOf(i, n));
}

/** GLYPH: tile `i`'s scale at loop time `t`: 1 + 0.2·DRIFT·sin(phase + t). 1 at DRIFT 0. */
export function glyphPulse(drift, t, i, n) {
  const d = clamp01(drift);
  if (d === 0) return 1;
  return 1 + GLYPH_PULSE_DEPTH * d * Math.sin((TAU * seconds(t)) / GLYPH_PERIOD_S + phaseOf(i, n));
}

/** FIELD: pan offset in tile units at loop time `t`, along `angle` (the seed's fixed direction). */
export function fieldPan(drift, t, angle) {
  const dist = clamp01(drift) * FIELD_PAN_TILES_PER_S * seconds(t);
  return { x: Math.cos(angle) * dist, y: Math.sin(angle) * dist };
}

/**
 * The motion of a frame, one description per mode.
 * @param {'QUILT'|'GLYPH'|'FIELD'} mode
 * @param {number} drift 0..1
 * @param {number} t loop time, seconds
 * @param {{count?:number, angle?:number}} ctx tile count (QUILT, GLYPH); the seed's pan direction (FIELD)
 * @returns {{kind:'none'} | {kind:'rotate', angle:(i:number)=>number}
 *   | {kind:'scale', scale:(i:number)=>number} | {kind:'pan', x:number, y:number}}
 */
export function motion(mode, drift, t, ctx = {}) {
  if (clamp01(drift) === 0) return IDENTITY;
  const n = Math.max(1, Number(ctx.count) || 1);
  switch (mode) {
    case 'QUILT': return { kind: 'rotate', angle: (i) => quiltAngle(drift, t, i, n) };
    case 'GLYPH': return { kind: 'scale', scale: (i) => glyphPulse(drift, t, i, n) };
    case 'FIELD': return { kind: 'pan', ...fieldPan(drift, t, Number(ctx.angle) || 0) };
    default: return IDENTITY;
  }
}
