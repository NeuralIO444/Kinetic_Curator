/**
 * glassStriation.mjs — #1129 PR4: internal-striation variant parameters.
 *
 * The final stage of the glass-body stack. Real glass has faint internal
 * layering — you see *through* the body, not *at* a surface. This module
 * parameterizes a fine vertical luminance banding term applied to the
 * diffuse wrap in the #594 lighting block: a sine over noise-warped
 * instance-local y, masked by the body's own alpha so bands never paint
 * outside the silhouette.
 *
 * Subtlety is the whole point: amp is ±5%, so the bands read as internal
 * depth, never as a visible pattern or surface paint. The noise warp keeps
 * them organic (layered glass breathes; stripes would not).
 *
 * The term is glass-gated by mix: mix(1.0, s, 0.0) is bit-identical to 1.0
 * (s is finite — sine, clamp and a finite warp — so s * 0.0 is +0.0 and
 * 1.0 + 0.0 is 1.0), so the enamel diffuse is untouched, provably.
 * Per-instance offset via v_seed (already a fragment varying) so bodies
 * don't share a banding pattern.
 *
 * Values are material judgement, tuned by eye on the dark-glass voice:
 *  - freq: bands across the instance's local y (0..1). 9 = fine; the
 *    bands sit inside the body, never resolving as stripes.
 *  - amp: ±5% luminance around the diffuse wrap — internal depth.
 *  - warpFreq/warpAmp: one kc_vnoise octave (#196, procedural: no texture,
 *    no upload, per the #1079 lesson) warps the band phase so it breathes
 *    like layered glass instead of printing a grid.
 *  - seedOffset: decorrelates the warp field from the PR3 caustic field.
 *
 * Browser-safe (no Node imports). Imported by gl/shaders.mjs (interpolated
 * into QUAD_FS) and by gl/glassStriation.selfcheck.mjs.
 */
import { registerCostTier } from './costTiers.mjs';

export const GLASS_STRIATION = Object.freeze({
  freq: 9.0,
  amp: 0.05,
  warpFreq: 3.0,
  warpAmp: 1.2,
  seedOffset: 31.0,
});

// The multiplier the non-glass path must keep, exactly: 1.0 — the existing
// diffuse, unmodified. The selfcheck asserts the shader gates on this.
export const ENAMEL_STRIATION = 1.0;

registerCostTier('light/glass-striation', {
  tier: 0,
  memoryBytes: 0,
  timeMs: 0.05,
  notes: '#1129 PR4: internal striations for glass instances — one kc_vnoise eval + sine per lit fragment (~50 ALU), glass-gated by mix so the non-glass result is bit-identical to 1.0; rides the quad pass, never shed separately from it',
});
