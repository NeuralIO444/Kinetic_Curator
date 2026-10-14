// prospecting.selfcheck.mjs — #1508 (Look Explorer E4): prospecting
// corners, Davis-steered spread, the Queen's evidence, yield accrual.
//
// Acceptance lines proven here (#1508):
//   - a named-corner run's finalists are provably profile-biased:
//     every corner sample wears the profile's palette, its forced
//     categoricals hold, and the finalists' feature-space centroid
//     sits inside the profile's declared ranges — for all 10 profiles
//     (stock judged against the envelope of its two modes);
//   - Davis steers spread: wildnessForDavis drives the dealing —
//     the default (silent) stream is the SEEDLING stream exactly,
//     UGLY and FLOW deal measurably different casts;
//   - LOIS keeps/passes on mined renders appear in the run's verdict
//     ledger with provenance (and on the finalist records at bake
//     time — E3's named gap), distinguishable from dice-scorer
//     judgments (loisJudge suite proves the row-level distinction);
//   - yield accrues by corner across runs + ledgers, and a corner
//     with finalists across ≥2 runs and zero crowns is flagged for
//     retirement, not widened;
//   - the Queen's evidence includes mined candidates: her M1 bias,
//     computed by queenLean's own functions over the mined pool,
//     leans toward a keeps-like finalist and stays silent below
//     MIN_KEEPS keeps, as ever.
import assert from 'node:assert/strict';
import {
  CORNERS, sampleBatch, runMiner, featuresOf, selectFinalists,
} from './miner.mjs';
import { getRenderProfile, RENDER_PROFILE_IDS } from './renderProfiles.js';
import {
  cornerDefinition, declaredNumRanges, declaredScaleBuckets, featureCentroid, centroidViolations,
  yieldAccrual, formatYieldReport,
} from './prospecting.mjs';
// The Queen's evidence is operator tooling (scripts/queenEvidence.mjs):
// rule 10 confines her mechanics to one host in the app graph, so no
// src module computes it. Suites are outside that graph; this one
// proves the tool's math against her own constants.
import { queenEvidence } from '../../scripts/queenEvidence.mjs';
import { M1_BIAS, MIN_KEEPS } from './queenLean.mjs';
import { ledgerRow } from './tasteLedger.js';

// ── corners as data ─────────────────────────────────────────────────
assert.strictEqual(CORNERS.length, 11, 'the rotation is the wilderness + 10 profiles');
assert.deepStrictEqual(cornerDefinition('wilderness'), {
  id: 'wilderness', kind: 'wilderness', word: 'wilderness',
  paletteId: null, biases: null, forces: null, modes: null,
}, 'the wilderness corner declares nothing — that is what makes it the wilderness');
for (const id of RENDER_PROFILE_IDS) {
  const def = cornerDefinition(id);
  const src = getRenderProfile(id);
  assert.strictEqual(def.paletteId, src.paletteId, `${id}: the corner wears the profile's palette`);
  if (src.modes) {
    assert.deepStrictEqual(def.modes, src.modes, `${id}: modes consumed as data`);
  } else {
    assert.deepStrictEqual(def.biases, src.biases, `${id}: biases consumed as data, never edited`);
    assert.deepStrictEqual(def.forces, src.forces, `${id}: forces consumed as data`);
  }
}
assert.strictEqual(cornerDefinition('nope'), null, 'an unknown corner has no definition');
assert.strictEqual(declaredNumRanges('wilderness'), null, 'the wilderness declares no ranges');

