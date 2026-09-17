#!/usr/bin/env node
/**
 * predict_cost_tier — CI gate, MLX harness intelligence (backend hardening 6/6).
 *
 * The governor's cost tiers stop being hand-declared: a small regression
 * model (trained on the Mac Studio from measured GPU costs) predicts each
 * effect's tier from its shader SOURCE alone — static features, pure math,
 * no GPU, no MLX, so it runs in CI.
 *
 * What it does:
 *   1. Extracts static features from every effect's shader source with
 *      app/src/gl/mlx/extractFeatures.mjs (kc-feat/1 — the exact same
 *      extractor the Mac Studio training consumed, so train and predict
 *      can never drift apart).
 *   2. Scores each effect under the committed mlx_artifacts/cost_model.json
 *      (plain-JSON weights: intercept + Σ wᵢ·xᵢ, then tier boundaries).
 *   3. Compares the prediction against the declared tier in
 *      app/src/gl/mlx/declaredCostTiers.json and FAILS naming the effect,
 *      the predicted vs declared tier, and the score when they disagree.
 *      A "cheap"-declared effect that measures expensive cannot ship.
 *
 * THE HONEST BOUNDARY: the model only exists after Matt runs the Mac Studio
 * runbook (docs/MLX_HARNESS_RUNBOOK.md). If mlx_artifacts/cost_model.json is
 * absent, this check LOUD-SKIPS (exit 0, unmissable banner) — never fails
 * closed on missing artifacts.
 *
 * Wired into `npm run selfcheck`, which is what CI runs.
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractAllFeatures, linearScore, scoreToTier, FEATURE_EXTRACTOR_VERSION, FEATURE_NAMES } from '../src/gl/mlx/extractFeatures.mjs';
import { declaredTier, DECLARED_TIERS_SCHEMA } from '../src/gl/mlx/declaredCostTiers.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const MODEL_PATH = join(HERE, '..', '..', 'mlx_artifacts', 'cost_model.json');
const EXPECTED_SCHEMA = 'kc-cost-model/1';

export function skipBanner() {
  return [
    '',
    '╔══════════════════════════════════════════════════════════════════════╗',
    '║  predict_cost_tier: SKIPPED — no learned cost model committed yet     ║',
    '║                                                                      ║',
    '║  This check needs mlx_artifacts/cost_model.json, trained on the Mac  ║',
    '║  Studio from real GPU measurements (MLX = Apple Silicon only).      ║',
    '║  See docs/MLX_HARNESS_RUNBOOK.md §3. This is a SKIP, not a pass —   ║',
    '║  the cost-tier gate arms itself the day the model lands.            ║',
    '╚══════════════════════════════════════════════════════════════════════╝',
    '',
  ].join('\n');
}

function fail(msg) {
  console.error(`[predict-cost-tier] FAIL — ${msg}`);
  process.exit(1);
}

/** Top contributing features for a score (explainability on mismatch). */
function topContributors(rawFeatures, stdFeatures, weights) {
  return stdFeatures
    .map((x, i) => ({ name: FEATURE_NAMES[i], contrib: x * weights[i], raw: rawFeatures[i] }))
    .sort((a, b) => Math.abs(b.contrib) - Math.abs(a.contrib))
    .slice(0, 3)
    .map((c) => `${c.name}=${c.raw} (w·x=${c.contrib.toFixed(3)})`)
    .join(', ');
}

function main() {
  if (!existsSync(MODEL_PATH)) {
    console.log(skipBanner());
    process.exit(0);
  }

  let model;
  try {
    model = JSON.parse(readFileSync(MODEL_PATH, 'utf8'));
  } catch (e) {
    fail(`could not read cost_model.json at ${MODEL_PATH}: ${e.message}`);
  }

  if (model.schema !== EXPECTED_SCHEMA) {
    fail(`cost_model.json schema is "${model.schema}", expected "${EXPECTED_SCHEMA}"`);
  }
  if (model.feature_extractor !== FEATURE_EXTRACTOR_VERSION) {
    fail(
      `cost_model.json was trained with feature extractor "${model.feature_extractor}" but the repo ` +
      `extractor is "${FEATURE_EXTRACTOR_VERSION}" — re-train the model with the current extractor ` +
      `(docs/MLX_HARNESS_RUNBOOK.md §3), features must match exactly`,
    );
  }
  const spec = model.feature_spec || [];
  if (JSON.stringify(spec) !== JSON.stringify([...FEATURE_NAMES])) {
    fail(`cost_model.json feature_spec [${spec.join(', ')}] does not match the extractor's [${[...FEATURE_NAMES].join(', ')}]`);
  }
  if (!Array.isArray(model.weights) || !model.weights.every(Number.isFinite)) fail('weights must be an array of finite numbers');
  if (!Number.isFinite(model.intercept)) fail('intercept must be a finite number');
  if (!Array.isArray(model.tier_boundaries) || model.tier_boundaries.length !== 3 || !model.tier_boundaries.every(Number.isFinite)) {
    fail('tier_boundaries must be [b01, b12, b23]');
  }
  // Training standardises features (mean/std stored in the artifact) — CI
  // must apply the identical transform, or scores are meaningless.
  const fmean = model.feature_mean;
  const fstd = model.feature_std;
  if (!Array.isArray(fmean) || fmean.length !== FEATURE_NAMES.length || !fmean.every(Number.isFinite)) {
    fail('feature_mean must be an array of finite numbers matching the feature spec');
  }
  if (!Array.isArray(fstd) || fstd.length !== FEATURE_NAMES.length || !fstd.every((v) => Number.isFinite(v) && v !== 0)) {
    fail('feature_std must be an array of non-zero finite numbers matching the feature spec');
  }
  const standardise = (vec) => vec.map((x, i) => (x - fmean[i]) / fstd[i]);

  const features = extractAllFeatures();
  const mismatches = [];
  const rows = [];
  for (const [kind, vec] of features) {
    const std = standardise(vec);
    const score = linearScore(std, model);
    const predicted = scoreToTier(score, model.tier_boundaries);
    let declared;
    try {
      declared = declaredTier(kind).tier;
    } catch (e) {
      fail(e.message);
    }
    rows.push({ kind, score, predicted, declared });
    if (predicted !== declared) {
      mismatches.push({ kind, score, predicted, declared, why: topContributors(vec, std, model.weights) });
    }
  }

  for (const r of rows) {
    const ok = r.predicted === r.declared ? '✓' : '✗';
    console.log(`  ${ok} ${r.kind}: score=${r.score.toFixed(3)} predicted=tier ${r.predicted} declared=tier ${r.declared}`);
  }

  if (mismatches.length) {
    console.error('');
    console.error('[predict-cost-tier] FAIL — predicted tier disagrees with the declared tier:');
    for (const m of mismatches) {
      console.error(
        `  ✗ ${m.kind}: predicted tier ${m.predicted}, declared tier ${m.declared} ` +
        `(score ${m.score.toFixed(3)}). Biggest cost drivers: ${m.why}. ` +
        `Either the declaration is wrong (update ${DECLARED_TIERS_SCHEMA}) or the shader got heavier (re-measure).`,
      );
    }
    process.exit(1);
  }
  console.log(`[predict-cost-tier] OK — ${rows.length} effects: predicted tiers match declared tiers (model ${model.model || 'ridge'}, ${model.measurement_count ?? '?'} measurements)`);
}

main();
