/**
 * Static shader-source feature extractor — MLX harness intelligence
 * (backend hardening 6/6). Feature version `kc-feat/1`.
 *
 * The CI cost-tier predictor (app/scripts/predictCostTier.mjs) evaluates the
 * committed cost model on THESE features, extracted from the shader sources
 * exactly as they exist in the repo. The Mac Studio training command
 * (`studio/harness_intel.py train-cost-model`) must be fed the output of THIS
 * module (`node extractFeatures.mjs --out features.json`) — never a re-
 * implementation — so training and prediction can never drift apart.
 *
 * The features (documented exactly, no magic):
 *
 *   1. src_chars      — total GLSL source characters across the effect's
 *                        shaders. Proxy for "how much shader is there".
 *   2. texture_reads  — count of `texture(` calls. Each is a dependent or
 *                        direct texture fetch; fetches dominate GPU cost.
 *   3. vec_math       — count of dot/normalize/length/cross/mix/clamp/pow/
 *                        exp/log/sin/cos/tan/asin/acos/atan calls. ALU weight.
 *   4. loop_count     — count of `for (` loops. Loops usually mean repeated
 *                        texture fetches (blur taps, echo taps).
 *   5. branch_count   — count of `if (` branches. Divergence / discarded work.
 *   6. pass_count     — declared static metadata: fullscreen passes the
 *                        effect needs (blur = 2 separable passes, rest = 1).
 *   7. param_count    — declared static metadata: per-effect params mapped
 *                        into uniforms (proxy for how "driven" the pass is).
 *
 * Features 1–5 are extracted from source with the regexes below; 6–7 come
 * from effectSources.mjs (static, documented there). A future feature set is
 * a new version (`kc-feat/2`) with both sides updated together.
 */

import { effectSources } from './effectSources.mjs';

export const FEATURE_EXTRACTOR_VERSION = 'kc-feat/1';

export const FEATURE_NAMES = Object.freeze([
  'src_chars',
  'texture_reads',
  'vec_math',
  'loop_count',
  'branch_count',
  'pass_count',
  'param_count',
]);

const RE = {
  texture: /texture\s*\(/g,
  vecMath: /\b(dot|normalize|length|cross|mix|clamp|pow|exp|log|sin|cos|tan|asin|acos|atan)\s*\(/g,
  loop: /\bfor\s*\(/g,
  branch: /\bif\s*\(/g,
};

function count(src, re) {
  const m = src.match(new RegExp(re.source, re.flags));
  return m ? m.length : 0;
}

/**
 * Extract the feature vector for one effect kind's shader sources.
 * @param {{ sources: string[], passCount: number, paramCount: number }} spec
 * @returns {number[]} — 7 numbers, in FEATURE_NAMES order.
 */
export function extractFeaturesFor(spec) {
  const joined = spec.sources.join('\n');
  return [
    joined.length,
    count(joined, RE.texture),
    count(joined, RE.vecMath),
    count(joined, RE.loop),
    count(joined, RE.branch),
    spec.passCount,
    spec.paramCount,
  ];
}

/**
 * Feature matrix for every known effect kind.
 * @returns {Map<string, number[]>} kind -> feature vector.
 */
export function extractAllFeatures() {
  const out = new Map();
  for (const [kind, spec] of effectSources()) {
    out.set(kind, extractFeaturesFor(spec));
  }
  return out;
}

/**
 * Linear score under a committed cost model: intercept + Σ wᵢ·xᵢ.
 * @param {number[]} features
 * @param {{ weights: number[], intercept: number }} model
 */
export function linearScore(features, model) {
  if (model.weights.length !== features.length) {
    throw new Error(
      `[mlx] cost model has ${model.weights.length} weights but extractor ${FEATURE_EXTRACTOR_VERSION} ` +
      `produces ${features.length} features — model and extractor disagree (re-train with the current extractor)`,
    );
  }
  return features.reduce((s, x, i) => s + x * model.weights[i], model.intercept);
}

/**
 * Score -> tier 0..3 via the committed tier boundaries [b01, b12, b23].
 */
export function scoreToTier(score, boundaries) {
  const [b01, b12, b23] = boundaries;
  if (score < b01) return 0;
  if (score < b12) return 1;
  if (score < b23) return 2;
  return 3;
}

// CLI: node extractFeatures.mjs --out features.json
// Writes { feature_extractor, feature_names, features: { kind: [...] } } —
// the file the Mac Studio training command consumes.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) {
  const outIdx = process.argv.indexOf('--out');
  const outPath = outIdx >= 0 ? process.argv[outIdx + 1] : null;
  const payload = {
    feature_extractor: FEATURE_EXTRACTOR_VERSION,
    feature_names: [...FEATURE_NAMES],
    features: Object.fromEntries(extractAllFeatures()),
  };
  if (outPath) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(outPath, JSON.stringify(payload, null, 2) + '\n');
    console.log(`[mlx] wrote ${payload.features ? Object.keys(payload.features).length : 0} effect feature vectors -> ${outPath}`);
  } else {
    console.log(JSON.stringify(payload, null, 2));
  }
}