// ── the centroid proof, per profile (sampler + selection level) ────
// Features need no bake: the property is the sampler's (every dealt
// candidate is rolled inside the profile's ranges, so ANY selection's
// centroid is in the box); the end-to-end run below proves the wiring
// on real bakes.
for (const id of RENDER_PROFILE_IDS) {
  const samples = sampleBatch({ runSeed: 0x1508, batchSize: 44, corner: id });
  assert.ok(samples.every((s) => s.corner === id), `${id}: an aimed run deals only its corner`);
  assert.ok(samples.every((s) => s.paletteId === getRenderProfile(id).paletteId),
    `${id}: every sample wears the profile palette`);
  const feats = samples.map((s) => featuresOf({
    layoutParams: s.layoutParams, paletteId: s.paletteId, cast: s.cast,
  }));
  const ranges = declaredNumRanges(id);
  assert.ok(!('scaleMid' in ranges),
    `${id}: no declared range over scaleMid — the substrate's dead axis (see prospecting.mjs)`);
  assert.deepStrictEqual(centroidViolations(featureCentroid(feats), ranges), [],
    `${id}: batch centroid inside the declared ranges`);
  const buckets = declaredScaleBuckets(id);
  assert.ok(buckets && buckets.length >= 1, `${id}: scale buckets declared`);
  for (const f of feats) {
    assert.ok(buckets.includes(f.scale),
      `${id}: scale bucket ${f.scale} is one its declared ranges can land in (${buckets})`);
  }
  const { finalists } = selectFinalists(
    samples.map((sample, i) => ({ sample, features: feats[i] })), [], { finalistCount: 6 },
  );
  assert.deepStrictEqual(
    centroidViolations(featureCentroid(finalists.map((f) => f.features)), ranges), [],
    `${id}: finalist centroid inside the declared ranges`,
  );
  // forced categoricals hold on every sample (dual-mode stock rolls
  // its forces per mode — judged per-sample against its own modes)
  const prof = getRenderProfile(id);
  const forceSets = prof.modes ? Object.values(prof.modes).map((m) => m.forces) : [prof.forces];
  for (const f of feats) {
    assert.ok(forceSets.some((forces) => (
      (forces.symmetry === undefined || f.symmetry === forces.symmetry)
      && (forces.accumulation === undefined || f.accum === forces.accumulation)
      && (forces.behave === undefined || f.behave === forces.behave)
    )), `${id}: a sample's categoricals match one of its declared force sets`);
  }
}

// the wilderness stays uniform: no profile palette, varied palettes
const wild = sampleBatch({ runSeed: 0x1508, batchSize: 44, corner: 'wilderness' });
assert.ok(wild.every((s) => s.corner === 'wilderness'), 'an aimed wilderness run deals only wilderness');
assert.ok(new Set(wild.map((s) => s.paletteId)).size > 4, 'the wilderness wears the whole catalog, not a palette');

// ── Davis steers spread ─────────────────────────────────────────────
const castKey = (list) => list.map((s) => [s.layoutId, s.seed, s.cast.join(',')]);
const silent = sampleBatch({ runSeed: 0x1508, batchSize: 33 });
const seedling = sampleBatch({ runSeed: 0x1508, batchSize: 33, davisCode: 'SEEDLING' });
assert.deepStrictEqual(castKey(seedling), castKey(silent),
  'Davis silent IS the seedling stream (wildness 0.5) — the E2 default is unchanged');
const ugly = sampleBatch({ runSeed: 0x1508, batchSize: 33, davisCode: 'UGLY' });
const flow = sampleBatch({ runSeed: 0x1508, batchSize: 33, davisCode: 'FLOW' });
assert.notDeepStrictEqual(castKey(ugly), castKey(flow), 'UGLY and FLOW deal different casts');
const spreadOf = (list) => {
  const sizes = list.map((s) => s.cast.length);
  const mean = sizes.reduce((a, b) => a + b, 0) / sizes.length;
  return Math.sqrt(sizes.reduce((a, b) => a + (b - mean) ** 2, 0) / sizes.length);
};
assert.ok(spreadOf(ugly) >= spreadOf(flow), 'UGLY cast sizes spread at least as wide as FLOW');
assert.throws(() => sampleBatch({ corner: 'nope' }), /unknown corner/, 'an unknown corner is refused, not improvised');

