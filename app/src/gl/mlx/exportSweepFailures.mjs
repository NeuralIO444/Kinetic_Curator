/**
 * Sweep-failure export — MLX harness intelligence (backend hardening 6/6),
 * harness-side DATA EXPORT. Browser-safe (pure ESM, no Node imports).
 *
 * Every harness sweep point that fails (NaN scan, range check, zero-no-op,
 * compile/link, uniform audit, golden diff) becomes a kc-sweep-failure/1
 * JSONL record. The accumulated failure history is what the future sweep
 * harness learns from: guidedFuzz.mjs biases future sweeps toward the
 * parameter regions that broke before (backend-hardening item 12).
 *
 * The schema is documented for humans in docs/FAILURE_HISTORY_SCHEMA.md;
 * this module is the machine-readable twin — the writers here must agree
 * with that doc.
 */

import { schemaId, SCHEMAS } from './schemas.mjs';

function fail(field, why) {
  throw new Error(`[mlx:failure] invalid record — ${field}: ${why}`);
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

const CHECKS = SCHEMAS.sweepFailure.checks;
const SEVERITIES = SCHEMAS.sweepFailure.severities;

/**
 * Validate a sweep-failure record. Returns the record unchanged.
 */
export function validateFailureRecord(r) {
  if (!isPlainObject(r)) fail('record', 'must be an object');
  if (r.schema !== schemaId('sweepFailure')) fail('schema', `must be ${schemaId('sweepFailure')}`);
  if (typeof r.effect !== 'string' || !r.effect) fail('effect', 'must be a non-empty string');
  if (typeof r.shader !== 'string' || !r.shader) fail('shader', 'must be a non-empty string');
  if (!isPlainObject(r.params)) fail('params', 'must be an object of the swept parameter values');
  if (r.param_swept != null && typeof r.param_swept !== 'string') fail('param_swept', 'must be a string or null');
  if (!CHECKS.includes(r.check)) fail('check', `must be one of ${CHECKS.join(', ')}`);
  if (!SEVERITIES.includes(r.severity)) fail('severity', `must be one of ${SEVERITIES.join(', ')}`);
  if (typeof r.message !== 'string' || !r.message) fail('message', 'must be a non-empty string naming what went wrong');
  if (typeof r.harness_run_id !== 'string' || !r.harness_run_id) fail('harness_run_id', 'must be a non-empty string');
  if (typeof r.harness_commit !== 'string') fail('harness_commit', 'must be a string');
  if (typeof r.timestamp !== 'string' || Number.isNaN(Date.parse(r.timestamp))) fail('timestamp', 'must be an ISO-8601 string');
  return r;
}

/**
 * Build a record from a failed sweep point.
 *
 * @param {object} o
 * @param {string} o.effect        effect kind, e.g. "accum-echo"
 * @param {string} o.shader        shader name, e.g. "accum-echo"
 * @param {object} o.params        full parameter values at the failing point
 * @param {string} [o.paramSwept]   which parameter was being swept (null for whole-shader failures)
 * @param {string} o.check         which check caught it (see CHECKS)
 * @param {string} o.severity      how bad (see SEVERITIES)
 * @param {string} o.message       human sentence naming the failure
 * @param {object} [o.meta]        { runId, commit }
 */
export function failureFromSweep({ effect, shader, params = {}, paramSwept = null, check, severity, message, meta = {} }) {
  return validateFailureRecord({
    schema: schemaId('sweepFailure'),
    effect,
    shader,
    params,
    param_swept: paramSwept,
    check,
    severity,
    message,
    harness_run_id: meta.runId ?? 'unknown',
    harness_commit: meta.commit ?? 'unknown',
    timestamp: new Date().toISOString(),
  });
}

/** Serialize validated records as JSONL (browser-safe: returns text). */
export function toJsonl(records) {
  return records.map((r) => JSON.stringify(validateFailureRecord(r))).join('\n') + (records.length ? '\n' : '');
}

/** Parse + validate JSONL back into records. */
export function fromJsonl(text) {
  return text.split('\n').filter((l) => l.trim()).map((l, i) => {
    try {
      return validateFailureRecord(JSON.parse(l));
    } catch (e) {
      throw new Error(`[mlx:failure] line ${i + 1}: ${e.message}`);
    }
  });
}

export const CHECK_NAMES = CHECKS;
export const SEVERITY_NAMES = SEVERITIES;
