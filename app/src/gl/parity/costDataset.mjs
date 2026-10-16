/**
 * costDataset — the T4 governor cost-head DATASET contract (#1578, harness slice).
 *
 * Pure module: frame-time statistics, the label definition, the device-probe
 * work spec, and structural validation for the JSON artifact costBench.mjs
 * emits. The Studio training slice consumes exactly what validateDataset
 * accepts — if it isn't valid here, it isn't training data.
 *
 * Label law (from the issue + research, do not improvise):
 * - Labels are MEASURED frame times from the harness, never telemetry and
 *   never synthetic estimates.
 * - One repetition = a run of consecutive readback-forced renderScene calls
 *   (the parity renderer's own upper-bound frame cost, readPixels included —
 *   the same convention as perf.mjs / #189). Warm-up renders are discarded:
 *   GPU clocks ramp and shaders compile on first touch, so cold frames lie.
 * - A row's label is the MEDIAN OF THE PER-REPETITION p90s: the governor
 *   cares about the bad end of a recipe's frame distribution, and the median
 *   across repetitions keeps one thermal hiccup from becoming the label.
 * - All summaries (mean/p50/p90/p99/max) are stored per repetition so a
 *   mean-head or a different quantile can be re-derived without re-measuring.
 *
 * Features are whatever src/hooks/costHead.mjs `costFeatures()` produces for
 * the row's doc + canvas + probes (recipeFeatures v4 + mech. estimates +
 * probe. descriptors). This module does not invent features.
 */

export const COST_DATASET_KIND = 'kc-cost-dataset';
export const COST_DATASET_VERSION = 1;
export const LABEL_DEFINITION = 'median of per-repetition p90 frame ms (readback-forced renderScene, warm-up discarded)';

/**
 * The four device-probe microbenchmarks (FTRF-style: descriptors of the
 * measurement environment, never a device name). The bench page
 * (costBench.html) implements this exact work spec; the numbers below are
 * duplicated there on purpose — same convention as costTiers.measure.mjs
 * duplicating BATCH_DRAWS — so the page needs no build step to agree.
 * A future runtime probe slice should reuse these definitions verbatim so
 * harness rows and runtime probes stay comparable.
 */
export const PROBE_SPEC = Object.freeze({
  // Fullscreen fragment-bound pass: 512x512 RGBA8 target, fragment shader
  // runs a 48-iteration sin/cos loop, 16 draws per repetition.
  fill: { size: 512, draws: 16, fragIters: 48 },
  // Instanced throughput: 8192 instanced 2-triangle quads, 8 draws.
  instanced: { instances: 8192, draws: 8 },
  // Blend/overdraw: 512x512, 24 fullscreen quads, blending on, alpha 0.1.
  blend: { size: 512, quads: 24 },
  // CPU/JS: 2,000,000 iterations of a small math loop.
  js: { iterations: 2_000_000 },
  reps: 5, // median of 5, after 1 discarded warm-up
});

/** Nearest-rank percentile on an ascending-sorted copy. p in (0, 100]. */
export function percentile(sortedAsc, p) {
  if (!sortedAsc.length) return null;
  const rank = Math.max(1, Math.ceil((p / 100) * sortedAsc.length));
  return sortedAsc[Math.min(rank, sortedAsc.length) - 1];
}

export function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

/** Summarize one repetition's per-frame ms samples. */
export function summarizeFrames(timesMs) {
  const times = (timesMs || []).filter((t) => typeof t === 'number' && Number.isFinite(t) && t >= 0);
  if (!times.length) return null;
  const s = [...times].sort((a, b) => a - b);
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  return {
    n: times.length,
    mean: +mean.toFixed(4),
    p50: +percentile(s, 50).toFixed(4),
    p90: +percentile(s, 90).toFixed(4),
    p99: +percentile(s, 99).toFixed(4),
    max: +s[s.length - 1].toFixed(4),
  };
}

/** The row label: median of the repetitions' p90s. Null when no rep measured. */
export function labelFromReps(reps) {
  const p90s = (reps || []).map((r) => r && r.p90).filter((x) => typeof x === 'number' && Number.isFinite(x));
  if (!p90s.length) return null;
  return +median(p90s).toFixed(4);
}

