// mlxExport.selfcheck.mjs — MLX harness-intelligence export modules (backend hardening 6/6).
//
// Node-only. Proves, without a GPU and without MLX:
//   - schemas.mjs: every schema id is versioned, describable
//   - exportCostMeasurements.mjs: fromTimerPoll math (mean/p50), validation
//     rejects bad records, JSONL round-trips
//   - exportSweepFailures.mjs: failureFromSweep builds valid records, bad
//     check/severity rejected, JSONL round-trips
//   - exportTestRenders.mjs: manifest validates, sha256 is a real 64-hex hash
//   - guidedFuzz.mjs: biasOrder ranks by failure density, suggestSamples
//     over-samples the hot region but keeps full-range coverage
//   - effectSources + declaredCostTiers: the two tables cover each other
//     exactly (assertSourcesCoverDeclared)
//   - extractFeatures.mjs: 7 features in FEATURE_NAMES order, every builtin
//     costs 1 pass (#308: blur is gone), EFFECT_FS shaders share source features
import assert from 'node:assert';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { schemaId, describeSchemas, SCHEMAS } from './schemas.mjs';
import {
  validateCostRecord, fromTimerPoll, toJsonl as costToJsonl, fromJsonl as costFromJsonl,
} from './exportCostMeasurements.mjs';
import {
  validateFailureRecord, failureFromSweep, toJsonl as failToJsonl, fromJsonl as failFromJsonl,
} from './exportSweepFailures.mjs';
import { renderEntry, validateManifest, writeTestRenderManifest } from './exportTestRenders.mjs';
import { parseFailureLog, failureDensity, biasOrder, suggestSamples } from './guidedFuzz.mjs';
import { effectSources, assertSourcesCoverDeclared } from './effectSources.mjs';
import { declaredKinds, declaredTier } from './declaredCostTiers.mjs';
import {
  FEATURE_EXTRACTOR_VERSION, FEATURE_NAMES, extractFeaturesFor, extractAllFeatures,
  linearScore, scoreToTier,
} from './extractFeatures.mjs';

// 1. schemas ---------------------------------------------------------------
assert.ok(schemaId('costMeasurement').endsWith('/1'), 'cost schema versioned');
assert.ok(schemaId('sweepFailure').endsWith('/1'), 'failure schema versioned');
assert.ok(schemaId('testRenderManifest').endsWith('/1'), 'manifest schema versioned');
assert.ok(schemaId('goldenEmbeddings').endsWith('/1'), 'golden schema versioned');
assert.ok(schemaId('costModel').endsWith('/1'), 'model schema versioned');
assert.ok(Object.keys(describeSchemas()).length === Object.keys(SCHEMAS).length, 'describable');

// 2. cost measurements ------------------------------------------------------
const rec = fromTimerPoll({
  shader: 'accum-echo',
  effectKind: 'accum-echo',
  params: { echoes: 3 },
  timings: new Map([['a', 1], ['b', 2], ['c', 3], ['d', 4]]),
  label: 'accum-echo',
  meta: { runId: 'run-1', commit: 'abc123', resolution: { w: 320, h: 200 }, dpr: 1, gpuRenderer: 'swiftshader' },
});
assert.equal(rec.ms_mean, 2.5, 'mean of [1,2,3,4] is 2.5');
assert.equal(rec.ms_p50, 3, 'p50 of [1,2,3,4] is 3');
assert.equal(rec.samples, 4);
const back = costFromJsonl(costToJsonl([rec]));
assert.equal(back.length, 1, 'cost JSONL round-trips');
assert.equal(back[0].shader, 'accum-echo');

assert.throws(() => validateCostRecord({ ...rec, ms_mean: -1 }), /ms_mean/, 'negative ms rejected');
assert.throws(() => validateCostRecord({ ...rec, samples: 0 }), /samples/, 'zero samples rejected');
assert.throws(
  () => fromTimerPoll({ shader: 'x', timings: new Map(), meta: {} }),
  /empty map/, 'empty timer map throws (disjoint/unsupported)',
);

// 3. sweep failures ----------------------------------------------------------
const f = failureFromSweep({
  effect: 'accum-echo', shader: 'accum-echo',
  params: { echoes: 4, echoWidth: 0.9 }, paramSwept: 'echoes',
  check: 'nan-scan', severity: 'nan',
  message: 'NaN pixels at echoes=4, echoWidth=0.9 (flag view nan)',
  meta: { runId: 'run-1', commit: 'abc123' },
});
assert.equal(f.schema, schemaId('sweepFailure'));
assert.deepEqual(failFromJsonl(failToJsonl([f]))[0].params, f.params, 'failure JSONL round-trips');
assert.throws(() => failureFromSweep({ ...f, check: 'vibes' }), /check/, 'unknown check rejected');
assert.throws(() => failureFromSweep({ ...f, severity: 'mild' }), /severity/, 'unknown severity rejected');
assert.throws(() => failureFromSweep({ ...f, message: '' }), /message/, 'empty message rejected');

// 4. test-render manifest ----------------------------------------------------
const dir = mkdtempSync(join(tmpdir(), 'mlx-renders-'));
const pngPath = join(dir, 'accum-echo.png');
// Minimal valid PNG (1x1). The manifest hashes bytes, it doesn't decode them.
writeFileSync(pngPath, Buffer.from(
  '89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000c4944415478' +
  '9c626001000000ffff03000006000574365e0000000049454e44ae426082', 'hex'));
