// costHead — Governor cost head (XGBoost T4, #1578).
//
// Feedforward term for the performance governor: predict a recipe's frame
// cost (ms) before its first frame so the ladder starts at the right rung.
// Reuses the pure tree-walk from the taste head (T1). Reactive ladder and
// live measurement always win; the head can never raise a budget.
//
// Model is optional: absent or out-of-range → today's static tiers, unchanged.
// Features = recipeFeatures + mechanism estimates + device probe descriptors.
// Prediction is log-ms quantile (τ≈0.9); we exp() to ms. Calibration multiplier
// applied if present. Unknown categoricals / OOR numerics fall back.

import { recipeFeatures } from '../curator/recipeFeatures.js';

/** Artifact kind for the cost model (parallel to taste's xgboost-trees). */
export const COST_HEAD_KIND = 'xgboost-cost';
export const COST_OBJECTIVE = 'reg:quantileerror';

// Artifact bounds — the same caps as the taste tree head (tasteHead.js).
const MAX_TREES = 512;
const MAX_TREE_DEPTH = 6;
const MAX_TREE_NODES = 20000;

/** Feature families that carry numbers and therefore split with '<':
 * recipe numerics (num.), mechanism estimates (mech.), device probes (probe.).
 * Everything else in the bag is a categorical and splits with '='. */
const isNumericCostFeature = (name) => name.startsWith('num.') || name.startsWith('mech.') || name.startsWith('probe.');

// Tree-walk pure functions (copied from tasteHead.js so the evaluator is shared
// in spirit; later extract to a common module if both grow).
const finite = (x) => typeof x === 'number' && Number.isFinite(x);
const treeEq = (a, b) =>
  a === b || (typeof a === 'boolean' && String(a) === b) || (typeof b === 'boolean' && String(b) === a);

function treeFeatureValue(features, name) {
  if (name.startsWith('num.')) return (features.num || {})[name.slice(4)] ?? 0;
  if (name.startsWith('mech.')) return features.mech?.[name.slice(5)] ?? 0;
  if (name.startsWith('probe.')) return features.probe?.[name.slice(6)] ?? 0;
  return features[name];
}

function walkTree(node, features, names) {
  let cur = node;
  while (!('leaf' in cur)) {
    const val = treeFeatureValue(features, names[cur.f]);
    const go = cur.op === '<' ? typeof val === 'number' && Number.isFinite(val) && val < cur.v : treeEq(val, cur.v);
    cur = go ? cur.y : cur.n;
  }
  return cur.leaf;
}

/**
 * Validate a cost model artifact. Returns { ok, model } or { ok: false, error }.
 * Full node validation mirroring the taste tree head (tasteHead.js): the
 * ensemble stays inside the artifact bounds, every split binds a declared
 * feature with the op its family requires, every number the walk will read
 * is finite — and validation rebuilds each node, so the app keeps a clean
 * copy and a file edited after validation cannot move predictions.
 */
export function validateCostModel(raw) {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'not a cost model' };
  if (raw.kind !== COST_HEAD_KIND) return { ok: false, error: 'not a cost model (kind)' };
  if (raw.objective !== COST_OBJECTIVE) return { ok: false, error: `objective must be ${COST_OBJECTIVE}` };
  if (!finite(raw.baseScore)) return { ok: false, error: 'bad baseScore' };
  const features = raw.features;
  if (!Array.isArray(features) || !features.length) return { ok: false, error: 'features missing' };
  const seen = new Set();
  for (const name of features) {
    if (typeof name !== 'string' || !name) return { ok: false, error: `bad feature name: ${String(name)}` };
    if (seen.has(name)) return { ok: false, error: `feature duplicated: ${name}` };
    seen.add(name);
  }
  const trees = raw.trees;
  if (!Array.isArray(trees) || !trees.length) return { ok: false, error: 'trees missing' };
  if (trees.length > MAX_TREES) return { ok: false, error: 'cost model too large' };
  const counter = { nodes: 0 };
  const clean = [];
  for (const t of trees) {
    const v = validateCostNode(t, features, 0, counter);
    if (v.error) return { ok: false, error: v.error };
    clean.push(v.node);
  }
  return {
    ok: true,
    model: {
      kind: COST_HEAD_KIND,
      objective: COST_OBJECTIVE,
      baseScore: raw.baseScore,
      calibration: finite(raw.calibration) ? raw.calibration : 1,
      features: [...features],
      trees: clean,
      tau: finite(raw.tau) ? raw.tau : 0.9,
    },
  };
}