const finite = (x) => typeof x === 'number' && Number.isFinite(x);

/**
 * Structural validation of a dataset artifact — the training slice's entry
 * gate. Returns { ok, errors }. Deliberately strict about the things a
 * trainer would silently choke on (missing feature bags, label/rep mismatch,
 * unversioned schema) and silent about everything else.
 */
export function validateDataset(ds) {
  const errors = [];
  const bad = (m) => errors.push(m);
  if (!ds || typeof ds !== 'object') return { ok: false, errors: ['dataset is not an object'] };
  if (ds.kind !== COST_DATASET_KIND) bad(`kind must be ${COST_DATASET_KIND}`);
  if (ds.version !== COST_DATASET_VERSION) bad(`version must be ${COST_DATASET_VERSION}`);
  if (!ds.environment || typeof ds.environment !== 'object') bad('environment block missing');
  else {
    if (typeof ds.environment.renderer !== 'string' || !ds.environment.renderer) bad('environment.renderer missing');
    if (typeof ds.environment.swiftShader !== 'boolean') bad('environment.swiftShader must be a boolean');
  }
  if (!ds.method || typeof ds.method !== 'object') bad('method block missing');
  else if (ds.method.label !== LABEL_DEFINITION) bad('method.label does not match the label definition');
  if (!Array.isArray(ds.rows) || !ds.rows.length) bad('rows missing or empty');
  const ids = new Set();
  for (const [i, row] of (ds.rows || []).entries()) {
    const at = `rows[${i}]${row && row.id ? ` (${row.id})` : ''}`;
    if (!row || typeof row !== 'object') { bad(`${at}: not an object`); continue; }
    if (typeof row.id !== 'string' || !row.id) bad(`${at}: id missing`);
    else if (ids.has(row.id)) bad(`${at}: duplicate id`);
    else ids.add(row.id);
    if (!row.doc || typeof row.doc !== 'object') bad(`${at}: doc missing (rows must be replayable)`);
    const f = row.features;
    if (!f || typeof f !== 'object') bad(`${at}: features missing`);
    else {
      if (!f.num || typeof f.num !== 'object') bad(`${at}: features.num missing`);
      else for (const [k, v] of Object.entries(f.num)) if (!finite(v)) bad(`${at}: features.num.${k} must be a finite number`);
      if (!f.mech || typeof f.mech !== 'object') bad(`${at}: features.mech missing`);
      else for (const [k, v] of Object.entries(f.mech)) if (!finite(v)) bad(`${at}: features.mech.${k} must be a finite number`);
      if (!f.probe || typeof f.probe !== 'object') bad(`${at}: features.probe missing`);
      // Probe keys are costHead's runtime names (runDeviceProbes' bag):
      // the dataset's feature vectors must be the vectors a trainer — and
      // later the runtime — actually see.
      if (f && f.probe) for (const k of ['fillRate', 'instanced', 'blend', 'js']) {
        if (!finite(f.probe[k])) bad(`${at}: features.probe.${k} must be a finite number`);
      }
    }
    if (!row.canvas || !finite(row.canvas.w) || !finite(row.canvas.h)) bad(`${at}: canvas missing`);
    if (row.status === 'failed') {
      if (typeof row.error !== 'string' || !row.error) bad(`${at}: failed row must carry its error`);
      continue;
    }
    if (row.status !== 'measured') bad(`${at}: status must be 'measured' or 'failed'`);
    if (!Array.isArray(row.reps) || !row.reps.length) bad(`${at}: reps missing`);
    else {
      for (const r of row.reps) {
        if (!r || !finite(r.p90) || !finite(r.p50) || !finite(r.mean) || !(r.n > 0)) { bad(`${at}: bad rep summary`); break; }
      }
      const expect = labelFromReps(row.reps);
      if (!finite(row.labelMs)) bad(`${at}: labelMs missing`);
      else if (expect !== null && Math.abs(expect - row.labelMs) > 0.001) {
        bad(`${at}: labelMs ${row.labelMs} != median-of-p90 ${expect}`);
      }
    }
  }
  return { ok: errors.length === 0, errors };
}