// ── end-to-end: a named-corner run, judged ──────────────────────────
const run = runMiner({ runSeed: 0x1508, batchSize: 33, finalistCount: 6, corner: 'haeckel' });
assert.strictEqual(run.runId, 'xpl-1508-33-6-haeckel', 'an aimed run names its corner in its id');
assert.strictEqual(run.config.corner, 'haeckel', 'the config records the corner');
assert.strictEqual(run.config.wildness, 0.5, 'Davis silent unless a state is handed in');
for (const f of run.finalists) {
  assert.strictEqual(f.sample.corner, 'haeckel', 'finalists come from the named corner');
  assert.strictEqual(f.record.provenance.corner, 'haeckel', 'provenance names the corner');
  assert.ok(['keep', 'pass'].includes(f.loisVerdict?.verdict), 'every finalist carries a LOIS verdict');
  assert.strictEqual(f.loisVerdict.judge, 'lois-render', 'the verdict names its judge');
  assert.deepStrictEqual(f.record.loisVerdict, f.loisVerdict, 'the record carries the verdict (E3’s gap, closed)');
  assert.strictEqual(f.record.statsProvenance.fingerprint, f.fingerprint,
    'the record carries statsProvenance bound to its bake');
  assert.strictEqual(f.statsProvenance, f.loisVerdict.statsProvenance, 'one stats provenance, two doors');
}
assert.deepStrictEqual(
  centroidViolations(
    featureCentroid(run.finalists.map((f) => f.features)), declaredNumRanges('haeckel'),
  ),
  [],
  'the real run’s finalist centroid sits inside Haeckel’s declared ranges',
);
assert.strictEqual(run.report.lois.judged, 6, 'the report counts the judged');
assert.strictEqual(run.report.lois.keeps + run.report.lois.passes, 6, 'keeps + passes = judged');
assert.strictEqual(run.verdicts.length, 6, 'one verdict-ledger row per finalist');
for (const v of run.verdicts) {
  assert.strictEqual(v.judge, 'lois-render-v1', 'verdict rows are judge-marked');
  assert.strictEqual(v.provenance.corner, 'haeckel', 'verdict rows carry provenance');
  assert.strictEqual(v.run, run.runId, 'verdict rows name the run');
}
const runAgain = runMiner({ runSeed: 0x1508, batchSize: 33, finalistCount: 6, corner: 'haeckel' });
assert.deepStrictEqual(runAgain.finalists.map((f) => f.sample.index), run.finalists.map((f) => f.sample.index),
  'determinism: the aimed run reproduces its finalists');
assert.deepStrictEqual(runAgain.finalists.map((f) => f.loisVerdict), run.finalists.map((f) => f.loisVerdict),
  'determinism: the verdicts reproduce with the bakes');

// ── the Queen's evidence ────────────────────────────────────────────
const keepLayout = {
  mode: 'grid', count: 100, scale: [1, 1.5], rotate: [0, 90], alpha: [60, 90],
  jitter: 10, density: 80, zTiers: 3, noiseFreq: 0.005, noiseSpeed: 0.5,
  displacement: 20, particleCount: 100, swarmCohesion: 1, gravityWells: 1,
  damping: 0.95, wind: 0.5, flap: 0.3, breath: 0.3, lifeDrift: 0.4,
};
const KEEPS8 = Array.from({ length: MIN_KEEPS }, (_, i) => ({
  seed: 100 + i,
  config: { layout: { ...keepLayout }, palette: { id: 'hydra' }, assets: [] },
}));
const ev = queenEvidence(KEEPS8, [
  { layoutParams: { ...keepLayout }, corner: 'haeckel', index: 0 },
  {
    layoutParams: {
      ...keepLayout, count: 590, density: 5, alpha: [5, 15], jitter: 95,
      noiseSpeed: 2.0, displacement: 140, swarmCohesion: 3.9, gravityWells: 2.9,
    },
    corner: 'reas', index: 1,
  },
]);
assert.strictEqual(ev.silent, false, 'with 8 keeps she weighs the pool');
assert.strictEqual(ev.leaning[0].bias, M1_BIAS, 'a finalist at the kept centroid earns her M1 bias');
assert.strictEqual(ev.leaning[1].bias, 0, 'a finalist far from kept taste earns nothing — she never demotes');
assert.strictEqual(ev.leaningByCorner.haeckel, 1, 'her leanings tally by corner');
const evSilent = queenEvidence(KEEPS8.slice(0, 3), [{ layoutParams: { ...keepLayout }, corner: 'haeckel', index: 0 }]);
assert.strictEqual(evSilent.silent, true, 'below MIN_KEEPS keeps she is silent, as ever');
assert.strictEqual(evSilent.leaning[0].bias, 0, 'silence means zero bias, not a smaller one');

