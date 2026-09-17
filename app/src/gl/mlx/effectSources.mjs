/**
 * Effect → GLSL source map — MLX harness intelligence (backend hardening 6/6).
 *
 * The single place that says "this effect kind is these shader sources".
 * The static feature extractor (extractFeatures.mjs) and the CI cost-tier
 * predictor (app/scripts/predictCostTier.mjs) both read this, so the features
 * CI evaluates are exactly the features the Mac Studio trained on.
 *
 * Browser-safe (pure ESM, no Node imports) and additive — nothing existing
 * was touched. Note: `accum.mjs` gained one additive export
 * (ACCUM_PASS_SOURCES) to make this possible; no harness behavior changed.
 */

import { FULL_VS, COMPOSITE_FS, RESOLVE_FS, COPY_FS, QUAD_VS, QUAD_FS, EFFECT_FS } from '../shaders.mjs';
import { FX_SHADER_EFFECTS } from '../effects/fxShaders.mjs';
import { ACCUM_PASS_SOURCES } from '../accum.mjs';
import { declaredKinds } from './declaredCostTiers.mjs';

// Builtin effects (single EFFECT_FS shader, mode-switched). param_count is the
// number of effect params the bridge maps into u_p (see bridge/builtinEffects.mjs).
const BUILTIN = {
  invert:    { paramCount: 0, passCount: 1 },
  rgbSplit:  { paramCount: 1, passCount: 1 },
  grain:     { paramCount: 1, passCount: 1 },
  blur:      { paramCount: 1, passCount: 2 }, // two separable passes (H then V)
  posterize: { paramCount: 1, passCount: 1 },
};

// Renderer + accum programs. param_count counts the uniforms that carry
// per-frame data (a static proxy for how much the pass is driven); passCount
// is 1 for all of them.
const PROGRAMS = {
  quad:        { fs: QUAD_FS,  vs: QUAD_VS, paramCount: 0, passCount: 1 },
  composite:   { fs: COMPOSITE_FS, vs: FULL_VS, paramCount: 3, passCount: 1 },
  resolve:     { fs: RESOLVE_FS,   vs: FULL_VS, paramCount: 0, passCount: 1 },
  copy:        { fs: COPY_FS,  vs: FULL_VS, paramCount: 0, passCount: 1 },
};

/**
 * @returns {Map<string, { sources: string[], passCount: number, paramCount: number, file: string }>}
 * kind -> fragment/vertex sources + static metadata.
 */
export function effectSources() {
  const out = new Map();

  for (const [kind, spec] of Object.entries(PROGRAMS)) {
    out.set(kind, { sources: [spec.vs, spec.fs], passCount: spec.passCount, paramCount: spec.paramCount, file: 'shaders.mjs' });
  }
  for (const [kind, spec] of Object.entries(BUILTIN)) {
    out.set(kind, { sources: [EFFECT_FS], passCount: spec.passCount, paramCount: spec.paramCount, file: 'shaders.mjs:EFFECT_FS' });
  }
  for (const [kind, def] of FX_SHADER_EFFECTS) {
    const paramCount = Object.keys(def.descriptor.params || {}).length;
    out.set(kind, { sources: [def.fs], passCount: 1, paramCount, file: def.file });
  }
  for (const [pass, fs] of Object.entries(ACCUM_PASS_SOURCES)) {
    const kind = `accum-${pass}`;
    out.set(kind, { sources: [fs], passCount: 1, paramCount: 6, file: `accum.mjs:${pass.toUpperCase()}_FS` });
  }
  return out;
}

/**
 * Every declared-tier kind must have sources, and vice versa — the two tables
 * describe the same effects. Throws naming the offender.
 */
export function assertSourcesCoverDeclared() {
  const kinds = new Set(declaredKinds());
  const srcs = effectSources();
  for (const k of kinds) {
    if (!srcs.has(k)) throw new Error(`[mlx] declared tier for "${k}" but no shader sources — extend effectSources()`);
  }
  for (const k of srcs.keys()) {
    if (!kinds.has(k)) throw new Error(`[mlx] shader sources for "${k}" but no declared tier — extend declaredCostTiers.json`);
  }
  return { kinds: srcs.size };
}
