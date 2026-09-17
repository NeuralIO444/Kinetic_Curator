/**
 * Builtin Phase-1 effect registrations for the JS↔GL bridge (#194).
 * Browser-safe (no Node imports).
 *
 * These encode the exact uniform mappings the Phase-1 renderer used, so
 * the bridge path is pixel-identical: rgbSplit dx is in thousandths of
 * the canvas width, blur runs as two separable passes with sigma scaled
 * by the write target width, grain takes its amount plus a LUT texture.
 * Effect kinds outside this set (displace, tear, scanlines, solarize,
 * edge) throw at chain time — they land in Phase 2 (#188).
 */

import { FULL_VS, EFFECT_FS, EFFECT_IDS } from '../shaders.mjs';
import { registerCostTier } from '../costTiers.mjs';

/** Declared upload set for the builtin 'effect' program — also the harness audit list. */
export const UNIFORMS = {
  u_src: { kind: 'sampler', unit: 0 },
  u_aux: { kind: 'sampler', unit: 1 },
  u_effect: { kind: 'int' },
  u_p: { kind: 'vec4' },
  u_texel: { kind: 'vec2' },
  u_res: { kind: 'vec2' }, // not declared by EFFECT_FS (null location → skipped)
  u_clip: { kind: 'vec4' },
  u_clipOn: { kind: 'float' },
};

/** One 1080p RGBA16F write target of transient working set. */
const FRAME_16F = 1920 * 1080 * 8;

/**
 * The five builtin effect definitions (hardening 3/6): the bridge
 * definition AND the cost declaration live in the same object — there is
 * no parallel cost-only map. make(id) builds the bridge definition from
 * the effect-mode ids; cost is registered from this table at module
 * scope so the registry is complete without a live bridge.
 */
const one = (mode, params) => ({ program: 'effect', passes: [{ mode, params }] });
const sigmaOf = (p, ctx) => [(p.radius || 0) * (ctx.width / 1000), 0, 0, 0];
const BUILTIN_EFFECT_DEFS = [
  { kind: 'invert',
    cost: { tier: 3, memoryBytes: FRAME_16F, timeMs: 0.15, notes: 'pure ALU color op' },
    make: (id) => one(id.invert, () => [0, 0, 0, 0]) },
  { kind: 'rgbSplit',
    cost: { tier: 3, memoryBytes: FRAME_16F, timeMs: 0.3, notes: '3 taps + screen-alpha recombine' },
    make: (id) => one(id.rgbSplit, (p) => [(p.dx || 0) / 1000, 0, 0, 0]) },
  { kind: 'grain',
    cost: { tier: 3, memoryBytes: FRAME_16F, timeMs: 0.4, notes: 'LUT fetch + mix; grain LUT is baked, not per-frame' },
    make: (id) => one(id.grain, (p) => [p.amount ?? 0.4, 0, 0, 0]) },
  { kind: 'blur',
    // Two separable passes with a sigma-scaled tap loop: a quality scaler.
    cost: { tier: 2, memoryBytes: 2 * FRAME_16F, timeMs: 1.5, notes: 'H+V separable gaussian; tap count scales with sigma' },
    make: (id) => ({
      program: 'effect',
      pad: 0, // padded blur routing activates with Phase-2 shaders
      passes: [
        { mode: id.blurH, params: sigmaOf },
        { mode: id.blurV, params: sigmaOf },
      ],
    }) },
  { kind: 'posterize',
    cost: { tier: 3, memoryBytes: FRAME_16F, timeMs: 0.2, notes: 'pure ALU color op' },
    make: (id) => one(id.posterize, (p) => [p.levels || 4, 0, 0, 0]) },
];

// Module-scope registration: the gate imports this file without a bridge.
for (const { kind, cost } of BUILTIN_EFFECT_DEFS) {
  registerCostTier(`builtin/${kind}`, cost);
}

export function registerBuiltinEffects(bridge) {  bridge.registerProgram('effect', FULL_VS, EFFECT_FS, {
    uniforms: UNIFORMS,
    file: 'shaders.mjs:EFFECT_FS',
  });
  const id = EFFECT_IDS;
  for (const { kind, make } of BUILTIN_EFFECT_DEFS) {
    bridge.defineEffect(kind, make(id));
  }
}
