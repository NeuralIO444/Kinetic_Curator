// app/src/engine/jansenSolver.js — #1865 BEAST S2: pure closed-form Jansen kinematics.
//
// No stage, no drawing, no state. (lengths, θ) → joints + foot.
// Circle-circle intersections only, in the canonical chain order
// (docs/design/strandbeest-linkage-research-2026-10-29.md §2).
//
// Branch selection is pinned by a fixed geometric rule — the signed-area
// (cross-product) side of each joint relative to the directed line through
// its two parent joints: J2 +, J3 +, J4 +, J5 −, F +. This is the assembly
// mode that reproduces the published wild-type gait (see jansenMeasures.js
// WANG_ANCHORS and beast.selfcheck.mjs). The signs are constant over the
// whole crank cycle for the wild type with wide margins (signed heights at
// a=38 stay within J2 +[36.5, 41.5], J3 +40.0, J4 +[15.4, 39.3],
// J5 −[−36.6, −31.2], F +48.4 — never near the parent line), so the rule
// never wavers near a singularity. An earlier version seeded θ=0 with an
// arbitrary candidate and chained by continuity; that silently assembled
// the leg in the flipped-J5 mode, whose foot curve is a tall loop instead
// of the flat-bottomed Jansen ovoid. A pure function of (lengths, θ) also
// keeps the solver replay-legal: no call-history dependence.
// Deterministic: pure, no Math.random, no clocks.

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

/**
 * Pick the intersection candidate on the pinned side of the directed line
 * P→Q: sign +1 keeps the candidate with cross(Q−P, X−P) > 0, −1 the other.
 * (circ's candidate 0 is always the positive-cross one when h > 0.) At a
 * tangent configuration h ≈ 0 the candidates coincide, so either is right.
 */
function pickBranch(candidates, P, Q, sign) {
  if (!candidates || candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  const c0 = (Q.x - P.x) * (candidates[0].y - P.y) - (Q.y - P.y) * (candidates[0].x - P.x);
  if (Math.abs(c0) < 1e-12) return candidates[0];
  return c0 > 0 === sign > 0 ? candidates[0] : candidates[1];
}

/**
 * Solve one pose. lengths relative to a=1; absolute = relative * scale.
 * Returns { joints: {J1..J5, F}, ok: boolean } or null on failure.
 */
export function solvePose(lengths, theta, scale = 1) {
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

  const J2 = pickBranch(circ(J1, j, G, b), J1, G, +1);
  if (!J2) return null;

  const J3 = pickBranch(circ(J2, e, G, d), J2, G, +1);
  if (!J3) return null;

  const J4 = pickBranch(circ(J1, k, G, c), J1, G, +1);
  if (!J4) return null;

  const J5 = pickBranch(circ(J3, f, J4, g), J3, J4, -1);
  if (!J5) return null;

  const F = pickBranch(circ(J4, i, J5, h), J4, J5, +1);
  if (!F) return null;

  return { joints: { J1, J2, J3, J4, J5, F }, ok: true };
}

/**
 * Full cycle feasibility + Wang gait metrics (definitions per
 * docs/design/strandbeest-linkage-research-2026-10-29.md §3, Wang 2026):
 * one sweep of 360 crank steps. Stance = the samples with the foot within
 * the lowest 15% of its height range (Wang's operational stance).
 *   step      — horizontal distance the foot travels during stance
 *   clearance — max foot height above the ground line (the stance mean
 *               height) during the cycle
 *   flatness  — RMS deviation of foot height from its stance mean,
 *               normalized by step length (dimensionless; the published
 *               0.0281 is this ratio — the absolute RMS is 1.21 at a=38)
 *   ripple    — std/mean of the foot's horizontal velocity during stance,
 *               central differences over the cycle samples
 *   duty      — fraction of the cycle in stance
 * flatness, ripple and duty are scale-free; step and clearance scale
 * linearly with `scale`.
 */
export function evaluateGenome(lengths, scale = 1) {
  const STEPS = 360;
  const feet = [];

  for (let s = 0; s < STEPS; s++) {
    const theta = (s / STEPS) * Math.PI * 2;
    const pose = solvePose(lengths, theta, scale);
    if (!pose) return { feasible: false, stillborn: true };
    feet.push(pose.joints.F);
  }

  let minY = Infinity;
  let maxY = -Infinity;
  for (const f of feet) {
    minY = Math.min(minY, f.y);
    maxY = Math.max(maxY, f.y);
  }

  const heightRange = maxY - minY || 1;
  const stanceThreshold = minY + 0.15 * heightRange;
  const stanceIdx = [];
  for (let s = 0; s < STEPS; s++) {
    if (feet[s].y <= stanceThreshold) stanceIdx.push(s);
  }
  if (stanceIdx.length === 0) return { feasible: false, stillborn: true };

  const stanceMean = stanceIdx.reduce((sum, s) => sum + feet[s].y, 0) / stanceIdx.length;
  let minStanceX = Infinity;
  let maxStanceX = -Infinity;
  for (const s of stanceIdx) {
    minStanceX = Math.min(minStanceX, feet[s].x);
    maxStanceX = Math.max(maxStanceX, feet[s].x);
  }
  const step = maxStanceX - minStanceX;

  const rms = Math.sqrt(stanceIdx.reduce((sum, s) => sum + (feet[s].y - stanceMean) ** 2, 0) / stanceIdx.length);
  const flatness = step > 0 ? rms / step : 0;

  const dTheta = (Math.PI * 2) / STEPS;
  const vels = stanceIdx.map((s) => (feet[(s + 1) % STEPS].x - feet[(s - 1 + STEPS) % STEPS].x) / (2 * dTheta));
  const meanVel = vels.reduce((sum, v) => sum + v, 0) / vels.length;
  const varVel = vels.reduce((sum, v) => sum + (v - meanVel) ** 2, 0) / vels.length;
  const ripple = meanVel ? Math.sqrt(Math.max(0, varVel)) / Math.abs(meanVel) : 0;

  const clearance = maxY - stanceMean;
  const duty = stanceIdx.length / STEPS;

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
  };
}

/** Stillbirth test: any angle fails or no stance foot. */
export function isStillborn(lengths, scale = 1) {
  return !evaluateGenome(lengths, scale).feasible;
}
