/**
 * glassCaustic.mjs — #1129 PR3: caustic-specular variant parameters.
 *
 * The broad glass specular from PR2 (pow 12) is a smooth sheen; real glass
 * breaks it into dancing micro-variation. This module parameterizes the
 * procedural noise field that does the breaking: one octave of the shared
 * kc_vnoise chunk (#196 — no baked texture, no upload, per the #1079
 * lesson), evaluated per lit fragment and multiplied into `spec`.
 *
 * The multiplier is glass-gated by mix: mix(1.0, c, 0.0) is bit-identical
 * to 1.0 (c is finite, so c * 0.0 is +0.0 and 1.0 + 0.0 is 1.0), so the
 * enamel specular is untouched, provably. Per-instance offset via v_seed
 * (already a fragment varying) so bodies don't share a noise pattern.
 *
 * Values are material judgement, tuned by eye on the dark-glass voice:
 *  - freq: noise cells across the instance's atlas UV. 28 = fine
 *    micro-variation; the sun sweep provides the motion (no time uniform).
 *  - base/amp: the multiplier spans [base, base + amp]. ±28% around 1.0
 *    breaks the sheen into shimmer without killing it.
 *
 * Browser-safe (no Node imports). Imported by gl/shaders.mjs (interpolated
 * into QUAD_FS) and by gl/glassCaustic.selfcheck.mjs.
 */
import { registerCostTier } from './costTiers.mjs';

export const GLASS_CAUSTIC = Object.freeze({
  freq: 28.0,
  base: 0.72,
  amp: 0.56,
});

// The multiplier the non-glass path must keep, exactly: 1.0 — the existing
// specular, unmodified. The selfcheck asserts the shader gates on this.
export const ENAMEL_CAUSTIC = 1.0;

registerCostTier('light/glass-caustic-spec', {
  tier: 0,
  memoryBytes: 0,
  timeMs: 0.05,
  notes: '#1129 PR3: caustic shimmer for glass instances — one kc_vnoise eval per lit fragment (~48 ALU: 4 hashes + bilinear mix), glass-gated by mix so the non-glass result is bit-identical to 1.0; rides the quad pass, never shed separately from it',
});