/** One node: a leaf { leaf } or a split { f, op, v, y, n, gain }. Depth is
 * counted in split levels from the root (root = 0); the depth cap is also
 * what bounds this recursion. Returns { node } (a clean copy) or { error }. */
function validateCostNode(node, features, depth, counter) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return { error: 'bad tree node' };
  counter.nodes += 1;
  if (counter.nodes > MAX_TREE_NODES) return { error: 'cost model too large' };
  if (depth > MAX_TREE_DEPTH) return { error: 'cost model too deep' };
  if ('leaf' in node) {
    if (!finite(node.leaf)) return { error: 'bad tree leaf' };
    return { node: { leaf: node.leaf } };
  }
  const { f, op, v, gain } = node;
  if (!Number.isInteger(f) || f < 0 || f >= features.length) return { error: 'bad tree split feature index' };
  if (isNumericCostFeature(features[f])) {
    if (op !== '<' || !finite(v)) return { error: 'bad tree split: numeric features split with < on a finite number' };
  } else if (op !== '=' || (typeof v !== 'string' && typeof v !== 'boolean')) {
    return { error: 'bad tree split: categorical features split with = on a string/boolean' };
  }
  if (!finite(gain)) return { error: 'bad tree split gain' };
  const y = validateCostNode(node.y, features, depth + 1, counter);
  if (y.error) return y;
  const n = validateCostNode(node.n, features, depth + 1, counter);
  if (n.error) return n;
  return { node: { f, op, v, y: y.node, n: n.node, gain } };
}

/**
 * Predict frame ms for a feature vector. Returns null on fallback
 * (unknown feature, OOR, no model). The number is the calibrated
 * exp(base + Σ leaves) — under-prediction is the hitch-causing error.
 */
export function predictMs(model, features) {
  if (!model || !model.trees) return null;
  // Range / unknown check: any feature the model wants that is missing or
  // wildly OOR → fallback. (Trees saturate; we refuse to invent.)
  // Look at the raw bag before defaults so a missing probe/mech is unknown.
  for (const name of model.features) {
    let v;
    if (name.startsWith('mech.')) v = features.mech?.[name.slice(5)];
    else if (name.startsWith('probe.')) v = features.probe?.[name.slice(6)];
    else if (name.startsWith('num.')) v = features.num?.[name.slice(4)];
    else v = features[name];
    if (v === undefined || v === null) return null;
    if (typeof v === 'number' && (!Number.isFinite(v) || Math.abs(v) > 1e6)) return null;
  }
  let logMs = model.baseScore;
  for (const t of model.trees) logMs += walkTree(t, features, model.features);
  const ms = Math.exp(logMs) * (model.calibration || 1);
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}

/**
 * Mechanism feature estimates from a recipe. Approximations from known
 * cost tiers and param counts — good enough for the first feedforward
 * term; the harness will replace them with measured ones later.
 * All numbers are normalized-ish so trees trained on them stay in range.
 */