const entry = renderEntry({ effect: 'accum-echo', shader: 'accum-echo', params: { echoes: 2 }, pngPath, pngDir: dir });
assert.ok(/^[0-9a-f]{64}$/.test(entry.sha256), 'sha256 is 64 hex chars');
assert.equal(entry.png, 'accum-echo.png');
const mOut = join(dir, 'manifest.json');
const wrote = writeTestRenderManifest({ pngDir: dir, renders: [entry], outPath: mOut, commit: 'abc123' });
assert.equal(wrote.count, 1);
const mBack = validateManifest(JSON.parse(readFileSync(mOut, 'utf8')));
assert.equal(mBack.renders[0].sha256, entry.sha256, 'manifest round-trips the hash');
assert.throws(() => validateManifest({ ...mBack, renders: [] }), /renders/, 'empty renders rejected');

// 5. guided fuzzing -----------------------------------------------------------
const hist = failToJsonl([
  failureFromSweep({ effect: 'accum-echo', shader: 'accum-echo', params: { echoes: 4 }, paramSwept: 'echoes', check: 'nan-scan', severity: 'nan', message: 'NaN at 4' }),
  failureFromSweep({ effect: 'accum-echo', shader: 'accum-echo', params: { echoes: 5 }, paramSwept: 'echoes', check: 'nan-scan', severity: 'nan', message: 'NaN at 5' }),
  failureFromSweep({ effect: 'grain', shader: 'effect', params: { amount: 0.99 }, paramSwept: 'amount', check: 'range', severity: 'out-of-range', message: 'overbright' }),
]);
const parsed = parseFailureLog(hist);
assert.equal(parsed.length, 3, 'failure log parses');
const density = failureDensity(parsed);
assert.ok(density.has('accum-echo::echoes'), 'density keyed by effect::param');
const bias = biasOrder(parsed);
assert.equal(bias[0].param, 'echoes', 'most-failed param ranks first');
assert.equal(bias[0].failures, 2);
assert.deepEqual([bias[0].hot.min, bias[0].hot.max], [4, 5], 'hot region = min..max of failed values');

const samples = suggestSamples({ min: 0, max: 8, count: 5 }, bias[0]);
assert.equal(samples.length, 5, 'requested sample count');
// Hot region [4,5] over-sampled (ceil(5/2)=3 samples), full range still covered.
assert.ok(samples.filter((v) => v >= 4 && v <= 5).length >= 3, `hot region over-sampled: ${samples}`);
assert.ok(samples[0] === 0 && samples[samples.length - 1] === 8, `full range still covered: ${samples}`);
const uniform = suggestSamples({ min: 0, max: 1, count: 3 }, null);
assert.deepEqual(uniform, [0, 0.5, 1], 'no history -> uniform spread');

// 6. sources <-> declared tiers ------------------------------------------------
const covered = assertSourcesCoverDeclared();
assert.ok(covered.kinds >= 20, `sources cover declared tiers (${covered.kinds} kinds)`);
assert.equal(declaredTier('composite').tier, 0, 'composite is structural');
assert.equal(declaredTier('invert').tier, 3, 'invert is cosmetic');
assert.ok(declaredKinds().length === effectSources().size, 'tables agree exactly');

// 7. feature extraction ---------------------------------------------------------
assert.equal(FEATURE_EXTRACTOR_VERSION, 'kc-feat/1');
assert.equal(FEATURE_NAMES.length, 7, '7 documented features');
const feats = extractAllFeatures();
assert.ok(feats.size >= 20, 'features for every effect');
const invert = feats.get('invert');
// (#308: blur is gone — the builtin EFFECT_FS feature-parity probe now uses
// grain, the other surviving single-pass builtin with a mapped param.)
const grain = feats.get('grain');
assert.equal(invert.length, 7, 'vector length matches FEATURE_NAMES');
assert.deepEqual(invert.slice(0, 5), grain.slice(0, 5), 'builtin effects share EFFECT_FS -> same source features');
assert.ok(grain[5] === 1 && invert[5] === 1, 'pass_count: grain=1, invert=1');
assert.ok(invert[6] === 0 && grain[6] === 1, 'param_count: invert=0, grain=1');
const echo = feats.get('accum-echo');
assert.ok(echo[1] >= 4, `accum-echo has >=4 texture reads (multi-tap), got ${echo[1]}`);

// scoring math: weights align with features, boundaries map score -> tier
const fakeModel = { weights: [0, 0, 0, 0, 0, 1, 0], intercept: 0 };
assert.equal(linearScore(invert, fakeModel), 1, 'linear score = intercept + w.x');
assert.equal(linearScore(grain, fakeModel), 1);
assert.equal(scoreToTier(0.5, [1, 2, 3]), 0);
assert.equal(scoreToTier(2.5, [1, 2, 3]), 2);
assert.equal(scoreToTier(9, [1, 2, 3]), 3);
assert.throws(() => linearScore([1, 2], { weights: [1], intercept: 0 }), /weights/, 'weight/feature mismatch throws');

console.log(`mlxExport.selfcheck OK — ${covered.kinds} effects, schemas + writers + fuzzing + features all green`);
