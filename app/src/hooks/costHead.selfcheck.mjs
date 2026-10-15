// node src/hooks/costHead.selfcheck.mjs — #1578 cost head pure contracts.
import assert from 'node:assert';
import {
  COST_HEAD_KIND, COST_OBJECTIVE,
  validateCostModel, predictMs, mechanismFeatures, costFeatures,
  initialRung, primeGovernor, runDeviceProbes,
} from './costHead.mjs';

// Synthetic model: one tree that splits on mech.instancesXprim
// baseScore 3.5 → exp ~33 ms; low leaf -0.3 → ~24 ms; high leaf +0.5 → ~50 ms
const modelRaw = {
  kind: COST_HEAD_KIND,
  objective: COST_OBJECTIVE,
  baseScore: 3.5,
  calibration: 1,
  tau: 0.9,
  features: ['mech.instancesXprim', 'probe.fillRate'],
  trees: [{
    f: 0, op: '<', v: 500,
    y: { leaf: -0.3 }, // lighter
    n: { leaf: 0.5 },  // heavier
    gain: 1,
  }],
};
const v = validateCostModel(modelRaw);
assert(v.ok, v.error);
const model = v.model;

const low = predictMs(model, { mech: { instancesXprim: 100 }, probe: { fillRate: 1 } });
assert(low > 20 && low < 30, low);
const high = predictMs(model, { mech: { instancesXprim: 1000 }, probe: { fillRate: 1 } });
assert(high > 45 && high < 60, high);

// Fallback on unknown / OOR
assert(predictMs(model, { mech: { instancesXprim: 100 } }) === null); // missing probe
assert(predictMs(model, { mech: { instancesXprim: 1e9 }, probe: { fillRate: 1 } }) === null);

// Mechanism features are finite and positive
const mech = mechanismFeatures({ count: 200, scale: [1, 2], accumulation: true });
assert(mech.instancesXprim > 0 && mech.canvasXpasses > 0);

// Initial rung: under budget → null; over → shed (30 fps budget ≈ 33 ms)
assert(initialRung(10, { targetFps: 30 }) === null);
assert(initialRung(30)?.renderScale === 0.75);
assert(initialRung(45)?.renderScale === 0.5);
assert(initialRung(70)?.quality === 'performance');

// Prime: no model → null; with model and heavy → a shed
assert(primeGovernor({ layoutParams: { count: 100 } }) === null);
const heavyPrime = primeGovernor({
  model,
  layoutParams: { count: 800, scale: [2, 3], accumulation: true },
  probes: runDeviceProbes(),
  targetFps: 30,
});
assert(heavyPrime && heavyPrime.renderScale < 1, JSON.stringify(heavyPrime));

// Device probes are stable mid-tier
const probes = runDeviceProbes();
assert(probes.fillRate === 1 && probes.js === 1);

// --- Validation teeth (mirrors the taste tree head) ---
const variant = (patch) => validateCostModel({ ...modelRaw, ...patch });
const split = (patch) => [{ f: 0, op: '<', v: 500, y: { leaf: -0.3 }, n: { leaf: 0.5 }, gain: 1, ...patch }];
assert(!variant({ objective: 'binary:logistic' }).ok);            // wrong objective
assert(!variant({ features: ['mech.instancesXprim', 'mech.instancesXprim'] }).ok); // duplicate feature
assert(!variant({ trees: split({ f: 9 }) }).ok);                  // feature index out of range
assert(!variant({ trees: split({ op: '=' }) }).ok);               // numeric feature must split <
assert(!variant({ trees: split({ v: 'high' }) }).ok);             // numeric split needs a finite number
assert(!variant({ trees: split({ gain: undefined }) }).ok);       // split needs a finite gain
assert(!variant({ trees: [{ f: 0, op: '<', v: 500, y: { leaf: NaN }, n: { leaf: 0 }, gain: 1 }] }).ok); // non-finite leaf
assert(!variant({ trees: [{ f: 0, op: '<', v: 500, y: { leaf: 0 }, gain: 1 }] }).ok); // missing n child
// Categorical features split with = on a string/boolean
const catRaw = {
  ...modelRaw, features: ['family'],
  trees: [{ f: 0, op: '=', v: 'radial', y: { leaf: 0.1 }, n: { leaf: -0.1 }, gain: 1 }],
};
assert(validateCostModel(catRaw).ok);
assert(!validateCostModel({ ...catRaw, trees: [{ f: 0, op: '<', v: 'radial', y: { leaf: 0 }, n: { leaf: 0 }, gain: 1 }] }).ok);
// Bounds: too many trees, too deep
assert(!variant({ trees: Array.from({ length: 513 }, () => ({ leaf: 0 })) }).ok);
const deep = (d) => (d === 0 ? { leaf: 0 } : { f: 0, op: '<', v: 1, y: deep(d - 1), n: { leaf: 0 }, gain: 1 });
assert(!variant({ trees: [deep(8)] }).ok);
assert(variant({ trees: [deep(6)] }).ok);

// Validation rebuilds clean nodes: mutating the raw file afterwards
// cannot move a prediction made from the validated model.
const rawMutable = JSON.parse(JSON.stringify(modelRaw));
const vm = validateCostModel(rawMutable);
assert(vm.ok, vm.error);
const before = predictMs(vm.model, { mech: { instancesXprim: 100 }, probe: { fillRate: 1 } });
rawMutable.trees[0].y.leaf = 99;
rawMutable.features[0] = 'mech.somethingElse';
const after = predictMs(vm.model, { mech: { instancesXprim: 100 }, probe: { fillRate: 1 } });
assert(before === after, `${before} vs ${after}`);

console.log('costHead selfcheck OK');