export function mechanismFeatures(layoutParams = {}, canvas = { w: 1920, h: 1080 }) {
  const p = layoutParams || {};
  const bodies = Number(p.count || p.particleCount || 100);
  // #1202 — scale arrives as { x: [lo, hi], y: [lo, hi] }; read the X pair,
  // the same convention recipeFeatures uses. (The original read took
  // p.scale?.x itself as the number — an array — and produced NaN mech
  // values for every current-shape recipe; found by the #1578 harness,
  // whose dataset gate refuses non-finite features.)
  const scalePair = Array.isArray(p.scale) ? p.scale : (p.scale?.x ?? [1, 1]);
  const scaleAvg = (Number(scalePair[0]) + Number(scalePair[1])) / 2;
  const scale = Number.isFinite(scaleAvg) ? scaleAvg : 1;
  const pixels = (canvas.w || 1920) * (canvas.h || 1080);
  // Rough: each body is ~1 instance; primitives ~scale²; passes from effects.
  const instances = Math.max(1, bodies);
  const primitives = Math.max(1, Math.round(scale * scale * 4));
  const passes = 2 + (p.accumulation ? 3 : 0) + (p.mirror ? 1 : 0);
  const overdraw = Math.min(4, scale * 1.5);
  const transparency = p.blendMode && p.blendMode !== 'normal' ? 0.7 : 0.2;
  const drawCalls = Math.max(1, Math.ceil(instances / 64));
  return {
    instancesXprim: instances * primitives,
    canvasXpasses: (pixels * passes) / 1e6,
    overdraw,
    transparencyXpixels: (transparency * pixels) / 1e6,
    drawCalls,
    cpuDriver: drawCalls * 0.05, // rough ms
  };
}

/**
 * Device probe descriptors. Call once at first launch; cache the result.
 * Four tiny self-run benchmarks (fill, instanced, blend, JS). Numbers are
 * relative so unseen devices still work and driver drift is absorbed.
 * Returns { fillRate, instanced, blend, js } in arbitrary units (lower = faster).
 */
export function runDeviceProbes() {
  // Placeholder pure estimates until the real microbenchmarks land.
  // Real probes will time a fill-rate quad, an instanced draw, a blend,
  // and a JS loop; store the medians. For now a neutral mid-tier device.
  return { fillRate: 1.0, instanced: 1.0, blend: 1.0, js: 1.0 };
}

/**
 * Full feature vector for the cost head.
 */
export function costFeatures({ layoutParams, paletteId, assets, canvas, probes } = {}) {
  const recipe = recipeFeatures({ layoutParams, paletteId, assets });
  const mech = mechanismFeatures(layoutParams, canvas);
  const probe = probes || runDeviceProbes();
  return {
    ...recipe,
    mech,
    probe,
  };
}

/**
 * Map a predicted ms to an initial governor rung overlay.
 * Never raises a budget: only suggests a shed if the prediction says
 * the full-quality first frame will hitch. Thresholds are conservative
 * (τ=0.9 already biases high). Reactive ladder can still climb or
 * descend further; this only primes the start.
 *
 * Returns a partial state { renderScale?, quality? } or null (no prime).
 */
export function initialRung(predictedMs, { targetFps = 30 } = {}) {
  if (!predictedMs || predictedMs <= 0) return null;
  const budgetMs = 1000 / targetFps;
  // If predicted well under budget, start full. If over, start lower.
  if (predictedMs < budgetMs * 0.7) return null; // comfortable
  if (predictedMs < budgetMs * 1.1) return { renderScale: 0.75 };
  if (predictedMs < budgetMs * 1.6) return { renderScale: 0.5, quality: 'balanced' };
  return { renderScale: 0.33, quality: 'performance' };
}

/**
 * High-level: given a recipe, predict and return the prime overlay
 * (or null). Model is injected; absent → null (static tiers).
 */
export function primeGovernor({ model, layoutParams, paletteId, assets, canvas, probes, targetFps } = {}) {
  if (!model) return null;
  const feats = costFeatures({ layoutParams, paletteId, assets, canvas, probes });
  const ms = predictMs(model, feats);
  return initialRung(ms, { targetFps });
}
