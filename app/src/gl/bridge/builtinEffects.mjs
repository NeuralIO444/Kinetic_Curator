/**
 * Builtin Phase-1 effect registrations for the JS↔GL bridge (#194).
 * Browser-safe (no Node imports).
 *
 * These encode the exact uniform mappings the Phase-1 renderer used, so
 * the bridge path is pixel-identical: rgbSplit dx is in thousandths of
 * the canvas width, grain takes its amount plus a LUT texture.
 * Effect kinds outside this set (displace, tear, scanlines, solarize,
 * edge — and blur, removed as a design choice in #308) throw at chain
 * time — they land in Phase 2 (#188), or in #310's roster cut for blur.
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
 * The four builtin effect definitions (hardening 3/6): the bridge
 * definition AND the cost declaration live in the same object — there is
 * no parallel cost-only map. make(id) builds the bridge definition from
 * the effect-mode ids; cost is registered from this table at module
 * scope so the registry is complete without a live bridge.
 *
 * (#308: blur is gone — the instrument has no gaussian blur. The FX
 * roster's Blur entry is dead on the GL path until #310 cuts it from the
 * UI; an FX chain carrying kind 'blur' now throws "unknown effect kind",
 * the same fail-closed the Phase-2 kinds already had.)
 */
const one = (mode, params) => ({ program: 'effect', passes: [{ mode, params }] });

/**
 * #554 — the packers below are the last stop before u_p reaches the shader,
 * and this module cannot import the catalog (the GL harness serves only
 * src/gl, so the renderer graph stays self-contained). So each packer clamps
 * to its knob's catalog range itself, exactly as fx/fxFilters.js
 * sanitizeFxEffects does for the normal scene-contract path — and a selfcheck
 * asserts the two agree, so the ranges cannot drift. Hostile project JSON
 * (posterize levels=1 → 0/0 = NaN in the shader) never reaches the GPU even
 * when a caller skipped the contract sanitize.
 */
const knob = (v, lo, hi, def) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def;
};

export const BUILTIN_EFFECT_DEFS = [
  { kind: 'invert',
    cost: { tier: 3, memoryBytes: FRAME_16F, timeMs: 0.15, notes: 'pure ALU color op' },
    make: (id) => one(id.invert, () => [0, 0, 0, 0]) },
  { kind: 'rgbSplit',
    cost: { tier: 3, memoryBytes: FRAME_16F, timeMs: 0.3, notes: '3 taps + screen-alpha recombine' },
    make: (id) => one(id.rgbSplit, (p) => [knob(p.dx, 0, 24, 3) / 1000, 0, 0, 0]) },
  { kind: 'grain',
    cost: { tier: 3, memoryBytes: FRAME_16F, timeMs: 0.4, notes: 'LUT fetch + mix; grain LUT is baked, not per-frame' },
    make: (id) => one(id.grain, (p) => [knob(p.amount, 0, 1, 0.4), 0, 0, 0]) },
  { kind: 'posterize',
    cost: { tier: 3, memoryBytes: FRAME_16F, timeMs: 0.2, notes: 'pure ALU color op' },
    make: (id) => one(id.posterize, (p) => [knob(p.levels, 2, 8, 4), 0, 0, 0]) },
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
