/**
 * regionCycle.js — #725 slice 4 (pure): per-region color cycling.
 *
 * Hue shifts as a render-time remap, driven by kineme RATE (via u_kinemeTime,
 * so RATE 0 freezes cycling with everything else). No geometry cost.
 * Speed is cycles/sec per slot; 0 = off (amount-0 identity: the static path
 * is bit-identical).
 */

import { REGION_SLOTS } from './regionSlots.js';

/** Max cycles/sec (UI clamp). */
export const CYCLE_MAX = 4;

/**
 * Sanitize an asset → slot → cycle-speed map (project document trust boundary).
 * Shape: { assetId: { A: speed, ... } }. Speeds are finite numbers clamped to
 * [0, CYCLE_MAX]; unknown slots and non-objects drop. Null when empty.
 */
export function sanitizeAssetRegionCycle(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};
  for (const [assetId, slots] of Object.entries(raw)) {
    if (typeof assetId !== 'string' || !assetId || !slots || typeof slots !== 'object') continue;
    const clean = {};
    for (const s of REGION_SLOTS) {
      const v = Number(slots[s]);
      if (Number.isFinite(v) && v > 0) clean[s] = Math.min(CYCLE_MAX, v);
    }
    if (Object.keys(clean).length) out[assetId] = clean;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Hue-rotate an sRGB color by degrees (JS mirror of the GLSL in QUAD_FS).
 * Used by the selfcheck; the shader is the source of truth for pixels.
 */
export function hueRotateRgb([r, g, b], deg) {
  const rad = ((Number(deg) || 0) % 360) * Math.PI / 180;
  const c = Math.cos(rad), s = Math.sin(rad);
  // SVG feColorMatrix hueRotate matrix (sRGB luminance axis).
  const m = [
    0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
    0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.140, 0.072 - c * 0.072 - s * 0.283,
    0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072,
  ];
  return [
    m[0] * r + m[1] * g + m[2] * b,
    m[3] * r + m[4] * g + m[5] * b,
    m[6] * r + m[7] * g + m[8] * b,
  ];
}
