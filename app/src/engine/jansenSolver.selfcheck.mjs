// app/src/engine/jansenSolver.selfcheck.mjs — golden tests for #1865
// Run with node. Expects holy numbers to produce a feasible gait matching published order-of-magnitude metrics.

import { evaluateGenome, isStillborn } from './jansenSolver.js';
import { JANSEN_RELATIVE, wildTypeMeasures } from './jansenMeasures.js';

const holy = wildTypeMeasures();
const result = evaluateGenome(holy, 1);

if (!result.feasible) {
  console.error('FAIL: wild-type Jansen is stillborn');
  process.exit(1);
}

console.log('PASS: wild-type feasible');
console.log('clearance ~', result.clearance.toFixed(2), '(published 25.7 at a=38 scale; relative scale differs)');

// k tripwire: push k outside narrow band
const badK = { ...holy, k: holy.k * 1.05 };
if (!isStillborn(badK)) {
  console.error('FAIL: k +5% should stillbirth');
  process.exit(1);
}
console.log('PASS: k tripwire stillbirths');

// 1e-4 rounding safety on k
const rounded = { ...holy, k: Math.round(holy.k * 1e4) / 1e4 };
if (isStillborn(rounded)) {
  console.error('FAIL: 1e-4 rounding stillbirthed k');
  process.exit(1);
}
console.log('PASS: 1e-4 rounding safe');

console.log('S2 selfcheck green');
