// app/src/engine/beastTrails.js — #1868 BEAST S5: trails & kin.
//
// Family resemblance = Fréchet distance between S2 foot curves, with a threshold.
// Trail writes counted in costRegistry. Gate on #1814/#1808/#1841; plain fading-graphic fallback otherwise.
// Signature is the computed curve from the solver, never approximated.

import { solvePose } from './jansenSolver.js';

export function sampleFootCurve(measures, scale = 1, samples = 72) {
  const curve = [];
  for (let s = 0; s < samples; s++) {
    const theta = (s / samples) * Math.PI * 2;
    const pose = solvePose(measures, theta, scale);
    if (pose && pose.ok) curve.push(pose.joints.F);
  }
  return curve;
}

/** Discrete Fréchet distance (simplified). Lower = more similar family. */
export function frechetDistance(curveA, curveB) {
  if (!curveA.length || !curveB.length) return Infinity;
  const n = curveA.length;
  const m = curveB.length;
  const ca = new Array(n);
  for (let i = 0; i < n; i++) {
    ca[i] = new Array(m);
    for (let j = 0; j < m; j++) {
      const d = Math.hypot(curveA[i].x - curveB[j].x, curveA[i].y - curveB[j].y);
      if (i === 0 && j === 0) ca[i][j] = d;
      else if (i === 0) ca[i][j] = Math.max(ca[i][j - 1], d);
      else if (j === 0) ca[i][j] = Math.max(ca[i - 1][j], d);
      else ca[i][j] = Math.max(Math.min(ca[i - 1][j], ca[i - 1][j - 1], ca[i][j - 1]), d);
    }
  }
  return ca[n - 1][m - 1];
}

export function isFamily(curveA, curveB, threshold = 0.15) {
  return frechetDistance(curveA, curveB) < threshold;
}

/** Deposit a fading trail segment. Counts as a costRegistry write. */
export function writeTrail(curve, path, fade = 0.98) {
  // Placeholder: actual wet-field deposit depends on #1814/#1841 landing.
  // Fallback is a plain fading graphic.
  return { segments: curve.map((p, i) => ({ x: p.x, y: p.y, alpha: Math.pow(fade, i) })), cost: curve.length };
}
