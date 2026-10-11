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
import { CH, hashU01, hashU32, rngForIndex, makeScratchStream } from './kernel/rng.js';

/**
 * @typedef {object} PlacementSoA
 * @property {number} n           live point count (<= requested count after density rejection)
 * @property {Float64Array} x
 * @property {Float64Array} y
 * @property {Float64Array} scale
 * @property {Float64Array} scaleY   per-item Y scale (#1202; equals scale when X/Y linked)
 * @property {Float64Array} rotation
 * @property {Float64Array} alpha
 * @property {Float64Array} t
 * @property {Uint32Array} index  source index i (stable identity; NOT the slot)
 * @property {Uint16Array} zTier
 * @property {Float64Array} depth    zTier depth factor (stage A; scale multiplier)
 * @property {Float64Array} uScale   unit attribute draw, scale    (stage A)
 * @property {Float64Array} uScaleY  unit attribute draw, Y scale  (stage A, #1202)
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
    scaleY: new Float64Array(capacity), // #1202 — per-item Y scale; equals scale when X/Y linked
    rotation: new Float64Array(capacity),
    alpha: new Float64Array(capacity),
    t: new Float64Array(capacity),
    index: new Uint32Array(capacity),
    zTier: new Uint16Array(capacity),
    depth: new Float64Array(capacity),
    uScale: new Float64Array(capacity),
    uScaleY: new Float64Array(capacity), // #1202 — independent Y-scale draw
    uRot: new Float64Array(capacity),
    uAlpha: new Float64Array(capacity),
  };
}

// #1202 — the Y-scale draw lives on its own index stream: base 2**26 plus
// the item index can never collide with the i*3(+1,+2) attribute draws above
// (20k items top out near 60k; the base clears 67M).
const Y_SCALE_INDEX_BASE = 0x4000000;

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
  phylloDivergence = 0,
  lsysDepth = 4, lsysAngle = 25,
  // #720 — DLA / Eden growth. growthRate/growthBranch are curator-driven
  // knobs (exposed, not mapped); growthTick advances the aggregate one step
  // per presented frame; audioEnergy (0..1, null when silent) is the default
  // audio driver for the cells-per-tick rate.
  growthRate = 3, growthBranch = 0.8, growthTick = 0, audioEnergy = null,
  // Brush line: flow-field trail stamping. brushSize is the nominal stamp
  // diameter in px (drives step length, not the stage-C scale range);
  // brushSpacing is step length as a fraction of brushSize (≤ 0.7 reads as
  // a continuous line); fieldScale is the simplex sampling scale per px.
  brushSize = 24, brushSpacing = 0.5, fieldScale = 0.004, trailCount = 6,
  // Slice 2 — the crooked: perpendicular trail wobble in px (0 = the trail
  // exactly) and its frequency per stamp.
  wobbleAmp = 0, wobbleFreq = 0.5,
  // #1245 — optional layer id for the unknown-sampler diagnostic; rides the
  // params so getSampler can key the once-per-(layer,mode) report. Not part
  // of geometrySignature: the layer id is not geometry.
  layerId = null,
  // #1195 — circle packing: the BASE scale range ([lo, hi], the slider, never the audio-modulated one). Only the
  // circlepack mode reads it; it joins geometrySignature for that mode alone.
  packScale = null,
}, out) {
  const cap = Math.max(0, count | 0);
  const soa = out && out.x.length >= cap ? out : allocSoA(cap);
  soa.n = 0;

  const bx = bleed ? canvasW * 0.2 : 0;
  const by = bleed ? canvasH * 0.2 : 0;
  const effectiveW = canvasW + bx * 2;
  const effectiveH = canvasH + by * 2;
  const tiers = Math.max(1, zTiers || 1);
  const sample = getSampler(mode, layerId);

  const noise = displacement > 0
    ? createNoise(hashU32(seed, CH.noise, 0, seedOffsets))
    : null;
  const nt = noise ? (seed & 0xffff) * 0.02 * noiseSpeed : 0;

  // One reused context object instead of a fresh literal per point. Samplers
  // only ever read from it (registry.js ABI), so mutation is safe; the real
  // per-point out-param rewrite is step 5's EvalContext work.
  //
  // #1309 — column-writing mode (sample/columns.js): ctx.out hands the
  // sampler the SoA lanes to write directly ({ x, y, t, rot01 } +
  // ctx.row). Samplers that implement the mode return undefined; legacy
  // {x, y}-returning samplers are unpacked into the lanes by the adapter
  // in the loop below.
  //
  // #1250 — one scratch RNG stream per placement call (not per point):
  // `ca` / `voronoi` / `sampleFieldPoint` reseed it per index, which is
  // bit-identical to their old per-point `rngForIndex` allocation.
  const scratch = makeScratchStream();
  const ctx = {
    i: 0, count, w: effectiveW, h: effectiveH,
    rng: null, jitter: jitter || 0, seed,
    caGrid: mode === 'ca' ? caGrid : null,
    seedOffsets,
    scratch,
    // #585 — sampler scalar; undefined for every other mode, and the sampler
    // treats a non-finite value as the golden angle.
    phylloDivergence,
    // sampler scalars; ignored by every other mode.
    lsysDepth, lsysAngle,
    // #720 — DLA / Eden growth scalars; ignored by every other mode.
    growthRate, growthBranch, growthTick, audioEnergy,
    // Brush line scalars; ignored by every other mode.
    brushSize, brushSpacing, fieldScale, trailCount,
    // Slice 2 — the crooked; ignored by every other mode.
    wobbleAmp, wobbleFreq,
    // #1195 — circle packing needs the tier count and the base scale range; ignored by every other mode.
    zTiers: tiers, packScale,
    // #1309 — column-writing mode; assigned below once the lanes exist.
    out: null,
    row: -1,
  };

  const tDenom = count > 1 ? count - 1 : 0;

  // #1309 — the sampler's optional rot01 (trail tangent for brush) lands in
  // this per-call scratch lane; NaN means "not produced". One lane, not a
  // PlacementSoA field: stage C never reads it (it folds into uRot below),
  // and a module-level scratch would break the reentrancy this function
  // guarantees (multi-layer + worker callers).
  const rot01lane = new Float64Array(cap);
  // The placement SoA columns ARE the sampler's column target: x/y/t are
  // written by the sampler directly, then displacement/bleed finalize x/y
  // in place below. No per-point {x, y} object crosses this boundary for
  // column-mode samplers.
  ctx.out = { x: soa.x, y: soa.y, t: soa.t, rot01: rot01lane };

  let n = 0;
  for (let i = 0; i < cap; i++) {
    if (density < 100 && hashU01(seed, CH.dens, i, seedOffsets) * 100 > density) continue;

    ctx.i = i;
    ctx.rng = rngForIndex(seed, CH.geo, i, seedOffsets);
    ctx.row = n;
    // NaN sentinels for the optional lanes: a column-mode sampler that
    // produces t/rot01 overwrites them, anything else reads back as "not
    // produced" — the exact analogue of the legacy `pos.t !== undefined` /
    // `pos.rot01 !== undefined` tests below.
    soa.t[n] = NaN;
    rot01lane[n] = NaN;
    const pos = sample(ctx);
    if (pos !== undefined) {
      // Legacy sampler — the adapter: unpack the {x, y} return into the
      // lanes. Column-mode samplers return undefined; their lanes are
      // already written.
      soa.x[n] = pos.x;
      soa.y[n] = pos.y;
      if (pos.t !== undefined) soa.t[n] = pos.t;
      if (pos.rot01 !== undefined) rot01lane[n] = pos.rot01;
    }

    // The unwarped sampler position, straight from the lanes the sampler
    // wrote (or the legacy adapter unpacked into).
    const ux = soa.x[n];
    const uy = soa.y[n];
    let px = ux;
    let py = uy;

    if (noise) {
      // Both octaves sample the UNWARPED position (ux/uy), matching the
      // AoS kernel — dy must not see dx's displacement.
      px += noise.fBm3D(ux * noiseFreq, uy * noiseFreq, nt, 3) * displacement;
      py += noise.fBm3D(ux * noiseFreq + 200, uy * noiseFreq + 200, nt + 100, 3) * displacement;
    }

    if (bleed) {
      px -= bx;
      py -= by;
    }

    const zTier = i % tiers;

    soa.x[n] = px;
    soa.y[n] = py;
    // NaN (sentinel) selects the legacy default ramp — the column-mode form
    // of `pos.t !== undefined ? pos.t : …`.
    const pt = soa.t[n];
    soa.t[n] = Number.isNaN(pt) ? (tDenom ? i / tDenom : 0.5) : pt;
    soa.index[n] = i;
    soa.zTier[n] = zTier;
    soa.depth[n] = tiers > 1 ? 0.6 + (zTier / (tiers - 1)) * 0.8 : 1.0;
    soa.uScale[n] = hashU01(seed, CH.attr, i * 3, seedOffsets);
    soa.uScaleY[n] = hashU01(seed, CH.attr, Y_SCALE_INDEX_BASE + i, seedOffsets);
    // Brush stamps aim along their trail tangent: the sampler returns the
    // tangent as a unit draw; every other mode keeps the hash draw, so this
    // is a no-op for them. NaN (sentinel) selects the hash draw — the
    // column-mode form of `pos.rot01 !== undefined ? pos.rot01 : …`.
    const r01 = rot01lane[n];
    soa.uRot[n] = Number.isNaN(r01) ? hashU01(seed, CH.attr, i * 3 + 1, seedOffsets) : r01;
    soa.uAlpha[n] = hashU01(seed, CH.attr, i * 3 + 2, seedOffsets);
    // #1195 — circle packing: the sampler packed circles at specific sizes and returned each as its unit-scale draw
    // in `t`, so stage C's `(lo + (hi - lo) * u) * depth` lands exactly on the packed radius (the brush precedent).
    if (mode === 'circlepack' && !Number.isNaN(soa.t[n])) soa.uScale[n] = soa.t[n];
    // Slice 2 — stamp jitter, the hand on top of the trail: ±10° rotation
    // and ±15% of the scale range around its midpoint, both from the
    // per-instance seed hash, so a reseed repeats the same crookedness.
    if (mode === 'brush') {
      soa.uRot[n] = Math.min(0.9999, Math.max(0,
        soa.uRot[n] + (hashU01(seed, CH.attr, i * 3 + 1, seedOffsets) - 0.5) * (20 / 360)));
      soa.uScale[n] = 0.5 + (soa.uScale[n] - 0.5) * 0.3;
    }
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
  // #1202 — scale is { x:[lo,hi], y:[lo,hi] }; a legacy [lo,hi] array reads
  // as linked. Linked (the default): Y is bit-identical to X — the provable
  // no-op. Unlinked: Y samples its own independent draw (uScaleY).
  const sx = Array.isArray(scale) ? scale : scale.x;
  const sy = Array.isArray(scale) ? null : scale.y;
  const scale0 = sx[0];
  const scaleD = sx[1] - sx[0];
  const linked = !sy || (sy[0] === sx[0] && sy[1] === sx[1]);
  const sy0 = linked ? 0 : sy[0];
  const syD = linked ? 0 : sy[1] - sy[0];
  // #269 — null guard: a raw caller (or corrupt snapshot) with rotate:null
  // must degrade to zero rotation, not TypeError and freeze the frame loop.
  const rot0 = rotate?.[0] ?? 0;
  const rotD = (rotate?.[1] ?? rot0) - rot0;
  const alpha0 = alpha[0];
  const alphaD = alpha[1] - alpha[0];

  const { n, uScale, uScaleY, uRot, uAlpha, depth } = soa;
  for (let k = 0; k < n; k++) {
    // Same expression and the same FP operation order as the fused kernel —
    // `(base + delta * u) * depth`. Any reassociation here moves the golden
    // hash.
    const s = (scale0 + scaleD * uScale[k]) * depth[k];
    soa.scale[k] = s;
    soa.scaleY[k] = linked ? s : (sy0 + syD * uScaleY[k]) * depth[k];
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
  // #1195 — this entry owns both stages, so circle packing packs for the very scale range stage C will apply
  // (buildPlacements, which splits the stages, passes the BASE slider range itself).
  if (params.mode === 'circlepack' && !params.packScale && params.scale) {
    const sx = Array.isArray(params.scale) ? params.scale : params.scale.x;
    if (Array.isArray(sx) && sx.length === 2) params = { ...params, packScale: [sx[0], sx[1]] };
  }
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
    p.displacement, p.noiseFreq, p.noiseSpeed, p.phylloDivergence, p.lsysDepth, p.lsysAngle,
    // #720 — growthTick advances every presented frame for dla/eden layers,
    // busting the cache honestly (the CA grid's identity-change deal).
    // audioEnergy stays out: an ephemeral drive consumed at tick-advance
    // time, not geometry identity.
    p.growthRate, p.growthBranch, p.growthTick,
    // Brush line: every param the brush sampler reads. The staged-eval
    // cache compares element-wise, so a missing entry here would silently
    // serve stale trails after a param edit.
    p.brushSize, p.brushSpacing, p.fieldScale, p.trailCount,
    // Slice 2 — the crooked knobs.
    p.wobbleAmp, p.wobbleFreq,
    // #1195 — the packing depends on the base scale range (circlepack only; 0 for every other mode).
    p.packScale ? p.packScale[0] : 0, p.packScale ? p.packScale[1] : 0,
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
