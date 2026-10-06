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
 *
 * (#1022: blur is back — the honest-blur contract (#225) below is
 * reinstated with it. #308 retired gaussian blur as a design choice and
 * #310 cut the roster entry; #1022 earns it back for the EF-1 rack slot.)
 */
const one = (mode, params) => ({ program: 'effect', passes: [{ mode, params }] });

/**
 * Honest-blur contract (#225, reinstated #1022): EFFECT_FS caps its tap
 * loop at 64, so one (H,V) pass pair can only evaluate sigmas with
 * R = ceil(3σ) ≤ 64. Wider sigmas are subdivided into multiple pass pairs
 * at σ/√n — repeated gaussians convolve back to the full kernel.
 *
 * Frame-budget ceiling: 4 pass pairs (8 fullscreen passes worst case). The
 * slider's max amount (1 → σ 40) is delivered as a true gaussian up to
 * that ceiling at the live loop's full render scale (write width 1000).
 * Beyond the ceiling the sigma is clamped to the honest max for the
 * current write-target width — a smaller true gaussian, never a truncated
 * kernel. The clamp tightens automatically when the governor sheds
 * renderScale, because the write width shrinks with it.
 */
export const BLUR_MAX_PASS_PAIRS = 4;
export const BLUR_PASS_SIGMA_MAX = 64 / 3; // per-pass R = ceil(3σ) ≤ 64 taps

/** Widest device-px sigma the blur stack honestly delivers. */
export const honestBlurSigmaMax = () => BLUR_PASS_SIGMA_MAX * Math.sqrt(BLUR_MAX_PASS_PAIRS);

/** Clamp a requested device-px sigma to the honest ceiling (#225). */
export function clampBlurSigma(sigma) {
  return Math.min(Math.max(sigma || 0, 0), honestBlurSigmaMax());
}

/**
 * Sub-pass sigmas for one blur step: n pairs at σ/√n, each within the
 * 64-tap loop limit, convolving back to the (clamped) sigma. Returns []
 * at σ ≤ 0, so amount 0 is a true no-op with no wasted passes.
 */
export function blurSubPassSigmas(sigma) {
  if (!(sigma > 1e-3)) return [];
  // The -1e-9 absorbs float dust when sigma sits exactly on the ceiling
  // (the ceiling is an exact multiple of the per-pass max in float64, but
  // callers may pass dust above it — the invariant is n never overshoots).
  const n = Math.max(1, Math.ceil((sigma / BLUR_PASS_SIGMA_MAX) ** 2 - 1e-9));
  const sub = sigma / Math.sqrt(n);
  return Array.from({ length: n }, () => sub);
}

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

/** #816 — EFFECT_FS slot map. One program. u_effect selects the kind.
 *  u_p components are per-kind and must not be shared:
 *    invert    u_effect 0   u_p unused
 *    rgbSplit  u_effect 1   u_p.x = dx/1000 (canvas uv), yzw 0
 *    grain     u_effect 2   u_p.x = 0, u_p.y = amount (not dx)
 *    blur      u_effect 3/4 (H then V separable pair)   u_p.x = sigma (device px), yzw 0
 *    posterize u_effect 5   u_p.x = levels
 *  Missing grain aux is not a throw: the chain step still runs, u_aux
 *  falls back to the source texture (bridge.runChain).
 */
export const EFFECT_SLOT_MAP = Object.freeze({
  invert: { u_effect: 0, u_p: ['unused', 'unused', 'unused', 'unused'] },
  rgbSplit: { u_effect: 1, u_p: ['dx/1000', '0', '0', '0'] },
  grain: { u_effect: 2, u_p: ['0', 'amount', '0', '0'] },
  blur: { u_effect: '3/4', u_p: ['sigma', '0', '0', '0'] },
  posterize: { u_effect: 5, u_p: ['levels', '0', '0', '0'] },
});

/**
 * The blur step's dynamic pass list (#225): the amount is scaled to a
 * device-px sigma (amount 1 = σ 40 at full render scale), clamped to the
 * honest ceiling for the write-target width, then subdivided into (H,V)
 * pass pairs at σ/√n. The bridge evaluates this per step (function-form
 * passes — see bridge.mjs defineEffect).
 */
const blurPasses = (id) => (p, ctx) => {
  const sigma = clampBlurSigma(knob(p.amount, 0, 1, 0) * 40 * (ctx.width / 1000));
  const passes = [];
  for (const s of blurSubPassSigmas(sigma)) {
    const u = [s, 0, 0, 0];
    passes.push({ mode: id.blurH, params: () => u });
    passes.push({ mode: id.blurV, params: () => u });
  }
  return passes;
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
    make: (id) => one(id.grain, (p) => [0, knob(p.amount, 0, 1, 0.4), 0, 0]) },
  { kind: 'blur',
    // Two separable passes per sub-pass pair, subdivided past the shader's
    // 64-tap loop limit and clamped to the honest ceiling (#225): a
    // quality scaler with a documented worst case, not a silent truncation.
    // amount 0..1 → σ 0..40 device px at full render scale (#1022).
    cost: { tier: 2, memoryBytes: 2 * FRAME_16F, timeMs: 1.5,
      notes: 'H+V separable gaussian; subdivided past 64 taps, up to 4 pass pairs (8 passes) worst case; timeMs is per pair' },
    make: (id) => ({
      program: 'effect',
      pad: 0, // padded blur routing activates with Phase-2 shaders
      passes: blurPasses(id),
    }) },
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
