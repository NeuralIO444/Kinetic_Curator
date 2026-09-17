/**
 * Schema catalogue for the MLX harness-intelligence data exports
 * (backend hardening 6/6 — harness-side export, runs anywhere).
 *
 * These are the machine-readable records the Mac Studio consumes. The writers
 * in this directory validate against these schemas; docs/MLX_HARNESS_RUNBOOK.md
 * is the Mac Studio runbook that produces the committed artifacts.
 *
 * All schema ids are versioned (they end in "/1"). A schema bump means the consumer
 * and the writer must agree on the new version — never silently drift.
 */

export const SCHEMAS = Object.freeze({
  /** Per-(shader, params) GPU cost measurement (harness Layer 4 timings). */
  costMeasurement: {
    id: 'kc-cost-measurement/1',
    kind: 'jsonl',
    description:
      'One line per (shader, params) measurement: ms_mean / ms_p50 over samples ' +
      'from the harness GPU timer, plus resolution, renderer string, run id, commit.',
    fields: [
      'schema', 'shader', 'effect_kind', 'params', 'ms_mean', 'ms_p50',
      'samples', 'disjoint_discarded', 'resolution', 'dpr', 'gpu_renderer',
      'harness_run_id', 'harness_commit', 'timestamp',
    ],
  },
  /** A harness sweep failure — the raw material for guided fuzzing (item 12). */
  sweepFailure: {
    id: 'kc-sweep-failure/1',
    kind: 'jsonl',
    description:
      'One line per failed sweep point: which effect, which shader, which ' +
      'params, which check caught it (nan-scan, range, zero-noop, compile, ' +
      'link, uniform-audit, golden-diff), severity, and the message. ' +
      'The future sweep harness biases toward previously-broken regions.',
    fields: [
      'schema', 'effect', 'shader', 'params', 'param_swept', 'check',
      'severity', 'message', 'harness_run_id', 'harness_commit', 'timestamp',
    ],
    checks: ['compile', 'link', 'uniform-audit', 'nan-scan', 'range', 'zero-noop', 'golden-diff'],
    severities: ['crash', 'nan', 'out-of-range', 'zero-noop-fail', 'misrender'],
  },
  /** Manifest of harness test-render PNGs (the pixels MLX SigLIP embeds). */
  testRenderManifest: {
    id: 'kc-test-render-manifest/1',
    kind: 'json',
    description:
      'Manifest next to the harness test-render PNGs: per render the effect, ' +
      'shader, params, file name, sha256, and size. The Mac Studio embeds ' +
      'these PNGs to write mlx_artifacts/golden_embeddings.json.',
    fields: ['schema', 'generated_at', 'harness_commit', 'png_dir', 'renders'],
  },
  /** Committed golden embeddings — what "same artwork" means. */
  goldenEmbeddings: {
    id: 'kc-golden-embeddings/1',
    kind: 'json',
    description:
      'Per-effect SigLIP embeddings of the golden harness renders, committed ' +
      'to mlx_artifacts/. Carries the embedding model id + dims so a model ' +
      'change is caught loudly (re-embed required), never silently mixed.',
    fields: ['schema', 'model', 'generated_at', 'harness_commit', 'default_threshold', 'effects'],
  },
  /** Committed learned cost model — plain-JSON regression, no MLX needed. */
  costModel: {
    id: 'kc-cost-model/1',
    kind: 'json',
    description:
      'Ridge-regression weights over static shader-source features, trained ' +
      'on Mac Studio measurements. Evaluable with pure arithmetic, so CI ' +
      'predicts a new shader\'s tier without a GPU or MLX.',
    fields: [
      'schema', 'feature_extractor', 'feature_spec', 'model', 'weights',
      'intercept', 'feature_mean', 'feature_std', 'tier_boundaries',
      'trained_at', 'measurement_count', 'declared_tiers_schema',
    ],
  },
});

/** Schema id by key, e.g. schemaId('costMeasurement') -> 'kc-cost-measurement/1'. */
export function schemaId(key) {
  const s = SCHEMAS[key];
  if (!s) throw new Error(`[mlx] unknown export schema key "${key}"`);
  return s.id;
}

/** Plain-language summary of every schema (used by docs generators). */
export function describeSchemas() {
  return Object.fromEntries(
    Object.entries(SCHEMAS).map(([k, s]) => [k, { id: s.id, kind: s.kind, description: s.description }]),
  );
}
