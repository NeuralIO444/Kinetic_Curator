#!/usr/bin/env node
/**
 * costJudge.selfcheck — the replay judge's pure logic (#1578).
 *
 * Pins: the shared split (FNV-1a folds — the same vectors the Python
 * trainer's selfcheck pins, so the two implementations cannot drift), the
 * additivity screen on hand-computed ladder fixtures, the baseline fits,
 * the replay scoring on hand-computed scenes, the verdict math on
 * synthetic scoreboards, the artifact round-trip through the REAL runtime
 * evaluator (validateCostModel + predictMs), and runJudge end-to-end on
 * fabricated (but schema-valid) datasets.
 */
import assert from 'node:assert/strict';
import {
  fnv1a, assignSplits, cellOf, additivityScreen, additivityByDevice,
  solveLinear, fitCountOnly, fitRidge, rubricFor, pinballLoss,
  scoreContender, computeVerdict, runJudge, deviceKeyOf,
} from './costJudge.mjs';
import { validateDataset, LABEL_DEFINITION } from './costDataset.mjs';
import { validateCostModel, predictMs } from '../../hooks/costHead.mjs';

/* ── FNV-1a pins (trainer mirror: studio/train_cost_head_selfcheck.py) ── */
assert.equal(fnv1a(''), 2166136261);
assert.equal(fnv1a('grid-base'), 1382191041);
assert.equal(fnv1a('grid-heavy-all'), 2602625481);
assert.equal(fnv1a('dev-b|x'), 2828046335);
assert.equal(fnv1a('dev-a|x'), 428785218);

/* ── the split: deterministic, grouped, with honest fallbacks ── */
const IDS22 = [
  'parity-a', 'parity-b', 'grid-base', 'grid-count-12', 'grid-count-160', 'grid-count-480',
  'grid-cast-4', 'grid-cast-24', 'grid-scale-small', 'grid-scale-large',
  'grid-fx-1', 'grid-fx-2', 'grid-fx-3', 'grid-fx-4', 'grid-blend-screen', 'grid-mirror-x',
  'grid-swarm-150', 'grid-swarm-500', 'grid-heavy-count-fx', 'grid-heavy-scale-fx',
  'grid-heavy-count-scale', 'grid-heavy-all',
];
const split = assignSplits(IDS22, ['dev-a|x', 'dev-b|x']);
assert.deepEqual([...split.heldRecipes].sort(), [
  'grid-count-12', 'grid-heavy-count-fx', 'grid-heavy-count-scale', 'grid-mirror-x', 'parity-a',
]);
assert.deepEqual([...split.heldDevices].sort(), ['dev-b|x']); // fold 0 outright
assert.equal(split.recipeLeg, true);
assert.equal(split.deviceLeg, true);
// every (recipe, device) lands in exactly one cell; test = held x held
assert.equal(cellOf(split, 'grid-count-12', 'dev-b|x'), 'test');
assert.equal(cellOf(split, 'grid-count-12', 'dev-a|x'), 'cross');
assert.equal(cellOf(split, 'grid-base', 'dev-b|x'), 'cross');
assert.equal(cellOf(split, 'grid-base', 'dev-a|x'), 'train');
// single device: no unseen-device leg, said out loud
const solo = assignSplits(IDS22, ['dev-a|x']);
assert.equal(solo.deviceLeg, false);
assert.equal(solo.heldDevices.size, 0);
// determinism: same inputs, same split
const again = assignSplits(IDS22, ['dev-a|x', 'dev-b|x']);
assert.deepEqual([...again.heldRecipes].sort(), [...split.heldRecipes].sort());

/* ── additivity screen: hand-computed ladder ── */
const LADDER = {
  'grid-base': 10, 'grid-count-160': 22, 'grid-count-480': 46, 'grid-scale-large': 26,
  'grid-cast-24': 30, 'grid-fx-1': 14, 'grid-fx-2': 19, 'grid-fx-3': 27, 'grid-fx-4': 34,
  // additive predictions: count-fx 63, scale-fx 35, count-scale 62, all 94
  'grid-heavy-count-fx': 84, // boundary: |63-84|/84 = 0.25 exactly -> still additive
  'grid-heavy-scale-fx': 35, 'grid-heavy-count-scale': 62, 'grid-heavy-all': 94,
};
const scr = additivityScreen(LADDER);
assert.equal(scr.status, 'additive');
assert.equal(scr.combos.find((c) => c.id === 'grid-heavy-all').pred, 94);
assert.equal(scr.combos.find((c) => c.id === 'grid-heavy-count-fx').relErr, 0.25);
const scrNA = additivityScreen({ ...LADDER, 'grid-heavy-all': 200 });
assert.equal(scrNA.status, 'non-additive');
assert.ok(Math.abs(scrNA.combos.find((c) => c.id === 'grid-heavy-all').relErr - 0.53) < 1e-9);
const scrInd = additivityScreen({ ...LADDER, 'grid-fx-3': undefined });
assert.equal(scrInd.status, 'indeterminate');

