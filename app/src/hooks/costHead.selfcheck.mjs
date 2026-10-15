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

console.log('costHead selfcheck OK');
