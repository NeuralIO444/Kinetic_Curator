// Combined selfcheck for BEAST foundation (S1-S5).
// node app/src/engine/beast.selfcheck.mjs

import { wildTypeMeasures } from './jansenMeasures.js';
import { evaluateGenome } from './jansenSolver.js';
import { sampleFootCurve, frechetDistance } from './beastTrails.js';

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
console.log('PASS S2: feasible + Wang metrics finite');

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

console.log('BEAST foundation selfcheck green');
