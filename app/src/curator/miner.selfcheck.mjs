// miner.selfcheck.mjs — #1506 (Look Explorer E2): the miner, at smoke
// scale. The manifest is the standing gate, not a batch job: this
// suite runs a 24-sample run (twice, for determinism) plus targeted
// probes. Full batches belong to the run tool (scripts/exploreRun.mjs).
//
// Acceptance lines proven here (#1506):
//   - same (runSeed, samplerConfig) reproduces the batch EXACTLY
//     (fingerprints, stats, finalists, report numbers);
//   - finalists include the tray-invisible categories BY
//     CONSTRUCTION — quota proof in the run report;
//   - parity spot-check: 3 finalists re-baked + re-rendered match
//     their recorded bakes bit-for-bit at the bake level (items
//     fingerprint) and pixel-for-pixel at the still level (PNG hash);
//   - finalists' pairwise feature spread exceeds a same-size dice
//     tray's spread (the tray featurized as E1a measured it, finalists
//     as the recipes a crown applies);
//   - unbakeable samples are discarded with reasons, never repaired;
//   - the font-contingent text stamps are sampled, flagged, and their
//     ink accounted twice (font-less / with-fonts) — never excluded.
import assert from 'node:assert/strict';
import { ASSETS } from '../data/assets/index.js';
import { PALETTES, resolvePalette } from '../data/palettes.js';
import { normalizeLayoutParams } from '../data/layout-modes.js';
import { STUB_VOICES } from '../data/voices.js';
import {
  STARVED_CATEGORIES, FONT_CONTINGENT_IDS, CORNERS,
  sampleBatch, bakeSample, renderStats, renderStillPng, stillHash,
  featuresOfKeep, runMiner, formatMinerReport,
} from './miner.mjs';

const byId = new Map(ASSETS.map((a) => [a.id, a]));
const SMOKE = { runSeed: 0x1506, batchSize: 24, finalistCount: 6 };

// Keeps corpus: #1140-shaped records, built as literals the way E1a's
// keeps cut built them through the slice — the production ledger
// (kc:keeps:v1) is browser-local and absent here; runMiner consumes
// any record list in this shape, including a real ledger export.
const firstOf = (cat) => ASSETS.find((a) => a.category === cat).id;
const KEEPS = [
  { seed: 11, seedOffsets: {}, config: { layout: { mode: 'grid', count: 40 }, palette: { id: 'praystation' }, assets: [firstOf('geometric'), firstOf('stamps')] } },
  { seed: 12, seedOffsets: {}, config: { layout: { mode: 'eden', count: 60 }, palette: { id: 'hydra' }, assets: [firstOf('radial'), firstOf('linework')] } },
  { seed: 13, seedOffsets: {}, config: { layout: { mode: 'orbit', count: 30 }, palette: { id: 'kiln-columns' }, assets: [firstOf('organic'), firstOf('dots')] } },
];

// ---------------------------------------------------------------- sampler
const samples = sampleBatch(SMOKE);
assert.strictEqual(samples.length, 24, 'smoke batch size');
const layoutIds = new Set(STUB_VOICES.map((v) => v.id));
const paletteIds = new Set(PALETTES.map((p) => p.id));
for (const s of samples) {
  assert.ok(layoutIds.has(s.layoutId), `layout ${s.layoutId} is a dice mode`);
  assert.ok(paletteIds.has(s.paletteId), `palette ${s.paletteId} is in the catalog`);
  assert.ok(s.cast.length >= 2, 'casts deal at least 2');
  for (const id of s.cast) assert.ok(byId.has(id), `cast id ${id} is in the library`);
}
assert.deepStrictEqual(
  [...new Set(samples.map((s) => s.corner))].sort(),
  [...CORNERS].sort(),
  'the rotation visits the wilderness and every persona corner',
);
for (const cat of STARVED_CATEGORIES) {
  const anchored = samples.filter((s) => s.anchor === cat);
  assert.ok(anchored.length >= 1, `${cat} has anchored samples`);
  for (const s of anchored) {
    assert.ok(
      s.cast.some((id) => byId.get(id).category === cat),
      `anchored sample ${s.index} actually carries ${cat} (dealCast from its own pool)`,
    );
  }
}
const samplesAgain = sampleBatch(SMOKE);
assert.deepStrictEqual(
  samplesAgain.map((s) => [s.layoutId, s.paletteId, s.seed, s.cast.join(',')]),
  samples.map((s) => [s.layoutId, s.paletteId, s.seed, s.cast.join(',')]),
  'the sampler stream reproduces exactly',
);

// ---------------------------------------------------------------- discards
assert.deepStrictEqual(
  bakeSample({ cast: [], layoutParams: normalizeLayoutParams({ mode: 'grid' }), paletteId: 'hydra', seed: 1, seedOffsets: {} }),
  { ok: false, reason: 'empty-cast' },
  'an empty cast is discarded, not repaired',
);
const bogus = bakeSample({ cast: ['no_such_asset'], layoutParams: normalizeLayoutParams({ mode: 'grid' }), paletteId: 'hydra', seed: 1, seedOffsets: {} });
assert.strictEqual(bogus.ok, false, 'an unknown asset is discarded');
assert.ok(bogus.reason.startsWith('unknown-asset:'), 'the discard carries its reason');

