/**
 * wetSoak.mjs — #1814: the strata soak (WET_ENGINE Phase B, consumer #2).
 *
 * A CONTENT stratum in WET interaction mode (contract `wetSoak: true` —
 * a row-level toggle in BUILD beside the blend modes; absence = off =
 * byte-identical) composites modulated spatially by the shared wet
 * field the wet-frame service (wetFrame.mjs) serves:
 *
 *   w = mix(w_dry, w_soaked, fieldWetness),  fieldWetness = mask × amount
 *
 * In dry areas the stratum composites exactly as it always has (the
 * shader computes the dry composite first and mixes from it, so a
 * pixel at fieldWetness 0 is the dry pixel, bit for bit). In soaked
 * areas the contribution is rebuilt from three terms, each
 * individually assertable:
 *
 *   (a) ABSORPTION — the source colour is pre-multiplied by the
 *       field's local absorption: the deposited pigment's KM
 *       reflectance (the pigDep pack, #1811 — the same multiplier the
 *       ACCUM fade drinks, ground NOT folded in) where pigment has
 *       landed; the frame's ground colour alone where the service
 *       serves no pigment (the issue's fallback, spelled out).
 *   (b) SMEAR — the source is re-sampled along the field's local
 *       velocity (the wetVel pack): three taps trailing the flow, so a
 *       mark's edges drag the way the field moves. A sampling
 *       displacement inside the composite shader — the composite-side
 *       cousin of the per-instance velocity smear (#309), not a new
 *       blur pass and no new program.
 *   (c) STAMPING — a soaking stratum's marks also wet the ground they
 *       touch: liveLoop asks the service for the field whenever any
 *       stratum soaks (the need-based gate, WET_ENGINE §4), so the
 *       ordinary emitFromInstances stamps land in soak-only scenes
 *       too, where before this slice the field never even stepped.
 *
 * The modulation lives INSIDE the renderer's one composite program
 * (COMPOSITE_FS in shaders.mjs), so every path that composites a
 * stratum gets it from the same code — the #1069 rule: live, captures
 * (renderFrameOffscreen), warm-up exports (renderScene and the accum
 * sequence read the payload's wet packs, the #1815 ferry), and the
 * ACCUM input subset render. Mask absent (the service shed at
 * perfTier1, or WETNESS 0) → soakFieldState returns null → the
 * composite runs the dry path untouched: static blend, the signed
 * SVG-fallback shape ("mask absent → static blend", parity corpus),
 * and the stratum row's WET indicator dims in BUILD so the mode never
 * dies silently.
 *
 * This module is the recipe + the CPU mirror of the shader's soak
 * terms; wetSoak.selfcheck pins the two to each other, the way
 * wetLook.mjs pins its display pass. NOT a display pass: the soak
 * never touches the finished frame, and it adds no rim/edge term of
 * its own — edge darkening lives in the pigment pack, once (#1812).
 */
/**
 * The velocity pack's scale (scene units at the pack ends) — vortex's
 * VORTEX_VEL_PACK, mirrored as a literal ON PURPOSE: importing
 * vortex.mjs from here would drag the sim (and its cost-tier
 * registration) into the renderer's import chain, which the cost
 * coverage suite keeps deliberately clean. wetSoak.selfcheck pins
 * the two equal.
 */
export const WET_SOAK_VEL_PACK = 32;

const clamp01 = (v) => Math.min(1, Math.max(0, v));

/**
 * The soak recipe constants — the single source both implementations
 * read. `smear` is the tap span in field steps: the far tap sits one
 * `smear` × (the distance the local flow carries in one sim step)
 * behind the fragment, so the drag length is the flow's own scale,
 * never a fixed pixel blur. Taps at spans 0 / 0.5 / 1 with weights
 * 0.5 / 0.3 / 0.2 (they sum to 1: at zero velocity the smeared source
 * is the source, exactly).
 */
export const WET_SOAK = Object.freeze({
  smear: 1,
  tapSpans: Object.freeze([0, 0.5, 1]),
  tapWeights: Object.freeze([0.5, 0.3, 0.2]),
});

