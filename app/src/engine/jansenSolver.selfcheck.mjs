// app/src/engine/jansenSolver.selfcheck.mjs — golden tests for #1865
// Run with node. Asserts the solver's mechanics: the holy numbers assemble
// over the full cycle with every bar at its genome length, k is the
// feasibility tripwire the literature says it is, and evaluation is
// deterministic. The published gait-number goldens (Wang 2026) live in
// beast.selfcheck.mjs, which owns the S1–S5 combined gate.

import { evaluateGenome, isStillborn, solvePose } from './jansenSolver.js';
import { JANSEN_RELATIVE, wildTypeMeasures } from './jansenMeasures.js';

const holy = wildTypeMeasures();
const result = evaluateGenome(holy, 1);

if (!result.feasible) {
  console.error('FAIL: wild-type Jansen is stillborn');
  process.exit(1);
}
console.log('PASS: wild-type feasible');
console.log(
  `info: wild-type metrics (relative) flatness ${result.flatness.toFixed(4)}, ripple ${result.ripple.toFixed(4)}, ` +
    `step ${result.step.toFixed(3)}, clearance ${result.clearance.toFixed(3)}, duty ${result.duty.toFixed(3)}`,
);

// Bar closure: at every sampled pose, each of the ten solved bars must sit
// at its genome length (the closed-form intersections are exact; anything
// above float noise means the chain or a branch rule is wrong).
{
  const BARS = [
    ['J1', 'J2', 'j'],
    ['G', 'J2', 'b'],
    ['J2', 'J3', 'e'],
    ['G', 'J3', 'd'],
    ['J1', 'J4', 'k'],
    ['G', 'J4', 'c'],
    ['J3', 'J5', 'f'],
    ['J4', 'J5', 'g'],
    ['J4', 'F', 'i'],
    ['J5', 'F', 'h'],
  ];
  let maxRes = 0;
  for (let s = 0; s < 360; s++) {
    const theta = (s / 360) * Math.PI * 2;
    const pose = solvePose(holy, theta, 1);
    if (!pose) {
      console.error(`FAIL: pose unsolved at step ${s}`);
      process.exit(1);
    }
    const G = { x: -JANSEN_RELATIVE.a, y: -JANSEN_RELATIVE.l };
    const at = (name) => (name === 'G' ? G : pose.joints[name]);
    for (const [p, q, key] of BARS) {
      const P = at(p);
      const Q = at(q);
      const res = Math.abs(Math.hypot(Q.x - P.x, Q.y - P.y) - JANSEN_RELATIVE[key]);
      if (res > maxRes) maxRes = res;
    }
  }
  if (maxRes > 1e-9) {
    console.error(`FAIL: bar-length residual ${maxRes} over the cycle`);
    process.exit(1);
  }
  console.log(`PASS: bar closure over the cycle (max residual ${maxRes.toExponential(1)})`);
}

// Determinism: the same genome evaluated twice gives identical metrics.
{
  const again = evaluateGenome(holy, 1);
  if (JSON.stringify(again) !== JSON.stringify(result)) {
    console.error('FAIL: evaluateGenome is not deterministic');
    process.exit(1);
  }
  console.log('PASS: evaluateGenome deterministic');
}

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