/* ── baselines ── */
const sol = solveLinear([[2, 1], [1, 3]], [4, 7]);
assert.ok(Math.abs(sol[0] - 1) < 1e-9 && Math.abs(sol[1] - 2) < 1e-9);
assert.equal(solveLinear([[1, 2], [2, 4]], [3, 6]), null); // singular -> null, never NaN

const mkRow = (labelMs, features) => ({ recipeId: 'r', device: 'd', labelMs, features });
const bag = (num = {}, extra = {}) => ({
  v: 4, system: 'fibonacci', num, mech: { instancesXprim: 100 }, probe: { fillRate: 10, instanced: 10, blend: 5, js: 5 }, ...extra,
});
const countRows = [0.1, 0.3, 0.5, 0.7, 0.9].map((x) =>
  mkRow(5 * Math.exp(2 * x), bag({ count: x, particleCount: 0 })));
const countFit = fitCountOnly(countRows);
assert.ok(Math.abs(countFit.predict(mkRow(0, bag({ count: 0.5, particleCount: 0 }))) - 5 * Math.E) < 0.5);
const ridgeRows = [0.1, 0.3, 0.5, 0.7, 0.9].map((x) =>
  mkRow(Math.exp(1 + 2 * x), bag({ count: x, particleCount: 0 })));
const ridgeFit = fitRidge(ridgeRows);
assert.ok(ridgeFit, 'ridge fits');
const ridgePred = ridgeFit.predict(mkRow(0, bag({ count: 0.5, particleCount: 0 })));
assert.ok(Math.abs(ridgePred - Math.exp(2)) / Math.exp(2) < 0.15, `ridge pred ${ridgePred}`);

/* ── replay scoring: hand-computed scenes (budget 33.33ms @30fps) ── */
assert.deepEqual(rubricFor(null), { quality: 1, factor: 1 });
assert.deepEqual(rubricFor({ renderScale: 0.75 }), { quality: 0.85, factor: 0.5625 });
assert.ok(Math.abs(pinballLoss(90, 100) - 9) < 1e-9); // under-predict by 10 at tau .9
assert.ok(Math.abs(pinballLoss(110, 100) - 1) < 1e-9); // over-predict by 10
const scenes = [
  { labelMs: 100, pred: 100 }, // deep shed: eff 10.9, no hitch, q .5, pinball 0
  { labelMs: 50, pred: 10 },   // no prime: hitch, false-cheap, pinball 36
  { labelMs: 20, pred: null }, // abstention: full rung, no hitch
];
const scored = scoreContender(
  scenes.map((s) => mkRow(s.labelMs, bag())),
  (row) => scenes.find((s) => s.labelMs === row.labelMs).pred,
  { targetFps: 30 },
);
assert.equal(scored.hitches, 1);
assert.equal(scored.heavy, 2);
assert.equal(scored.heavyHitches, 1);
assert.ok(Math.abs(scored.quality - 2.5 / 3) < 1e-9);
assert.equal(scored.pinball, 18);
assert.equal(scored.falseCheapRate, 0.5);
assert.equal(scored.abstentions, 1);

