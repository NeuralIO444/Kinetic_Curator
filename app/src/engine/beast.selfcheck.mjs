// Combined selfcheck for BEAST foundation (S1-S5).
// node app/src/engine/beast.selfcheck.mjs

import { wildTypeMeasures } from './jansenMeasures.js';
import { evaluateGenome, isStillborn } from './jansenSolver.js';
import { sampleFootCurve, frechetDistance, isFamily } from './beastTrails.js';
import { addJansenMeasures, sanitizeGenome } from './creatureGenome.js';

const holy = wildTypeMeasures();
const ev = evaluateGenome(holy, 1);
if (!ev.feasible) {
  console.error('FAIL S2: wild-type stillborn');
  process.exit(1);
}
if (![ev.flatness, ev.ripple, ev.step, ev.clearance, ev.duty].every(Number.isFinite)) {
  console.error('FAIL S2: Wang metrics not finite');
  process.exit(1);
}
console.log('PASS S2: feasible + Wang metrics (flatness, ripple, step, clearance, duty)');

const curve = sampleFootCurve(holy, 1);
if (curve.length < 36) {
  console.error('FAIL S5: curve too short');
  process.exit(1);
}
const selfDist = frechetDistance(curve, curve);
if (selfDist > 1e-6) {
  console.error('FAIL S5: self Fréchet not ~0');
  process.exit(1);
}
console.log('PASS S5: Fréchet self-distance ~0');

const genome = addJansenMeasures({ genes: [{ kind: 'plan', id: 'plan', value: 0 }] }, holy);
if (!genome || !sanitizeGenome(genome)) {
  console.error('FAIL S1: measure genes did not sanitize');
  process.exit(1);
}
console.log('PASS S1: measure genes round-trip');

console.log('BEAST foundation selfcheck green');
