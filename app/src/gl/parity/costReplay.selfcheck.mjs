// node src/gl/parity/costReplay.selfcheck.mjs — #1578 slice C:
// the governor-replay ship/kill judge. Pins the verdict arithmetic on
// synthetic worlds with known answers (a planted additive world MUST
// trigger the gate-0 kill; a planted priming win MUST score as a win),
// unit-pins the replay simulation, and structurally validates the
// committed real-dataset report. The real end-to-end judge run is
// exercised when the Studio dataset is reachable (KC_COST_DATASET).
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BUDGET_MS,
  additivityGate,
  calibrateMultiplier,
  decideVerdict,
  extractComponents,
  fitOLS,
  judge,
  pinballOne,
  simulateScene,
} from './costReplay.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const STUDIO = join(HERE, '..', '..', '..', '..', 'studio');

// ── unit pins: pinball + calibration law ────────────────────────────────
assert.ok(Math.abs(pinballOne(10, 8, 0.9) - 1.8) < 1e-9, 'under-prediction costs τ per ms');
assert.ok(Math.abs(pinballOne(8, 10, 0.9) - 0.2) < 1e-9, 'over-prediction costs 1−τ per ms');
assert.strictEqual(calibrateMultiplier([10, 10, 10], [10, 20, 30], 0.9), 3, 'smallest multiplier covering ≥90%');
assert.strictEqual(calibrateMultiplier([30, 30], [10, 20], 0.9), 1, 'never calibrates down');

// ── unit pins: OLS recovers a known line ────────────────────────────────
const line = fitOLS(
  [
    [1, 0],
    [1, 1],
    [1, 2],
    [1, 3],
  ],
  [2, 5, 8, 11],
);
assert.ok(Math.abs(line.predict([1, 4]) - 14) < 1e-6, 'OLS recovers 2 + 3x');

// ── unit pins: the replay simulation ────────────────────────────────────
// A 53.6 ms scene, unprimed: opens over budget, one renderScale cut after
// the 1.6 s sustain (48 frames at 30 fps), settles at 0.75 / high.
const simStatic = simulateScene(53.6, { scaleIdx: 0, qualityIdx: 0 });
assert.strictEqual(simStatic.opensOver, true);
assert.strictEqual(simStatic.hitchFrames, 48, 'first cut lands after SUSTAIN 1.6s × 30fps');
assert.strictEqual(simStatic.settledScale, 0.75);
assert.strictEqual(simStatic.settledQualityTier, 'high');
assert.strictEqual(simStatic.settledQuality, 0.5625);
// The same scene primed to {0.5, balanced}: never opens over budget, and
// the bounded restore settles it at the SAME state the reactive ladder
// reaches — the priming win is the opening, not the settled quality.
const simPrimed = simulateScene(53.6, { scaleIdx: 2, qualityIdx: 1 });
assert.strictEqual(simPrimed.opensOver, false);
assert.strictEqual(simPrimed.hitchFrames, 0);
assert.strictEqual(simPrimed.settledScale, 0.75);
assert.strictEqual(
  simPrimed.settledQuality,
  simStatic.settledQuality,
  'equal settled quality: the win is the first frames',
);
// A cheap scene never sheds.
const simCheap = simulateScene(20, { scaleIdx: 0, qualityIdx: 0 });
assert.deepStrictEqual(
  { o: simCheap.opensOver, h: simCheap.hitchFrames, q: simCheap.settledQuality },
  { o: false, h: 0, q: 1 },
);
assert.ok(BUDGET_MS > 33 && BUDGET_MS < 34, 'budget is the 30 fps frame');

// ── synthetic doc builder (components come from the real extractor) ────
function synthDoc({
  count = 48,
  particleCount = 150,
  mode = 'fibonacci',
  cast = 8,
  scaleMid = 1,
  fxDepth = 0,
  blendMode = 'normal',
  mirror = 'off',
}) {
  const enabledAssets = {};
  for (let i = 0; i < cast; i++) enabledAssets[`asset-${i}`] = true;
  const layers = [{ id: 'bg', type: 'content', effects: [] }];
  const kinds = ['grain', 'rgbSplit', 'blur', 'posterize'];
  for (let i = 0; i < fxDepth; i++)
    layers.push({ id: `fx${i}`, type: 'fx', effects: [{ kind: kinds[i % kinds.length] }] });
  return {
    layoutParams: {
      count,
      particleCount,
      mode,
      blendMode,
      mirror,
      scale: { x: [scaleMid, scaleMid], y: [scaleMid, scaleMid] },
    },
    enabledAssets,
    layers,
  };
}
function synthRow(id, docOpts, labelMs, bagCount) {
  const doc = synthDoc(docOpts);
  return {
    id,
    family: id.split('-', 1)[0],
    labelMs,
    doc,
    features: {
      system: 'fibonacci',
      bodies: 'mid',
      num: { count: bagCount ?? docOpts.count ?? 48 },
      mech: {},
      probe: {},
    },
    components: extractComponents(doc),
  };
}

