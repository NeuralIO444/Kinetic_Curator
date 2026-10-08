/**
 * glassBevel.mjs — #1129 PR2: soft-bevel variant parameters.
 *
 * Frosted glass wants gradients that spread, not snap. These three numbers
 * parameterize the #594 PR2 bevel-from-alpha block for glass-flagged
 * instances; non-glass instances keep the exact existing values. The shader
 * selects per-instance via v_glass (0/1), and mix(x, y, 0.0) is bit-identical
 * to x — so the enamel path is untouched, provably.
 *
 * Values are material judgement, tuned by eye on the dark-glass voice:
 *  - tapTexels: alpha taps reach this far out (vs 2.0). The slope spreads
 *    over ~3x the distance — a wide soft bevel instead of a tight edge.
 *  - bevelScale: multiplies the slope strength (vs 1.0). Gentler normals,
 *    so the light falls off gradually: frosted volume, not enamel edge.
 *  - specPow: specular tightness (vs 48.0). A broad sheen instead of an
 *    enamel pinpoint; PR3 (caustic) will break it up further.
 *
 * Browser-safe (no Node imports). Imported by gl/shaders.mjs (interpolated
 * into QUAD_FS) and by gl/glassBevel.selfcheck.mjs.
 */
import { registerCostTier } from './costTiers.mjs';

export const GLASS_BEVEL = Object.freeze({
  tapTexels: 6.0,
  bevelScale: 0.45,
  specPow: 12.0,
});

// The values the non-glass path must keep, exactly. The selfcheck asserts
// the shader mixes against these — if they drift, the enamel path changed.
export const ENAMEL_BEVEL = Object.freeze({
  tapTexels: 2.0,
  bevelScale: 1.0,
  specPow: 48.0,
});

registerCostTier('light/glass-soft-bevel', {
  tier: 0,
  memoryBytes: 0,
  timeMs: 0.01,
  notes: '#1129 PR2: soft-bevel variant for glass instances — same 4 alpha taps at wider offsets (zero new texture fetches), 3 extra mix ALU ops per lit fragment; negligible delta over the existing bevel, never shed separately from the quad pass',
});