/* ── verdict math on synthetic scoreboards ── */
const ctxOk = { additive: false, testableDevices: 1, hasModel: true, split: { recipeLeg: true, deviceLeg: true }, testCount: 10 };
const S = (o) => ({ scenes: 10, hitches: 0, heavyHitches: 0, heavy: 5, quality: 1, pinball: null, falseCheapRate: null, abstentions: 0, ...o });
const shipScores = {
  static: S({ hitches: 10 }),
  countOnly: S({ hitches: 8, quality: 0.9, pinball: 2.0, falseCheapRate: 0.2 }),
  ridge: S({ hitches: 9, quality: 0.92, pinball: 1.8, falseCheapRate: 0.1 }),
  head: S({ hitches: 6, quality: 0.97, pinball: 1.0, falseCheapRate: 0.03 }),
};
assert.equal(computeVerdict({ scores: shipScores, ctx: ctxOk }).verdict, 'SHIP');
// quality leg: equal hitches to a baseline, >=15% more quality
const legB = computeVerdict({
  scores: {
    ...shipScores,
    countOnly: S({ hitches: 8, quality: 0.85, pinball: 2.0, falseCheapRate: 0.2 }),
    head: S({ hitches: 8, quality: 1.0, pinball: 1.0, falseCheapRate: 0.0 }),
  },
  ctx: ctxOk,
});
assert.equal(legB.verdict, 'SHIP');
assert.ok(legB.reasons[0].includes('quality leg'));
// false-cheap past the kill line
const fcKill = computeVerdict({
  scores: { ...shipScores, head: S({ hitches: 6, quality: 0.97, pinball: 1.0, falseCheapRate: 0.12 }) },
  ctx: ctxOk,
});
assert.equal(fcKill.verdict, 'KILL');
assert.ok(fcKill.reasons.some((r) => r.includes('kill line')));
// gain under the kill line
const gainKill = computeVerdict({
  scores: { ...shipScores, head: S({ hitches: 10, quality: 1, pinball: 1.0, falseCheapRate: 0.0 }) },
  ctx: ctxOk,
});
assert.equal(gainKill.verdict, 'KILL');
assert.ok(gainKill.reasons.some((r) => r.includes('replay gain')));
// no model / no device leg / additive
assert.equal(computeVerdict({ scores: { ...shipScores, head: null }, ctx: { ...ctxOk, hasModel: false } }).verdict, 'KILL');
assert.equal(computeVerdict({ scores: shipScores, ctx: { ...ctxOk, split: { recipeLeg: true, deviceLeg: false } } }).verdict, 'KILL');
assert.equal(computeVerdict({ scores: shipScores, ctx: { ...ctxOk, additive: true } }).verdict, 'ADDITIVE-KILL');

/* ── artifact round-trip through the REAL evaluator ── */
const artifact = {
  kind: 'xgboost-cost',
  objective: 'reg:quantileerror',
  baseScore: 3.0,
  tau: 0.9,
  calibration: 1.2,
  features: ['system', 'num.count', 'mech.instancesXprim', 'probe.fillRate'],
  trees: [
    { f: 1, op: '<', v: 0.5, y: { leaf: 0.3 }, n: { leaf: 1.1 }, gain: 2 },
    {
      f: 0, op: '=', v: 'swarm',
      y: { leaf: 0.2 },
      n: { f: 3, op: '<', v: 100, y: { leaf: -0.1 }, n: { leaf: 0.4 }, gain: 1 },
      gain: 1,
    },
  ],
};
const v = validateCostModel(artifact);
assert.ok(v.ok, v.error);
const predMs = predictMs(v.model, bag({ count: 0.7 }, { system: 'swarm' }));
// walk: count .7 -> 1.1; system swarm -> 0.2; exp(3.0+1.3) * 1.2
assert.ok(Math.abs(predMs - Math.exp(4.3) * 1.2) < 1e-6, `predictMs ${predMs}`);
// a top-level numeric can never split (the evaluator's family rule)
const badSplit = {
  kind: 'xgboost-cost', objective: 'reg:quantileerror', baseScore: 0,
  features: ['castSize'], trees: [{ f: 0, op: '=', v: 3, y: { leaf: 0 }, n: { leaf: 0 }, gain: 0 }],
};
assert.equal(validateCostModel(badSplit).ok, false);
// depth bound: 6 nested splits (leaves at depth 6) pass; 7 fail
const chain = (n) => (n === 0 ? { leaf: 0 } : {
  f: 0, op: '<', v: 1, y: chain(n - 1), n: { leaf: 0 }, gain: 0,
});
const depthOk = { kind: 'xgboost-cost', objective: 'reg:quantileerror', baseScore: 0, features: ['num.count'], trees: [chain(6)] };
assert.ok(validateCostModel(depthOk).ok);
const depthBad = { ...depthOk, trees: [chain(7)] };
assert.equal(validateCostModel(depthBad).ok, false);

