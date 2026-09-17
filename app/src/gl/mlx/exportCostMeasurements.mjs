/**
 * Cost-measurement export — MLX harness intelligence (backend hardening 6/6),
 * harness-side DATA EXPORT. Browser-safe (pure ESM, no Node imports).
 *
 * The harness (Layer 4, gpuTimer.mjs) measures each effect's real GPU cost.
 * This module turns those timings into kc-cost-measurement/1 JSONL records —
 * the training data the Mac Studio learns the cost model from
 * (docs/MLX_HARNESS_RUNBOOK.md §2).
 *
 * Typical call site (harness sweep runner, runs in the browser):
 *
 *   const t = createGpuTimer(gl);
 *   t.begin('accum-echo');
 *   runPass(...);
 *   t.end('accum-echo');
 *   const { timings } = t.poll();
 *   writeCostMeasurements([fromTimerPoll({ shader: 'accum-echo', effectKind: 'accum-echo',
 *       params: { echoes: 3 }, timings, meta })], '/tmp/cost_measurements.jsonl');
 *
 * Every record is validated before writing; a bad record throws naming the
 * offending field. JSONL = one JSON object per line, so a 10k-point sweep
 * stays appendable and grep-able.
 */

import { schemaId, SCHEMAS } from './schemas.mjs';

function fail(field, why) {
  throw new Error(`[mlx:cost] invalid record — ${field}: ${why}`);
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Validate a cost-measurement record (before writing or after reading).
 * @returns the record, unchanged.
 */
export function validateCostRecord(r) {
  if (!isPlainObject(r)) fail('record', 'must be an object');
  if (r.schema !== schemaId('costMeasurement')) fail('schema', `must be ${schemaId('costMeasurement')}`);
  if (typeof r.shader !== 'string' || !r.shader) fail('shader', 'must be a non-empty string (e.g. "accum-echo")');
  if (typeof r.effect_kind !== 'string' || !r.effect_kind) fail('effect_kind', 'must be a non-empty string');
  if (!isPlainObject(r.params)) fail('params', 'must be an object (the swept parameter values)');
  for (const f of ['ms_mean', 'ms_p50']) {
    if (typeof r[f] !== 'number' || !(r[f] >= 0)) fail(f, 'must be a non-negative number (GPU ms)');
  }
  if (!Number.isInteger(r.samples) || r.samples < 1) fail('samples', 'must be a positive integer');
  if (r.disjoint_discarded != null && (!Number.isInteger(r.disjoint_discarded) || r.disjoint_discarded < 0)) {
    fail('disjoint_discarded', 'must be a non-negative integer');
  }
  if (!isPlainObject(r.resolution) || !Number.isFinite(r.resolution.w) || !Number.isFinite(r.resolution.h)) {
    fail('resolution', 'must be { w, h } numbers');
  }
  if (typeof r.gpu_renderer !== 'string') fail('gpu_renderer', 'must be a string (may be "unknown" headless)');
  if (typeof r.harness_run_id !== 'string' || !r.harness_run_id) fail('harness_run_id', 'must be a non-empty string');
  if (typeof r.harness_commit !== 'string') fail('harness_commit', 'must be a string (git sha, may be "unknown")');
  if (typeof r.timestamp !== 'string' || Number.isNaN(Date.parse(r.timestamp))) fail('timestamp', 'must be an ISO-8601 string');
  return r;
}

/**
 * Build a record from a gpuTimer poll() result. `timings` is the Map<label, ms>
 * from createGpuTimer(gl).poll(); the label recorded must be present.
 */
export function fromTimerPoll({ shader, effectKind, params = {}, timings, label, meta = {} }) {
  const vals = [...timings.values()];
  if (!vals.length) {
    throw new Error(`[mlx:cost] no timings for "${label ?? shader}" — the GPU timer returned an empty map (disjoint or unsupported?)`);
  }
  const sorted = [...vals].sort((a, b) => a - b);
  const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
  const p50 = sorted[Math.floor(sorted.length / 2)];
  return validateCostRecord({
    schema: schemaId('costMeasurement'),
    shader,
    effect_kind: effectKind ?? shader,
    params,
    ms_mean: Math.round(mean * 1000) / 1000,
    ms_p50: Math.round(p50 * 1000) / 1000,
    samples: vals.length,
    disjoint_discarded: meta.disjointDiscarded ?? 0,
    resolution: meta.resolution ?? { w: 0, h: 0 },
    dpr: meta.dpr ?? 1,
    gpu_renderer: meta.gpuRenderer ?? 'unknown',
    harness_run_id: meta.runId ?? 'unknown',
    harness_commit: meta.commit ?? 'unknown',
    timestamp: new Date().toISOString(),
  });
}

/**
 * Serialize validated records as JSONL. (The harness writes the file; this
 * module stays browser-safe, so it returns text, never touches fs.)
 */
export function toJsonl(records) {
  return records.map((r) => JSON.stringify(validateCostRecord(r))).join('\n') + (records.length ? '\n' : '');
}

/** Parse + validate JSONL back into records (used by selfcheck and tooling). */
export function fromJsonl(text) {
  return text.split('\n').filter((l) => l.trim()).map((l, i) => {
    try {
      return validateCostRecord(JSON.parse(l));
    } catch (e) {
      throw new Error(`[mlx:cost] line ${i + 1}: ${e.message}`);
    }
  });
}

export const FIELDS = SCHEMAS.costMeasurement.fields;
