// node src/state/showrunner.selfcheck.mjs
// Showrunner invariants: the governor degrades only the live proxy.
// - Showrunner/store-governor state never serializes into project JSON.
// - RENDER FINAL · UNCAPPED bypasses every cut (getRenderCaps(q, true) === FINAL_CAPS).
// - Per-tier budgets exist and step down in order high ≥ balanced ≥ performance.
// - Asset cost scores grow with complexity; pathological ingest warns but passes.

import assert from 'node:assert';
import { serializeProject, parseProject } from './projectDocument.js';
import { QUALITY_PRESETS, FINAL_CAPS, MAX_FILTER_REGION, getRenderCaps } from '../data/quality.js';
import { assetCostScore, COST_WARNING_THRESHOLD, ingestSvg } from '../assets/ingest.js';
import { getAssetCost } from '../assets/cost.js';

// 1. Showrunner state never leaks into the saved document.
const state = {
  seed: 1,
  paletteId: 'praystation',
  layoutParams: { mode: 'grid', count: 120 },
  enabledAssets: { a: true },
  quality: 'high',
  // Live-only governor state, as the store would hold it mid-performance:
  fps: 24,
  fxShedLevel: 2,
  assetThin: true,
  frameLock: true,
  perfTier1: true,
  slowRender: true,
  perfClampOverride: { count: 90, mirror: false },
  stageTimings: { kernel: 12.5 },
};
const doc = serializeProject(state);
for (const key of ['fps', 'fxShedLevel', 'assetThin', 'frameLock', 'perfTier1', 'slowRender', 'perfClampOverride', 'stageTimings']) {
  assert.ok(!(key in doc), `showrunner key leaked into project doc: ${key}`);
}
const round = parseProject(JSON.parse(JSON.stringify(doc)));
assert.ok(round.ok, 'project with governor state must still round-trip');

// 2. Uncapped final render bypasses every cut — same FINAL_CAPS at any live tier.
for (const q of ['high', 'balanced', 'performance']) {
  assert.deepStrictEqual(getRenderCaps(q, true), FINAL_CAPS, `uncapped ${q} must equal FINAL_CAPS`);
}
assert.notDeepStrictEqual(getRenderCaps('performance', false), FINAL_CAPS, 'live PERF must stay governed');

// 3. Budgets exist per tier and step down in order.
const budgetKeys = ['maxCount', 'maxParticles', 'maxFxLayers', 'maxFilterPrimitives', 'maxAssetsPerLayer', 'turbulenceOctaves'];
for (const k of budgetKeys) {
  const vals = ['high', 'balanced', 'performance'].map((t) => QUALITY_PRESETS[t][k]);
  assert.ok(vals.every(Number.isFinite), `${k} missing a tier budget`);
  assert.ok(vals[0] >= vals[1] && vals[1] >= vals[2], `${k} not ordered high≥balanced≥performance`);
}
// Filter regions clamp to the viewport at every tier — a clamp, not a tier.
assert.strictEqual(MAX_FILTER_REGION, 1.0);

// 4. Cost score: static, grows with complexity, warns (not blocks) on pathological.
const simple = '<svg><path d="M0 0h10"/></svg>';
const complex = `<svg>${'<path d="M0 0h10"/>'.repeat(700)}</svg>`;
assert.ok(assetCostScore(complex) > assetCostScore(simple), 'cost must grow with subpaths');
const heavy = ingestSvg(complex, { id: 'heavy' });
assert.ok(heavy.ok, 'pathological asset must still ingest');
assert.ok(heavy.asset.costWarning, 'pathological asset must warn');
assert.ok(heavy.asset.costScore > COST_WARNING_THRESHOLD);
const light = ingestSvg(simple, { id: 'light' });
assert.ok(light.ok);
assert.ok(!light.asset.costWarning, 'simple asset must not warn');
assert.strictEqual(getAssetCost(heavy.asset), heavy.asset.costScore, 'precomputed score is reused');
assert.strictEqual(getAssetCost({ id: 'x' }), 0, 'costless asset scores 0');

console.log('[selfcheck] showrunner invariants OK');
