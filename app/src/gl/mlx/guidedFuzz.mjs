/**
 * Guided-fuzzing bias — MLX harness intelligence (backend hardening 6/6).
 * Browser-safe (pure ESM, no Node imports).
 *
 * The idea (backend-hardening item 12): the harness's failure history
 * (kc-sweep-failure/1 JSONL, written by exportSweepFailures.mjs) teaches the
 * next sweep where to look. Instead of spraying random parameter values
 * forever, the sweep samples harder in regions that broke before.
 *
 * This module is the minimal, additive core the future sweep harness adopts:
 *
 *   const failures = parseFailureLog(jsonlText);   // fromJsonl wrapper
 *   const bias = biasOrder(failures);               // params ranked by failure density
 *   const samples = suggestSamples(bias, paramSpec); // values to try next
 *
 * Active-learning loop, not magic: brand-new parameters with no history get
 * the default uniform spread; parameters with a failure record get their
 * hot region (min..max of failed values) over-sampled. The sweep still
 * covers the full range — it just spends more of its budget where the bugs
 * have been.
 */

import { fromJsonl } from './exportSweepFailures.mjs';

/** Parse a failure-history JSONL log (validates every line). */
export function parseFailureLog(text) {
  return fromJsonl(text);
}

/**
 * Failure density per (effect, param).
 *
 * @param {Array} failures — validated failure records
 * @returns {Map<string, { effect, param, failures, hotMin, hotMax, hotMean, distinctValues: number[] }>}
 *   keyed `${effect}::${param}`; params with no recorded failures are absent
 *   (the sweep treats absence as "spread uniformly").
 */
export function failureDensity(failures) {
  const buckets = new Map();
  for (const f of failures) {
    if (f.param_swept == null) continue; // whole-shader failures have no param region
    const key = `${f.effect}::${f.param_swept}`;
    let b = buckets.get(key);
    if (!b) {
      b = { effect: f.effect, param: f.param_swept, values: [] };
      buckets.set(key, b);
    }
    const v = f.params?.[f.param_swept];
    if (typeof v === 'number' && Number.isFinite(v)) b.values.push(v);
  }
  const out = new Map();
  for (const [key, b] of buckets) {
    const vs = b.values;
    out.set(key, {
      effect: b.effect,
      param: b.param,
      failures: b.values.length || 1, // records exist even when the value wasn't numeric
      hotMin: vs.length ? Math.min(...vs) : null,
      hotMax: vs.length ? Math.max(...vs) : null,
      hotMean: vs.length ? vs.reduce((s, v) => s + v, 0) / vs.length : null,
      distinctValues: [...new Set(vs)].sort((a, b2) => a - b2),
    });
  }
  return out;
}

/**
 * Rank parameters by failure density — the sweep's budget order.
 *
 * @param {Array} failures — validated failure records
 * @returns {Array} bias entries, most-failed first:
 *   { effect, param, weight (failures / total), hot: { min, max, mean } }
 */
export function biasOrder(failures) {
  const density = failureDensity(failures);
  const entries = [...density.values()];
  const total = entries.reduce((s, e) => s + e.failures, 0) || 1;
  return entries
    .map((e) => ({
      effect: e.effect,
      param: e.param,
      failures: e.failures,
      weight: Math.round((e.failures / total) * 1000) / 1000,
      hot: { min: e.hotMin, max: e.hotMax, mean: e.hotMean },
      values: e.distinctValues,
    }))
    .sort((a, b) => b.failures - a.failures || a.effect.localeCompare(b.effect));
}

/**
 * Suggest the next sample values for one parameter.
 *
 * @param {{ min: number, max: number, count: number }} spec — the sweep's
 *   declared range and how many samples it can afford for this parameter.
 * @param {{ hot: { min: number|null, max: number|null } }|null} biasEntry —
 *   from biasOrder(); null = no history, spread uniformly.
 * @returns {number[]} — `count` values. Half (rounded up) land inside the hot
 *   region when one exists (endpoints + midpoint of the region), the rest
 *   spread across the full range so coverage never collapses to the hot zone.
 *
 * Deterministic — same inputs, same samples. The randomness budget belongs
 * to the sweep runner, not here.
 */
export function suggestSamples(spec, biasEntry) {
  const { min, max, count } = spec;
  if (!(count >= 1)) throw new Error('[mlx:fuzz] suggestSamples needs count >= 1');
  if (!(max > min)) throw new Error('[mlx:fuzz] suggestSamples needs max > min');
  const spread = (a, b, n) => {
    if (n === 1) return [(a + b) / 2];
    return Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));
  };
  const hot = biasEntry?.hot;
  const hasHot = hot && hot.min != null && hot.max != null && hot.max > hot.min;
  if (!hasHot) return spread(min, max, count).map(round3);
  const hotN = Math.ceil(count / 2);
  const coldN = count - hotN;
  const hMin = Math.max(min, hot.min);
  const hMax = Math.min(max, hot.max);
  const pts = [...spread(hMin, hMax, hotN)];
  if (coldN > 0) pts.push(...spread(min, max, coldN));
  return [...new Set(pts.map(round3))].sort((a, b) => a - b);
}

function round3(v) {
  return Math.round(v * 1000) / 1000;
}