// particle-mode bake branch (the sampler axis has no particle mode
// today; the bake contract still covers it — census drivers, both)
const swarm = bakeSample({
  cast: [firstOf('dots'), firstOf('linework')],
  layoutParams: normalizeLayoutParams({ mode: 'swarm', particleCount: 40 }),
  paletteId: 'hydra', seed: 7, seedOffsets: {},
});
assert.strictEqual(swarm.ok, true, 'a particle-mode sample bakes');
assert.strictEqual(swarm.bakePath, 'particles', 'particle modes take the bakeParticles driver');

// ------------------------------------------------------- font contingency
// One text stamp alone on a grid: it BAKES (it is never excluded),
// and its ink is honestly zero in the font-less raster and positive
// with system fonts — the two-figure accounting E1b's F2 demands.
const stampId = 'stamp_glyph_01';
assert.ok(FONT_CONTINGENT_IDS.has(stampId), 'the probe stamp is in the F2 set');
const stampSample = {
  cast: [stampId],
  layoutParams: normalizeLayoutParams({ mode: 'grid', count: 20 }),
  paletteId: 'hydra', seed: 3, seedOffsets: {},
};
const stampBake = bakeSample(stampSample);
assert.strictEqual(stampBake.ok, true, 'a font-contingent stamp bakes like any asset');
const stampStats = renderStats(stampBake.items, resolvePalette('hydra', null, []));
assert.strictEqual(stampStats.inkCoverage, 0, 'font-less, the text stamp reads blank (E1b F2)');
assert.ok(stampStats.inkCoverageWithFonts > 0, 'with system fonts, the stamp draws');

// ---------------------------------------------------------------- the run
const run = runMiner({ ...SMOKE, keeps: KEEPS });
const run2 = runMiner({ ...SMOKE, keeps: KEEPS });

assert.strictEqual(run.report.yield.sampled, 24, 'yield counts the batch');
assert.strictEqual(
  run.report.yield.baked + run.report.yield.discarded, 24,
  'every sample is baked or discarded — none vanish',
);
assert.deepStrictEqual(
  run2.finalists.map((f) => f.fingerprint),
  run.finalists.map((f) => f.fingerprint),
  'determinism: the same run reproduces the same finalist bakes',
);
assert.deepStrictEqual(
  run2.finalists.map((f) => f.sample.index),
  run.finalists.map((f) => f.sample.index),
  'determinism: the same finalists, in the same pick order',
);
assert.deepStrictEqual(run2.report.spread, run.report.spread, 'determinism: spread numbers reproduce');
assert.deepStrictEqual(run2.report.quota, run.report.quota, 'determinism: quota proof reproduces');
assert.deepStrictEqual(
  run2.finalists.map((f) => f.stats),
  run.finalists.map((f) => f.stats),
  'determinism: render statistics reproduce',
);

// quota proof — the tray-invisible families are IN, by construction
assert.strictEqual(run.quota.pass, true, 'quota proof passes at smoke scale');
for (const cat of STARVED_CATEGORIES) {
  assert.ok(run.quota.perCategory[cat].inFinalists >= 1, `${cat} reaches the finalists`);
  assert.ok(run.quota.perCategory[cat].inBatch >= 1, `${cat} is in the batch`);
}

// spread — mined finalists are measurably wider than the dice tray
assert.ok(
  run.report.spread.finalistsFeature > run.report.spread.trayFeature,
  `finalist spread ${run.report.spread.finalistsFeature} exceeds tray spread ${run.report.spread.trayFeature}`,
);

// candidate records — #1140 shape + provenance, crown facts absent
for (const f of run.finalists) {
  const rec = f.record;
  assert.strictEqual(rec.provenance.source, 'explorer', 'provenance names the explorer');
  assert.strictEqual(rec.provenance.run, run.runId, 'provenance names the run');
  assert.strictEqual(rec.provenance.corner, f.sample.corner, 'provenance names the corner');
  assert.strictEqual(rec.config.palette.id, f.sample.paletteId, 'record carries the palette');
  assert.deepStrictEqual(rec.config.assets, [...new Set(f.sample.cast)].sort(), 'record carries the cast, ledger order');
  assert.ok(!('timestamp' in rec) && !('keptAt' in rec) && !('context' in rec),
    'no crown-time facts are invented — absent stays absent');
}

// parity spot-check — 3 finalists re-baked + re-rendered
for (const f of run.finalists.slice(0, 3)) {
  const rebake = bakeSample(f.sample);
  assert.strictEqual(rebake.ok, true, `finalist sample ${f.sample.index} re-bakes`);
  assert.strictEqual(rebake.fingerprint, f.fingerprint, `finalist sample ${f.sample.index}: re-bake matches the recorded bake`);
  const palette = resolvePalette(f.sample.paletteId, null, []);
  const h1 = stillHash(renderStillPng(rebake.items, palette));
  const h2 = stillHash(renderStillPng(f.items, palette));
  assert.strictEqual(h1, h2, `finalist sample ${f.sample.index}: re-render matches the recorded still`);
}

// keeps features read tolerantly (legacy record without a cast)
assert.ok(featuresOfKeep({ seed: 1, config: { layout: { mode: 'flow' }, palette: { id: 'v01d' } } }),
  'a castless keep still featurizes — absent stays absent, nothing invented');
assert.strictEqual(featuresOfKeep({ seed: 1 }), null, 'a record with no config featurizes to null, not a guess');
assert.strictEqual(run.config.keepsCorpus, 3, 'the run reports the corpus it measured against');

console.log(formatMinerReport(run));
console.log('miner.selfcheck: OK (#1506 — determinism exact, quota by construction, spread beats the tray, parity holds, discards honest, font stamps accounted)');