/* ── runJudge end-to-end on fabricated, schema-valid datasets ── */
function makeDataset(renderer, platform, labels, featsById) {
  const rows = Object.entries(labels).map(([id, label]) => ({
    id,
    description: `fixture ${id}`,
    status: 'measured',
    doc: {},
    features: featsById[id],
    canvas: { w: 1280, h: 720 },
    reps: [{ n: 30, mean: label, p50: label, p90: label, p99: label, max: label }],
    labelMs: label,
  }));
  return {
    kind: 'kc-cost-dataset',
    version: 1,
    generatedAt: '2026-10-16T00:00:00.000Z',
    environment: { renderer, platform, swiftShader: false },
    method: { label: LABEL_DEFINITION },
    rows,
  };
}
const LABELS = {
  ...LADDER,
  'grid-heavy-all': 500, // breaks additivity on both devices
  'grid-cast-4': 200, 'grid-scale-small': 200, 'grid-blend-screen': 200,
  'grid-swarm-150': 200, 'grid-swarm-500': 200, 'parity-b': 200,
  'grid-count-12': 20, 'grid-mirror-x': 20, 'parity-a': 20,
  'grid-heavy-count-fx': 63, 'grid-heavy-count-scale': 62,
};
const COUNT_BY_ID = {
  'grid-base': 0.9, 'grid-count-160': 0.2, 'grid-count-480': 0.9, 'grid-cast-4': 0.2,
  'grid-cast-24': 0.9, 'grid-scale-small': 0.2, 'grid-scale-large': 0.9, 'grid-fx-1': 0.2,
  'grid-fx-2': 0.9, 'grid-fx-3': 0.2, 'grid-fx-4': 0.9, 'grid-blend-screen': 0.2,
  'grid-swarm-150': 0.9, 'grid-swarm-500': 0.2, 'grid-heavy-count-fx': 0.9,
  'grid-heavy-scale-fx': 0.9, 'grid-heavy-count-scale': 0.9, 'grid-heavy-all': 0.2, 'parity-b': 0.9,
  'grid-count-12': 0.2, 'grid-mirror-x': 0.2, 'parity-a': 0.2,
};
const featsOf = (id) => bag(
  { count: COUNT_BY_ID[id], particleCount: 0 },
  { system: id === 'grid-heavy-count-fx' || id === 'grid-heavy-count-scale' ? 'swarm' : 'fibonacci' },
);
const featsById = Object.fromEntries(IDS22.map((id) => [id, featsOf(id)]));
const dsA = makeDataset('dev-a', 'x', LABELS, featsById);
const dsB = makeDataset('dev-b', 'x', LABELS, featsById);
assert.ok(validateDataset(dsA).ok, validateDataset(dsA).errors?.join('; '));
assert.equal(deviceKeyOf(dsA), 'dev-a|x');
const byDev = additivityByDevice([
  ...dsA.rows.map((r) => ({ recipeId: r.id, device: 'dev-a|x', labelMs: r.labelMs })),
]);
assert.equal(byDev.additive, false);

const fixtureModel = {
  kind: 'xgboost-cost',
  objective: 'reg:quantileerror',
  baseScore: Math.log(20),
  tau: 0.9,
  calibration: 1.05, // the trainer's floor is 1.0; a real artifact calibrates up
  features: ['system', 'num.count'],
  trees: [{ f: 0, op: '=', v: 'swarm', y: { leaf: Math.log(5) }, n: { leaf: 0 }, gain: 1 }],
};
const vm = validateCostModel(fixtureModel);
assert.ok(vm.ok, vm.error);
const out = runJudge({ datasets: [dsA, dsB], model: vm.model, targetFps: 30 });
assert.equal(out.split.testCount, 5);
assert.equal(out.scores.static.hitches, 2);
assert.equal(out.scores.head.hitches, 0);
assert.equal(out.scores.head.falseCheapRate, 0);
assert.equal(out.verdict.verdict, 'SHIP', out.verdict.reasons.join('; '));
// single device: the unseen-device leg is not evaluable -> KILL, said plainly
const soloOut = runJudge({ datasets: [dsA], model: vm.model, targetFps: 30 });
assert.equal(soloOut.verdict.verdict, 'KILL');
assert.ok(soloOut.verdict.reasons[0].includes('not evaluable'));
// no model -> KILL
assert.equal(runJudge({ datasets: [dsA, dsB], model: null }).verdict.verdict, 'KILL');

console.log('costJudge.selfcheck: all assertions passed');