// ── yield accrual ───────────────────────────────────────────────────
const davisRun = runMiner({ runSeed: 0x1509, batchSize: 22, finalistCount: 4, corner: 'davis' });
const asSource = (r) => ({
  runId: r.runId,
  candidates: r.baked.map((b) => ({ corner: b.sample.corner })),
  finalists: r.finalists.map((f) => f.record),
});
const TS = '2026-10-14T19:00:00.000Z';
const crownRow = ledgerRow({ ...run.finalists[0].record, timestamp: TS }, 'selfcheck');
const passRow = ledgerRow({ ...davisRun.finalists[0].record, timestamp: TS }, 'selfcheck');
const handRow = ledgerRow({
  seed: 7, timestamp: TS,
  config: { layout: { mode: 'grid' }, palette: { id: 'hydra' }, assets: [] },
}, 'selfcheck');
assert.ok(crownRow?.provenance, 'a crowned mined keep’s ledger row carries provenance (E3 wiring)');
assert.ok(!handRow?.provenance, 'a hand keep carries no provenance — and must not accrue to a corner');

const accrual = yieldAccrual({
  runs: [asSource(run), asSource(davisRun)],
  ledgers: { keeps: [crownRow], passes: [passRow, handRow] },
});
const byId = Object.fromEntries(accrual.corners.map((r) => [r.corner, r]));
assert.strictEqual(byId.haeckel.crowns, 1, 'the haeckel crown accrues to haeckel');
assert.strictEqual(byId.haeckel.finalists, 6, 'haeckel finalists accrue');
assert.strictEqual(byId.haeckel.crownRate, +(1 / 6).toFixed(4), 'crown rate = crowns over finalists');
assert.strictEqual(byId.davis.humanPasses, 1, 'the human pass on a davis render accrues to davis');
assert.strictEqual(byId.davis.crowns, 0, 'davis was passed, not crowned');
assert.strictEqual(byId.haeckel.retire, false, 'a crowned corner is never flagged');
assert.strictEqual(accrual.totals.crowns, 1, 'the hand keep did not leak into corner crowns');
assert.strictEqual(
  byId.haeckel.loisKeeps + byId.haeckel.loisPasses, 6,
  'LOIS keeps/passes accrue from the run’s verdicts',
);

// retirement: finalists across ≥2 runs, zero crowns → flagged
const fakeFinalist = (corner) => ({
  provenance: { source: 'explorer', run: 'x', corner },
  loisVerdict: { verdict: 'pass' },
});
const accrual2 = yieldAccrual({
  runs: [
    { runId: 'r1', candidates: [{ corner: 'mohr' }], finalists: [fakeFinalist('mohr')] },
    { runId: 'r2', candidates: [{ corner: 'mohr' }], finalists: [fakeFinalist('mohr'), fakeFinalist('mohr')] },
  ],
  ledgers: { keeps: [], passes: [] },
});
const mohr = accrual2.corners.find((r) => r.corner === 'mohr');
assert.strictEqual(mohr.retire, true, 'two runs of finalists, zero crowns: flagged for retirement');
assert.strictEqual(accrual2.corners.find((r) => r.corner === 'reas').retire, false,
  'a corner with no finalists is not flagged — no evidence, no flag');
const text = formatYieldReport(accrual2);
assert.ok(text.includes('RETIREMENT FLAGS'), 'the report carries the flags section');
assert.ok(text.includes('mohr'), 'the flag names the corner');
assert.ok(text.includes('NOT widened'), 'the flag says what does not happen next');

console.log('prospecting.selfcheck: OK (#1508 — centroid inside declared ranges ×10 profiles, Davis steers the stream, verdicts on records + ledger rows, the Queen weighs the mined pool, yield accrues and flags retirement)');
