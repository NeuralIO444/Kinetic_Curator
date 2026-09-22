// Placement engine — orchestrates mode positions + depth + noise warp
// Kernel K0: density + attributes index-stable; per-index geo streams (#58)
// Kernel K1: displacement uses instanced noise from seed (#59)
// Kernel K2: samplers via getSampler(mode) (#60)
// Kernel v2 (#108) step 2: SoA + in-place fill. computePlacementsSoA fills
// pre-allocated typed arrays; computePlacements is now a thin adapter that
// materializes the legacy array-of-objects for callers that still want it.
//
// Kernel v2 (#108) step 4: staged eval. The fill is split in two —
//
//   computeGeometrySoA  (stage A+B)  position sample, fBm displacement,
//                                    t / index / zTier / depth, and the UNIT
//                                    attribute draws u ∈ [0,1)
//   applyAttributes     (stage C)    scale/rotation/alpha from those units
//
// The split exists because of what the app actually does per frame:
// liveLoop updates lifeT every rAF tick, so effectiveScale and
// effectiveAlpha are new arrays on every frame while the geometry params sit
// perfectly still. Before this split that re-ran the sampler, the fBm
// displacement, the asset pick and the colour assignment every frame to
// recompute values that were bit-identical to the previous frame. Stage C is
// pure arithmetic over cached unit draws — no hashing, no sampling, no fBm.

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
 * @property {Float64Array} depth    zTier depth factor (stage A; scale multiplier)
 * @property {Float64Array} uScale   unit attribute draw, scale    (stage A)
 * @property {Float64Array} uRot     unit attribute draw, rotation (stage A)
 * @property {Float64Array} uAlpha   unit attribute draw, alpha    (stage A)
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
    depth: new Float64Array(capacity),
    uScale: new Float64Array(capacity),
    uRot: new Float64Array(capacity),
    uAlpha: new Float64Array(capacity),
  };
}

/**
 * Stage A + B — everything that does NOT depend on the scale/rotate/alpha
 * ranges: density rejection, position sampling, fBm displacement, bleed,
 * t / index / zTier / depth, and the unit attribute draws.
 *
 * Deliberately does not read `scale`, `rotate` or `alpha`. That is the whole
 * contract: a caller may cache this output and re-run only applyAttributes
 * when the ranges change. If a future edit reads a range here, the cache in
 * buildPlacements silently goes stale — geometrySignature() below is the
 * list that has to stay in sync.
 *
 * Allocates one set of buffers per call rather than reusing a module-level
 * pool: multi-layer render calls this several times per frame and
 * studio/render.mjs calls it off the main thread, so a shared pool would
 * make it non-reentrant.
 *
 * @param {object} params
 * @param {PlacementSoA} [out] reuse these buffers (must have capacity >= count)
 * @returns {PlacementSoA}
 */
export function computeGeometrySoA({
  mode, count, seed, jitter, density, zTiers, bleed,
  canvasW, canvasH, caGrid,
  displacement = 0, noiseFreq = 0.005, noiseSpeed = 0.5,
  seedOffsets = null,
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
    ? createNoise(hashU32(seed, CH.noise, 0, seedOffsets))
    : null;
  const nt = noise ? (seed & 0xffff) * 0.02 * noiseSpeed : 0;

  // One reused context object instead of a fresh literal per point. Samplers
  // only ever read from it (registry.js ABI), so mutation is safe; the real
  // per-point out-param rewrite is step 5's EvalContext work.
  const ctx = {
    i: 0, count, w: effectiveW, h: effectiveH,
    rng: null, jitter: jitter || 0, seed,
    caGrid: mode === 'ca' ? caGrid : null,
    seedOffsets,
  };

  const tDenom = count > 1 ? count - 1 : 0;

  let n = 0;
  for (let i = 0; i < cap; i++) {
    if (density < 100 && hashU01(seed, CH.dens, i, seedOffsets) * 100 > density) continue;

    ctx.i = i;
    ctx.rng = rngForIndex(seed, CH.geo, i, seedOffsets);
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

    soa.x[n] = px;
    soa.y[n] = py;
    soa.t[n] = pos.t !== undefined ? pos.t : (tDenom ? i / tDenom : 0.5);
    soa.index[n] = i;
    soa.zTier[n] = zTier;
    soa.depth[n] = tiers > 1 ? 0.6 + (zTier / (tiers - 1)) * 0.8 : 1.0;
    soa.uScale[n] = hashU01(seed, CH.attr, i * 3, seedOffsets);
    soa.uRot[n] = hashU01(seed, CH.attr, i * 3 + 1, seedOffsets);
    soa.uAlpha[n] = hashU01(seed, CH.attr, i * 3 + 2, seedOffsets);
    n++;
  }

  soa.n = n;
  return soa;
}

/**
 * Stage C — apply scale/rotate/alpha ranges to the cached unit draws.
 *
 * Pure arithmetic: no hashing, no sampling, no noise. This is the only stage
 * that re-runs when audio/life modulation moves the ranges, which is every
 * frame in the live app.
 *
 * @param {PlacementSoA} soa mutated in place
 */
export function applyAttributes(soa, { scale, rotate, alpha }) {
  const scale0 = scale[0];
  const scaleD = scale[1] - scale[0];
  // #269 — null guard: a raw caller (or corrupt snapshot) with rotate:null
  // must degrade to zero rotation, not TypeError and freeze the frame loop.
  const rot0 = rotate?.[0] ?? 0;
  const rotD = (rotate?.[1] ?? rot0) - rot0;
  const alpha0 = alpha[0];
  const alphaD = alpha[1] - alpha[0];

  const { n, uScale, uRot, uAlpha, depth } = soa;
  for (let k = 0; k < n; k++) {
    // Same expression and the same FP operation order as the fused kernel —
    // `(base + delta * u) * depth`. Any reassociation here moves the golden
    // hash.
    soa.scale[k] = (scale0 + scaleD * uScale[k]) * depth[k];
    soa.rotation[k] = rot0 + rotD * uRot[k];
    soa.alpha[k] = alpha0 + alphaD * uAlpha[k];
  }
  return soa;
}

/**
 * Stages A+B+C fused. Back-compat entry point for callers with no cache to
 * hold (selfchecks, studio render, the perf harness).
 *
 * @param {object} params
 * @param {PlacementSoA} [out] reuse these buffers (must have capacity >= count)
 * @returns {PlacementSoA}
 */
export function computePlacementsSoA(params, out) {
  return applyAttributes(computeGeometrySoA(params, out), params);
}

/**
 * The inputs stage A+B reads. buildPlacements compares this array
 * element-wise to decide whether cached geometry is still valid, so it must
 * list every parameter computeGeometrySoA destructures — objects by
 * identity (caGrid), everything else by value. The sub-seed offsets ride as
 * four scalars (#305): a mutate is a new number, never a mutated object.
 */
export function geometrySignature(p) {
  const o = p.seedOffsets || {};
  return [
    p.mode, p.count, p.seed, p.jitter, p.density, p.zTiers, p.bleed,
    p.canvasW, p.canvasH, p.caGrid,
    p.displacement, p.noiseFreq, p.noiseSpeed,
    o.spatial || 0, o.color || 0, o.asset || 0, o.noise || 0,
  ];
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