/** The mix factor of the issue's formula: mask value × served amount. */
export function soakWeight(maskValue, amount) {
  return clamp01((Number(maskValue) || 0) * (Number(amount) || 0));
}

/**
 * Bilinear sample of a wet pack ({ n, rgba }) at a scene-space point
 * (x right, y down, scene units) — the CPU twin of the shader's field
 * sampling (the packs are scene-space; the composite shader flips Y
 * when it samples them into FBO space). Returns [r, g, b, a] in 0..1.
 */
export function sampleWetPack(pack, x, y, sceneW, sceneH) {
  const gn = pack.n;
  const gx = Math.max(0, Math.min(gn - 1.0001, (x / sceneW) * (gn - 1)));
  const gy = Math.max(0, Math.min(gn - 1.0001, (y / sceneH) * (gn - 1)));
  const i0 = gx | 0;
  const j0 = gy | 0;
  const tx = gx - i0;
  const ty = gy - j0;
  const i1 = Math.min(gn - 1, i0 + 1);
  const j1 = Math.min(gn - 1, j0 + 1);
  const at = (j, i, c) => pack.rgba[(j * gn + i) * 4 + c] / 255;
  const s = (c) =>
    (1 - tx) * (1 - ty) * at(j0, i0, c) +
    tx * (1 - ty) * at(j0, i1, c) +
    (1 - tx) * ty * at(j1, i0, c) +
    tx * ty * at(j1, i1, c);
  return [s(0), s(1), s(2), s(3)];
}

/** Packed velocity (RG in 0..1, centred at 0.5) → scene units per step. */
export function decodeVelocity(r, g, packScale = WET_SOAK_VEL_PACK) {
  return [(r * 2 - 1) * packScale, (g * 2 - 1) * packScale];
}

/**
 * The full smear span as an FBO-UV offset for a scene velocity: scene
 * units → UV by the scene size, Y negated (scene space is y-down, FBO
 * space is y-up), scaled by the recipe's smear length.
 */
export function smearOffsetUv(vx, vy, sceneW, sceneH) {
  const z = (v) => (v === 0 ? 0 : v); // keep -0 out of the mirror's answers
  return [z((vx * WET_SOAK.smear) / sceneW), z((-vy * WET_SOAK.smear) / sceneH)];
}

/**
 * Term (a): the absorbed straight colour. With a pigment reflectance
 * (rgb, 0..1) the colour is multiplied by it (bare paper reads
 * exactly 1 — no deposit, no absorption); without pigment it is
 * multiplied by the ground colour alone.
 */
export function absorbColor(cs, refl, ground) {
  const a = refl || ground;
  return [cs[0] * a[0], cs[1] * a[1], cs[2] * a[2]];
}

/**
 * The soak field state renderFrameInto consumes, normalised from a
 * payload's wet object — the live service result and the warm-up
 * export payload carry the same keys (wetFrame.mjs / wetWarmup.mjs),
 * so one normaliser serves every path. Returns null when no field was
 * served (dry project, perfTier1 shed, service off): the composite
 * then runs the dry path untouched. `ground` is the frame's ground
 * colour ([r, g, b] in 0..1) — term (a)'s no-pigment fallback.
 * Velocity is optional state: a field without it smears by zero and
 * still absorbs; pigment is optional the same way.
 */
export function soakFieldState(wet, ground) {
  if (!wet || !wet.wetMask || !wet.wetMask.rgba) return null;
  const vel = wet.wetVel && wet.wetVel.rgba ? wet.wetVel : null;
  return {
    mask: wet.wetMask,
    vel,
    velPack: vel && Number.isFinite(Number(vel.pack)) && Number(vel.pack) > 0 ? Number(vel.pack) : WET_SOAK_VEL_PACK,
    pig: wet.pigDep && wet.pigDep.rgba ? wet.pigDep : null,
    amount: clamp01(Number(wet.wetAmount) || 0),
    ground: ground || [0, 0, 0],
  };
}