// ── planted ADDITIVE world: gate 0 must fire, verdict must be KILL ──────
const additiveLabel = (c) =>
  20 +
  5 * Math.log2(Math.max(c.bodies, 1) / 48) +
  0.5 * (c.cast - 8) +
  2 * (c.scaleMid - 1) +
  1.5 * c.fxDepth +
  3 * c.blend +
  4 * c.mirror -
  10 * c.swarm;
const additiveRows = [];
{
  const specs = [
    { count: 12 },
    { count: 48 },
    { count: 160 },
    { count: 480 },
    { count: 160, cast: 4 },
    { count: 160, cast: 24 },
    { count: 160, scaleMid: 0.3 },
    { count: 160, scaleMid: 2.2 },
    { fxDepth: 1 },
    { fxDepth: 2 },
    { fxDepth: 3 },
    { fxDepth: 4 },
    { blendMode: 'screen' },
    { mirror: 'x' },
    { count: 480, fxDepth: 3 },
    { count: 160, scaleMid: 2.2, fxDepth: 2 },
    { mode: 'swarm', particleCount: 300 },
  ];
  specs.forEach((spec, i) => {
    const doc = synthDoc(spec);
    additiveRows.push({
      id: `grid-add-${i}`,
      family: 'grid',
      labelMs: +additiveLabel(extractComponents(doc)).toFixed(4),
      doc,
      features: { system: 'fibonacci', bodies: 'mid', num: { count: spec.count ?? 48 }, mech: {}, probe: {} },
      components: extractComponents(doc),
    });
  });
}
const gateAdd = additivityGate(additiveRows);
assert.strictEqual(
  gateAdd.additive,
  true,
  `planted additive world must read additive (R² ${gateAdd.r2}, median resid ${gateAdd.medianAbsRelResid})`,
);
assert.ok(gateAdd.r2 > 0.999, 'exact additive labels fit exactly');
const killVerdict = decideVerdict({
  gate0: gateAdd,
  legs: {
    overBudget: { pass: true },
    falseCheap: { pass: true, rate: 0 },
    pinball: { pass: true },
    device: { evidenced: false, pass: false },
  },
  killGain: false,
});
assert.strictEqual(killVerdict.verdict, 'KILL', 'gate 0 kills regardless of the replay legs');
assert.match(killVerdict.reasons[0], /gate 0/);

// ── planted PRIMING WIN: evidenced legs pass; verdict HOLDs only on the
//    missing device leg; with an evidenced passing device leg → SHIP ────
const winRows = [];
const winOof = new Map();
{
  // grid family: cost = count term + fx term + a count×fx INTERACTION
  // (the additive design has no product column, so gate 0 must read this
  // world as non-additive). parity family: cost driven by FX depth at
  // fixed count. A baseline fit on one family carries the wrong shape
  // into the other; the head's OOF predictions track the labels.
  for (const bodies of [48, 160, 480]) {
    for (const fx of [0, 1, 2, 3]) {
      const label = +(14 + 6 * Math.log2(bodies / 48) + 2 * fx + 6 * Math.log2(bodies / 48) * fx).toFixed(4);
      const row = synthRow(`grid-win-${bodies}-${fx}`, { count: bodies, fxDepth: fx }, label, bodies);
      winRows.push(row);
      winOof.set(row.id, +(label * 1.12).toFixed(4));
    }
  }
  for (const fx of [0, 1, 2, 3, 4]) {
    const label = +(12 + 7 * fx).toFixed(4);
    const row = synthRow(`parity-win-${fx}`, { count: 48, fxDepth: fx }, label, 48);
    winRows.push(row);
    winOof.set(row.id, +(label * 1.12).toFixed(4));
  }
}
const winResult = judge({ rows: winRows, headOof: winOof, tau: 0.9, datasetMeta: { renderer: 'synthetic-device' } });
assert.strictEqual(
  winResult.gate0.additive,
  false,
  `the win world's count×fx interaction must defeat the additive fit (R² ${winResult.gate0.r2}, median resid ${winResult.gate0.medianAbsRelResid})`,
);
assert.strictEqual(winResult.strategies.costHead.overBudgetScenes, 0, 'primed scenes never open over budget');
assert.ok(winResult.strategies.staticReactive.overBudgetScenes >= 3, 'unprimed scenes open over budget');
assert.strictEqual(winResult.legs.overBudget.pass, true, 'over-budget leg passes');
assert.strictEqual(winResult.legs.falseCheap.pass, true, 'false-cheap leg passes (head never under-predicts)');
assert.strictEqual(
  winResult.legs.pinball.pass,
  true,
  `pinball leg passes (head ${winResult.legs.pinball.headPinballMs} vs count ${winResult.legs.pinball.countOnlyPinballMs} / ridge ${winResult.legs.pinball.ridgePinballMs})`,
);
assert.strictEqual(winResult.legs.device.status, 'NOT EVIDENCED');
assert.strictEqual(winResult.verdict.verdict, 'HOLD', 'one device in evidence: the win cannot ship yet');
assert.ok(winResult.verdict.reasons.join(' ').includes('NOT EVIDENCED'), 'HOLD names the missing leg');
const shipVerdict = decideVerdict({
  gate0: winResult.gate0,
  legs: { ...winResult.legs, device: { evidenced: true, pass: true, status: 'EVIDENCED' } },
  killGain: false,
});
assert.strictEqual(shipVerdict.verdict, 'SHIP', 'all legs evidenced + passing → SHIP');
const gainKill = decideVerdict({
  gate0: { additive: false, r2: 0.5, medianAbsRelResid: 0.4 },
  legs: {
    overBudget: { pass: false },
    falseCheap: { pass: true, rate: 0 },
    pinball: { pass: false },
    device: { evidenced: false, pass: false },
  },
  killGain: true,
});
assert.strictEqual(gainKill.verdict, 'KILL', 'replay gain <10% kills');

