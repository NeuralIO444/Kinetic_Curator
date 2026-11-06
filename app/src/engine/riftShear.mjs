// riftShear.mjs — #1183 rift slice 1: the TEAR as a place the marks react to.
//
// "The tear is a place marks react to (they shift or split near it), not only a look over the top"
// (Matt, 2026-10-08). The FX layer's tear effect shears the finished picture row by row: band noise
// along Y, X-only displacement. This module is the marks' half of that: a mark standing in a tear
// band is moved sideways by the SAME amount the shader moves the picture there, so the marks tear
// with the image instead of sliding under it.
//
// The maths mirrors gl/effects/fxShaders.mjs FX_TEAR_FS exactly:
//   np = (u * 8 + 95.9, v * bands + 49.7);  n = vnoise(np);  dx = (n - 0.5) * amount * 4 / 1000  (in uv)
// The shader samples the source at uv + dx, so the picture's content appears moved by -dx; a mark
// is moved by -dx * W. v is the GL row coordinate (y up): v = 1 - y / H for a scene y (y down).
// The noise is the chunk library's reference vnoise (the same function the chunk selfchecks pin
// against the GLSL), so the CPU and GPU agree up to float precision.
//
// Per frame, never accumulating (the kineme rule): the applier writes the presented x into the SoA
// and returns an undo that puts the placed values back. strength 0 is a hard gate — nothing runs.
// Pure: no clock, no randomness, no store, no GL.
import { refVnoise } from '../gl/effects/chunkReference.mjs';

const clamp01 = (v) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/** The shader's own offsets (FX_TEAR_FS): the noise-coordinate origin and the X frequency. */
export const TEAR_U_FREQ = 8;
export const TEAR_NP_X = 95.9;
export const TEAR_NP_Y = 49.7;

/**
 * The horizontal shear, in scene units, the tear applies to a mark at scene (x, y) — the amount the
 * MARK moves (opposite in sign to the shader's sample offset, since the picture moves by -dx).
 * `tear` = { bands, amount } (sanitized tear params). Pure function of position: same x, y → same shear.
 */
export function riftShearAt(x, y, tear, W, H) {
  if (!tear || !(W > 0) || !(H > 0)) return 0;
  const bands = Number(tear.bands);
  const amount = Number(tear.amount);
  if (!(bands > 0) || !(amount > 0) || !Number.isFinite(x) || !Number.isFinite(y)) return 0;
  const u = x / W;
  const v = 1 - y / H;
  const n = refVnoise(u * TEAR_U_FREQ + TEAR_NP_X, v * bands + TEAR_NP_Y);
  const dxUv = ((n - 0.5) * amount * 4) / 1000;
  return -dxUv * W;
}

/**
 * Shear the placed marks with the tear. `strength` (0..1) is the layer's RIFT dial: at 1 a mark moves as far
 * as the picture does, at 0 not at all. Marks pinned still (`stillMarks[k] === 1`) stay where they are.
 * Returns an undo that restores the SoA's x, or null when nothing ran.
 */
export function applyRiftShear(soa, tear, W, H, strength, stillMarks = null) {
  const s = clamp01(strength);
  if (!soa || !tear || !(s > 0)) return null;
  const n = soa.n | 0;
  const idx = [];
  const ox = [];
  for (let k = 0; k < n; k++) {
    if (stillMarks && stillMarks[k] === 1) continue;
    const x = soa.x[k];
    const dx = riftShearAt(x, soa.y[k], tear, W, H) * s;
    if (dx === 0) continue;
    idx.push(k);
    ox.push(x);
    soa.x[k] = x + dx;
  }
  if (!idx.length) return null;
  return () => {
    for (let j = 0; j < idx.length; j++) soa.x[idx[j]] = ox[j];
  };
}
