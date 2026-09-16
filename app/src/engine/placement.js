// Placement engine — orchestrates mode positions + depth + noise warp
// Kernel K0: density + attributes index-stable; per-index geo streams (#58)
// Kernel K1: displacement uses instanced noise from seed (#59)
// Kernel K2: samplers via getSampler(mode) (#60)
// Kernel v2 (#108) step 2: SoA + in-place fill. computePlacementsSoA fills
// pre-allocated typed arrays; computePlacements is now a thin adapter that
// materializes the legacy array-of-objects for callers that still want it.

import { createNoise } from './noise.js';
import { getSampler } from './kernel/sample/registry.js';
import { CH, hashU01, hashU32, rngForIndex } from './kernel/rng.js';

/**
 * @typedef {object} PlacementSoA
 * @property {number} n           live point count (<= requested count after density rejection)
 * @property {Float64Array} x
 * @property {Float64Array} y
 * @property {Float64Array} scale
 * @property {Float64Array} rotation
 * @property {Float64Array} alpha
 * @property {Float64Array} t
 * @property {Uint32Array} index  source index i (stable identity; NOT the slot)
 * @property {Uint16Array} zTier
 */

// Float64, not Float32, deliberately. The golden fixture fingerprints
// x/scale/rotation to 4 decimals on values up to ~1000, which is right at
// float32's ~7-significant-digit resolution — narrowing would perturb the
// hash and we'd have no way to tell a rounding artifact from a real kernel
// regression. Bit-for-bit identity with the AoS kernel is the gate for this
// step; 20k points is 960KB of f64, which is nothing.
function allocSoA(capacity) {
  return {
    n: 0,
    x: new Float64Array(capacity),
    y: new Float64Array(capacity),
    scale: new Float64Array(capacity),
    rotation: new Float64Array(capacity),
    alpha: new Float64Array(capacity),
    t: new Float64Array(capacity),
    index: new Uint32Array(capacity),
    zTier: new Uint16Array(capacity),
  };
}

/**
 * Fill pre-allocated columns for a given layout mode.
 *
 * Allocates one set of buffers per call rather than reusing a module-level
 * pool: multi-layer render calls this several times per frame and
 * studio/render.mjs calls it off the main thread, so a shared pool would
 * make it non-reentrant. Per-call is 8 allocations total instead of ~5 per
 * point, which is where the win actually was.
 *
 * @param {object} params
 * @param {PlacementSoA} [out] reuse these buffers (must have capacity >= count)
 * @returns {PlacementSoA}
 */
export function computePlacementsSoA({
  mode, count, seed, scale, rotate, alpha, jitter, density, zTiers, bleed,
  canvasW, canvasH, caGrid,
  displacement = 0, noiseFreq = 0.005, noiseSpeed = 0.5,
}, out) {
  const cap = Math.max(0, count | 0);
  const soa = out && out.x.length >= cap ? out : allocSoA(cap);
  soa.n = 0;

  const bx = bleed ? canvasW * 0.2 : 0;
  const by = bleed ? canvasH * 0.2 : 0;
  const effectiveW = canvasW + bx * 2;
  const effectiveH = canvasH + by * 2;
  const tiers = Math.max(1, zTiers || 1);
  const sample = getSampler(mode);

  const noise = displacement > 0
    ? createNoise(hashU32(seed, CH.noise, 0))
    : null;
  const nt = noise ? (seed & 0xffff) * 0.02 * noiseSpeed : 0;

  // One reused context object instead of a fresh literal per point. Samplers
  // only ever read from it (registry.js ABI), so mutation is safe; the real
  // per-point out-param rewrite is step 5's EvalContext work.
  const ctx = {
    i: 0, count, w: effectiveW, h: effectiveH,
    rng: null, jitter: jitter || 0, seed,
    caGrid: mode === 'ca' ? caGrid : null,
  };

  const scale0 = scale[0];
  const scaleD = scale[1] - scale[0];
  const rot0 = rotate[0];
  const rotD = rotate[1] - rotate[0];
  const alpha0 = alpha[0];
  const alphaD = alpha[1] - alpha[0];
  const tDenom = count > 1 ? count - 1 : 0;

  let n = 0;
  for (let i = 0; i < cap; i++) {
    if (density < 100 && hashU01(seed, CH.dens, i) * 100 > density) continue;

    ctx.i = i;
    ctx.rng = rngForIndex(seed, CH.geo, i);
    const pos = sample(ctx);

    let px = pos.x;
    let py = pos.y;

    if (noise) {
      // Both octaves sample the UNWARPED position (pos.x/pos.y), matching the
      // AoS kernel — dy must not see dx's displacement.
      px += noise.fBm3D(pos.x * noiseFreq, pos.y * noiseFreq, nt, 3) * displacement;
      py += noise.fBm3D(pos.x * noiseFreq + 200, pos.y * noiseFreq + 200, nt + 100, 3) * displacement;
    }

    if (bleed) {
      px -= bx;
      py -= by;
    }

    const zTier = i % tiers;
    const depthFactor = tiers > 1 ? 0.6 + (zTier / (tiers - 1)) * 0.8 : 1.0;

    soa.x[n] = px;
    soa.y[n] = py;
    // lerp inlined as base + delta * u — identical FP sequence to lerp().
    soa.scale[n] = (scale0 + scaleD * hashU01(seed, CH.attr, i * 3)) * depthFactor;
    soa.rotation[n] = rot0 + rotD * hashU01(seed, CH.attr, i * 3 + 1);
    soa.alpha[n] = alpha0 + alphaD * hashU01(seed, CH.attr, i * 3 + 2);
    soa.t[n] = pos.t !== undefined ? pos.t : (tDenom ? i / tDenom : 0.5);
    soa.index[n] = i;
    soa.zTier[n] = zTier;
    n++;
  }

  soa.n = n;
  return soa;
}

/**
 * Legacy array-of-objects view. Kept for selfchecks and any caller not yet
 * reading columns; buildPlacements consumes the SoA directly.
 * @returns {{ x, y, scale, rotation, alpha, index, t, zTier }[]}
 */
export function computePlacements(params) {
  const soa = computePlacementsSoA(params);
  const items = new Array(soa.n);
  for (let k = 0; k < soa.n; k++) {
    items[k] = {
      x: soa.x[k],
      y: soa.y[k],
      scale: soa.scale[k],
      rotation: soa.rotation[k],
      alpha: soa.alpha[k],
      index: soa.index[k],
      t: soa.t[k],
      zTier: soa.zTier[k],
    };
  }
  return items;
}
