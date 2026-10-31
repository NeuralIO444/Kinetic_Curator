// Combined selfcheck for BEAST foundation (S1-S5).
// node app/src/engine/beast.selfcheck.mjs

import { wildTypeMeasures, WANG_ANCHORS, JANSEN_HOLY } from './jansenMeasures.js';
import { evaluateGenome, solvePose } from './jansenSolver.js';
import { sampleFootCurve, frechetDistance } from './beastTrails.js';
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

// Golden comparison against the published wild-type gait (Wang 2026, via
// docs/design/strandbeest-linkage-research-2026-10-29.md §3). flatness,
// ripple and duty are dimensionless; step and clearance are computed by
// the solver relative to a=1, so scale them by JANSEN_HOLY.a here.
// Tolerances are set from the measured residuals of the verified solver
// (flatness 0.0000, ripple 0.0000, step 0.04, clearance 0.05, duty 0.0008)
// with ~25x headroom — and they are 25x–9000x tighter than the values the
// flipped-J5 assembly mode produces (0.162 / 92.4 / 22.0 / 79.4 / 0.45),
// so a solver that assembles the leg wrong or drifts in its metric
// definitions fails here instead of being "loosened" past.
const GOLDENS = [
  ['flatness', ev.flatness, WANG_ANCHORS.flatness, 0.002],
  ['ripple', ev.ripple, WANG_ANCHORS.ripple, 0.01],
  ['step', ev.step * JANSEN_HOLY.a, WANG_ANCHORS.step, 1.0],
  ['clearance', ev.clearance * JANSEN_HOLY.a, WANG_ANCHORS.clearance, 1.0],
  ['duty', ev.duty, WANG_ANCHORS.duty, 0.01],
];
for (const [name, got, want, tol] of GOLDENS) {
  if (Math.abs(got - want) > tol) {
    console.error(`FAIL S2: ${name} ${got.toFixed(4)} not within ${tol} of published ${want}`);
    process.exit(1);
  }
}
console.log('PASS S2: feasible + all five Wang metrics at their published values');

// The flat-bottom property, asserted as a property of the foot curve (via
// the S5 sampler — a second sampling path over the same solver), not only
// as golden equality: through the middle half of stance the foot's height
// range stays under 5% of the step length (measured 2.4%), and the foot
// moves in one direction only — a monotone ground stroke with no cusp.
{
  const SAMPLES = 360;
  const curve = sampleFootCurve(holy, JANSEN_HOLY.a, SAMPLES);
  if (curve.length !== SAMPLES) {
    console.error('FAIL S2 property: foot curve incomplete');
    process.exit(1);
  }
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of curve) {
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const band = minY + 0.15 * (maxY - minY);
  const stanceIdx = [];
  for (let s = 0; s < SAMPLES; s++) if (curve[s].y <= band) stanceIdx.push(s);
  const stance = stanceIdx.map((s) => curve[s]);
  const step = Math.max(...stance.map((p) => p.x)) - Math.min(...stance.map((p) => p.x));
  const q = Math.floor(stance.length / 4);
  const mid = stance.slice(q, stance.length - q);
  const midRange = Math.max(...mid.map((p) => p.y)) - Math.min(...mid.map((p) => p.y));
  if (!(midRange / step < 0.05)) {
    console.error(
      `FAIL S2 property: mid-stance height range/step ${(midRange / step).toFixed(4)} >= 0.05 — stance is not flat`,
    );
    process.exit(1);
  }
  const dTheta = (Math.PI * 2) / SAMPLES;
  const vels = stanceIdx.map((s) => (curve[(s + 1) % SAMPLES].x - curve[(s - 1 + SAMPLES) % SAMPLES].x) / (2 * dTheta));
  const meanVel = vels.reduce((sum, v) => sum + v, 0) / vels.length;
  if (!vels.every((v) => v * meanVel > 0)) {
    console.error('FAIL S2 property: stance velocity changes sign — ground stroke is not monotone');
    process.exit(1);
  }
  console.log('PASS S2 property: flat mid-stance (range/step < 0.05), monotone ground stroke');
}

// Purity spot-check: a pose from the stateless solver must not depend on
// what was solved before it (the old continuity chaining did).
{
  const theta = 1.234;
  const cold = solvePose(holy, theta, 1);
  for (let s = 0; s < 360; s++) solvePose(holy, (s / 360) * Math.PI * 2, 1);
  const warm = solvePose(holy, theta, 1);
  if (JSON.stringify(cold.joints) !== JSON.stringify(warm.joints)) {
    console.error('FAIL S2: solvePose result depends on call history');
    process.exit(1);
  }
  console.log('PASS S2: solvePose is call-history independent');
}

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
