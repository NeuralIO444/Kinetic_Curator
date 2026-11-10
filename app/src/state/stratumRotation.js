// stratumRotation.js — per-stratum rotation (#2038, the D7 reservation).
// Pure, no imports — safe to import from state, gl, fx and studio paths.
//
// Matt's ruling (2026-11-08, issue #2038): every stratum may carry a
// rotation, quantized to the detents Strata Q's D7 reserved back on
// 2026-10-15 — 0 / 15 / 45 / 90 degrees. The law, one shape everywhere
// (the feedsAccum / wetSoak discipline): the `rotation` key rides a
// layer ONLY while it is non-zero; absence is 0, so an unrotated
// project's documents, contracts and hashes are byte-for-byte what they
// were before the control existed. Anything that is not exactly a
// detent (a hand-edited 30, a string, NaN) sanitizes to 0 — the key is
// dropped, never clamped to a neighbour: a detent control has no
// "close enough".
//
// Semantics: a stratum's own contribution renders in a frame rotated
// `rotation` degrees CLOCKWISE (the stage's convention — instance
// rotation is degrees-clockwise, SVG-style) about the stage centre.
// Content strata rotate their marks (positions rigidly, each mark's own
// angle advancing by the same amount); a pattern stratum rotates its
// field texture; an FX/MATH stratum rotates its effect field (the wrap
// is seeded in the rotated frame and rotated back on composite, so the
// picture below keeps its geometry and only the effect turns).

/** The detents, ascending. 0 is the absence state and is never stored. */
export const STRATUM_ROTATIONS = Object.freeze([0, 15, 45, 90]);

/** Detent or 0. Exact match only (after Number coercion); fail closed. */
export function sanitizeStratumRotation(v) {
  const n = typeof v === 'number' ? v : Number(v);
  return n === 15 || n === 45 || n === 90 ? n : 0;
}

/** A layer's rotation detent (0 when the key is absent or malformed). */
export function stratumRotationOf(layer) {
  return layer && typeof layer === 'object' ? sanitizeStratumRotation(layer.rotation) : 0;
}

/**
 * Rotate point (x, y) by `deg` degrees clockwise about (cx, cy), in
 * screen space (x right, y DOWN — the stage's pixel space). Clockwise
 * in a y-down frame is the plain rotation matrix: a point right of
 * centre at 90° lands BELOW centre, which is what clockwise means on
 * screen.
 */
export function rotatePoint(x, y, cx, cy, deg) {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = x - cx;
  const dy = y - cy;
  return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
}

/**
 * Rigidly rotate a stratum's resolved items about the stage centre:
 * positions turn, and each item's own `rotation` (degrees, clockwise)
 * advances by the same detent so marks keep their facing relative to
 * the stratum. Items without finite x/y pass through untouched. At 0
 * the SAME array is returned — the unrotated path allocates nothing
 * and changes nothing.
 */
export function rotateItems(items, w, h, deg) {
  const d = sanitizeStratumRotation(deg);
  if (!d || !Array.isArray(items) || items.length === 0) return items;
  const cx = w / 2;
  const cy = h / 2;
  return items.map((it) => {
    if (!it || !Number.isFinite(it.x) || !Number.isFinite(it.y)) return it;
    const p = rotatePoint(it.x, it.y, cx, cy, d);
    return { ...it, x: p.x, y: p.y, rotation: (Number(it.rotation) || 0) + d };
  });
}

/** Rotate coalescence-style fields ({x, y, ...}) the same rigid way. */
export function rotateFields(fields, w, h, deg) {
  const d = sanitizeStratumRotation(deg);
  if (!d || !Array.isArray(fields) || fields.length === 0) return fields;
  const cx = w / 2;
  const cy = h / 2;
  return fields.map((f) => {
    if (!f || !Number.isFinite(f.x) || !Number.isFinite(f.y)) return f;
    const p = rotatePoint(f.x, f.y, cx, cy, d);
    return { ...f, x: p.x, y: p.y };
  });
}
