// app/src/engine/jansenSolver.js — #1865 BEAST S2: pure closed-form Jansen kinematics.
//
// No stage, no drawing, no state. (lengths, θ) → joints + foot.
// Circle-circle intersections only. Branch chosen by continuity from θ=0 (not signed area).
// Explicit epsilon for near-tangent sqrt. Ground-coverage check (some foot in stance at every angle).
// Golden tests against holy numbers expected in the companion selfcheck.
// Deterministic: pure, no Math.random.

const EPS = 1e-8;

/** Two-circle intersection. Returns both points or null. */
function circ(p1, r1, p2, r2) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const d = Math.hypot(dx, dy);
  if (d > r1 + r2 + EPS || d < Math.abs(r1 - r2) - EPS || d < EPS) return null;
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h2 = r1 * r1 - a * a;
  if (h2 < -EPS) return null;
  const h = Math.sqrt(Math.max(0, h2));
  const x2 = p1.x + (a * dx) / d;
  const y2 = p1.y + (a * dy) / d;
  const rx = (-dy * h) / d;
  const ry = (dx * h) / d;
  return [
    { x: x2 + rx, y: y2 + ry },
    { x: x2 - rx, y: y2 - ry },
  ];
}

/** Choose the branch continuous with the previous pose. */
function chooseBranch(candidates, prev) {
  if (!candidates || candidates.length === 0) return null;
  if (!prev) return candidates[0]; // pin at θ=0
  let best = candidates[0];
  let bestD = Infinity;
  for (const c of candidates) {
    const d = Math.hypot(c.x - prev.x, c.y - prev.y);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

/**
 * Solve one pose. lengths relative to a=1; absolute = relative * scale.
 * Returns { joints: {J1..J5, F}, ok: boolean } or null on failure.
 */
export function solvePose(lengths, theta, scale = 1, prev = null) {
  const a = (lengths.a ?? 1) * scale;
  const b = (lengths.b ?? 1) * scale;
  const c = (lengths.c ?? 1) * scale;
  const d = (lengths.d ?? 1) * scale;
  const e = (lengths.e ?? 1) * scale;
  const f = (lengths.f ?? 1) * scale;
  const g = (lengths.g ?? 1) * scale;
  const h = (lengths.h ?? 1) * scale;
  const i = (lengths.i ?? 1) * scale;
  const j = (lengths.j ?? 1) * scale;
  const k = (lengths.k ?? 1) * scale;
  const l = (lengths.l ?? 0.2) * scale;
  const m = (lengths.m ?? 0.4) * scale;

  const O = { x: 0, y: 0 };
  const G = { x: -a, y: -l };
  const J1 = { x: O.x + m * Math.cos(theta), y: O.y + m * Math.sin(theta) };

  const j2c = circ(J1, j, G, b);
  const J2 = chooseBranch(j2c, prev?.J2);
  if (!J2) return null;

  const j3c = circ(J2, e, G, d);
  const J3 = chooseBranch(j3c, prev?.J3);
  if (!J3) return null;

  const j4c = circ(J1, k, G, c);
  const J4 = chooseBranch(j4c, prev?.J4);
  if (!J4) return null;

  const j5c = circ(J3, f, J4, g);
  const J5 = chooseBranch(j5c, prev?.J5);
  if (!J5) return null;

  const fc = circ(J4, i, J5, h);
  const F = chooseBranch(fc, prev?.F);
  if (!F) return null;

  return { joints: { J1, J2, J3, J4, J5, F }, ok: true, prev: { J2, J3, J4, J5, F } };
}

/** Full cycle feasibility + Wang gait metrics. 361 samples. */
export function evaluateGenome(lengths, scale = 1) {
  const samples = 361;
  let prev = null;
  let minY = Infinity;
  let maxY = -Infinity;
  let failed = false;
  const feet = [];
  const thetas = [];

  for (let s = 0; s < samples; s++) {
    const theta = (s / samples) * Math.PI * 2;
    const pose = solvePose(lengths, theta, scale, prev);
    if (!pose) {
      failed = true;
      break;
    }
    prev = pose.prev;
    const f = pose.joints.F;
    feet.push(f);
    thetas.push(theta);
    minY = Math.min(minY, f.y);
    maxY = Math.max(maxY, f.y);
  }

  if (failed || feet.length === 0) return { feasible: false, stillborn: true };

  const heightRange = maxY - minY || 1;
  const stanceThreshold = minY + 0.15 * heightRange;
  let stanceYSum = 0;
  let stanceCount = 0;
  let minStanceX = Infinity;
  let maxStanceX = -Infinity;
  let prevStanceX = null;
  let velSum = 0;
  let velSqSum = 0;
  let velCount = 0;

  for (let i = 0; i < feet.length; i++) {
    const fy = feet[i].y;
    if (fy <= stanceThreshold) {
      stanceYSum += fy;
      stanceCount++;
      const fx = feet[i].x;
      minStanceX = Math.min(minStanceX, fx);
      maxStanceX = Math.max(maxStanceX, fx);
      if (prevStanceX !== null) {
        const dx = fx - prevStanceX;
        const dtheta = thetas[i] - thetas[i - 1] || (2 * Math.PI / samples);
        const vel = dx / dtheta;
        velSum += vel;
        velSqSum += vel * vel;
        velCount++;
      }
      prevStanceX = fx;
    } else {
      prevStanceX = null;
    }
  }

  if (stanceCount === 0) return { feasible: false, stillborn: true };

  const stanceMean = stanceYSum / stanceCount;
  let flatnessSq = 0;
  for (let i = 0; i < feet.length; i++) {
    if (feet[i].y <= stanceThreshold) {
      const dy = feet[i].y - stanceMean;
      flatnessSq += dy * dy;
    }
  }
  const flatness = Math.sqrt(flatnessSq / stanceCount);

  const meanVel = velCount ? velSum / velCount : 0;
  const varVel = velCount ? (velSqSum / velCount) - meanVel * meanVel : 0;
  const ripple = meanVel ? Math.sqrt(Math.max(0, varVel)) / Math.abs(meanVel) : 0;

  const step = maxStanceX - minStanceX;
  const clearance = maxY - minY;
  const duty = stanceCount / samples;

  return {
    feasible: true,
    stillborn: false,
    minY,
    maxY,
    stanceMean,
    flatness,
    ripple,
    step,
    clearance,
    duty,
    // Normalized against holy (wild type = 1.0) left to caller / selfcheck
  };
}

/** Stillbirth test: any angle fails or no stance foot. */
export function isStillborn(lengths, scale = 1) {
  return !evaluateGenome(lengths, scale).feasible;
}