// ── the committed real-dataset report: structural validation ────────────
const reportPath = join(STUDIO, 'cost-replay-report.json');
assert.ok(existsSync(reportPath), 'studio/cost-replay-report.json is committed with this slice');
const report = JSON.parse(readFileSync(reportPath, 'utf8'));
assert.strictEqual(report.kind, 'kc-cost-replay-report');
for (const key of ['staticReactive', 'staticTiers', 'countOnly', 'ridge', 'costHead']) {
  assert.ok(report.strategies[key], `strategy present: ${key}`);
  assert.strictEqual(report.strategies[key].perScene.length, report.datasetRows.scored, `${key} scored every scene`);
}
assert.ok(['SHIP', 'KILL', 'HOLD'].includes(report.verdict.verdict), 'verdict in the enum');
assert.ok(
  Array.isArray(report.verdict.reasons) &&
    report.verdict.reasons.length > 0 &&
    report.verdict.reasons.every((r) => typeof r === 'string' && r.length > 0),
  'verdict carries its reason strings',
);
assert.strictEqual(
  report.legs.device.status,
  'NOT EVIDENCED',
  'one device in evidence — the device leg cannot be evidenced by this report',
);
assert.strictEqual(typeof report.gate0Additivity.additive, 'boolean');

// ── real end-to-end run, when the Studio dataset is reachable ───────────
const datasetPath =
  process.env.KC_COST_DATASET ||
  '/home/hatch/workspace/goals/kinetic-curator-generative-art-instrument/hidden_files/cost-dataset-studio-2026-10-28.json';
if (existsSync(datasetPath) && existsSync(join(STUDIO, 'cost-head-report.json'))) {
  const ds = JSON.parse(readFileSync(datasetPath, 'utf8'));
  const headReport = JSON.parse(readFileSync(join(STUDIO, 'cost-head-report.json'), 'utf8'));
  const oof = new Map(headReport.rows.map((r) => [r.id, r.oofCalibratedMs]));
  const rows = ds.rows
    .filter((r) => r.status === 'measured')
    .map((r) => ({
      id: r.id,
      family: r.id.split('-', 1)[0],
      labelMs: r.labelMs,
      doc: r.doc,
      features: r.features,
      components: extractComponents(r.doc),
    }));
  const real = judge({ rows, headOof: oof, tau: 0.9, datasetMeta: ds.environment });
  assert.strictEqual(real.strategies.costHead.scenes, rows.length, 'real run scores every measured row');
  assert.ok(['SHIP', 'KILL', 'HOLD'].includes(real.verdict.verdict));
  assert.strictEqual(
    real.verdict.verdict,
    report.verdict.verdict,
    'committed report matches a fresh judge run on the same evidence',
  );
  console.log(
    `costReplay selfcheck: real-dataset run exercised (${rows.length} rows, verdict ${real.verdict.verdict})`,
  );
} else {
  console.log(
    'costReplay selfcheck: real dataset not reachable — end-to-end run SKIPPED (structural validation of the committed report stands)',
  );
}

console.log('costReplay selfcheck OK');
