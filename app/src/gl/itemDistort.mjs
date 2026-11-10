/**
 * itemDistort.mjs — #2010 (RAY GUN P3 · THE SHARED DISTORTION CHANNEL): per-item spatial distortion, carried the way
 * velocity smear carries stretch — on the instance, in the existing quad shaders, with ZERO fullscreen passes.
 *
 * WHY HERE (docs/design/raygun-headroom-2026-11-06.md §7): the item list at the render seam is the one place where
 * type, creature parts, beast stamps and ordinary marks are already the same thing. A distortion that rides the
 * INSTANCE reaches every citizen by being an item — a poem glyph, a creature's wing, a beast's stamp — and it is
 * carried through every later transform (zoom, pan, breath, morph) for free, because it is a property of the quad,
 * not of a scene-space mesh. Producers stamp `distort` on an item; nothing else in the pipeline changes.
 *
 * THE RECORD — `item.distort = { shear, melt, tear, seed }` (each optional, all plain numbers):
 *   shear  ∈ [-SHEAR_MAX, SHEAR_MAX]  the quad leans: x moves with y in the item's own frame (QUAD_VS, affine)
 *   melt   ∈ [0, 1]                   the ink drips: each column's lower ink is pulled down by a seeded amount (QUAD_FS)
 *   tear   ∈ [0, 1]                   the ink is cut in horizontal bands that slide apart sideways (QUAD_FS)
 *   seed   ∈ [0, 1)                   which drips and which bands — a pure function of the record, so a take replays
 * All zero (or no record) is the old quad, bit for bit: the contract carries no key, the packer writes zeros, and both
 * shader branches are gated so they never enter.
 *
 * THE BEAST RULE (§7): distortion applies to the stamps a pose EMITS, never to joints or measures — this channel only
 * ever bends a drawn quad, so it cannot reach a solver. Treatments stay OUT of the creature genome: nothing here
 * writes a record; producers decide.
 *
 * STILLS: the GL stills path renders through the same renderer, so it carries the channel. The SVG studio renderer
 * does not draw per-instance GPU deforms (the #1410 impact-deform precedent) — a studio still shows the undistorted
 * mark.
 *
 * Browser-safe, pure.
 */

import { registerCostTier } from './costTiers.mjs';

// Tier 2, the deform rung (sceneContract.distortHeatOf): §7's shed law — treatment fidelity sheds on HEAT, never
// on/off, so a distorted poem never snaps plain mid-performance; under the tier-2 shed every distortion is drawn at
// half strength. The work itself is a few ALU in the existing quad shaders (gated off at 0) — no pass, no texture, no
// draw call — and four floats per instance in the VBO (16 B each, ~32 KB at 2,000 instances, distorted or not).
registerCostTier('gl/distort-channel', {
  tier: 2,
  memoryBytes: 32000,
  timeMs: 0.02,
  notes:
    '#2010 P3 distortion channel: per-instance shear (QUAD_VS, affine) + melt/tear (QUAD_FS, one moved atlas sample) ' +
    'in the existing quad shaders; four floats per instance (the 45→49 stride append). Zero passes, zero textures; ' +
    'gated so an undistorted instance is the old path bit for bit. Tier-2 shed lowers its heat (u_distHeat 0.5), never to 0.',
});

export const SHEAR_MAX = 0.8;

const round3 = (v) => Math.round(v * 1000) / 1000;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * An item's distortion record as the contract carries it: [shear, melt, tear, seed], rounded to 3 places like every
 * contract number — or null when there is none or it rounds to nothing (the contract then carries no key).
 */
export function contractDistort(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const num = (v) => (Number.isFinite(v) ? v : 0);
  const shear = round3(clamp(num(raw.shear), -SHEAR_MAX, SHEAR_MAX));
  const melt = round3(clamp(num(raw.melt), 0, 1));
  const tear = round3(clamp(num(raw.tear), 0, 1));
  if (shear === 0 && melt === 0 && tear === 0) return null;
  const seed = round3(clamp(num(raw.seed), 0, 0.999));
  return [shear, melt, tear, seed];
}

/** The contract's validation of a carried `distort` (assertSceneContract): an error string, or null. */
export function distortError(d) {
  if (!Array.isArray(d) || d.length !== 4 || !d.every(Number.isFinite))
    return 'distort must be [shear, melt, tear, seed] of finite numbers';
  if (Math.abs(d[0]) > SHEAR_MAX) return `distort shear must be within ±${SHEAR_MAX}`;
  if (d[1] < 0 || d[1] > 1 || d[2] < 0 || d[2] > 1) return 'distort melt and tear must be in [0, 1]';
  if (d[3] < 0 || d[3] >= 1) return 'distort seed must be in [0, 1)';
  if (d[0] === 0 && d[1] === 0 && d[2] === 0) return 'an all-zero distort is not carried (the key is absent instead)';
  return null;
}
