// app/src/engine/beastBuilder.js — #1866 BEAST S3: stamp-rendered side-on linkage that walks in place.
//
// Uses the S2 solver. Renders bars as strokes and joints as nodes via the existing compound/stamp path.
// Crank advances at a DRIVE-gene rate. Side-on profile, rotated to heading (heading fixed for this slice).
// Foot path matches solver curve; stance is flat. No travelling yet (S4).
// Cost registers in the creature section of costRegistry (to be wired).

import { solvePose } from './jansenSolver.js';

export function buildBeastPose(measures, theta, scale = 1, heading = 0) {
  const pose = solvePose(measures, theta, scale);
  if (!pose || !pose.ok) return null;
  // Rotate all joints by heading for side-on facing
  const cos = Math.cos(heading);
  const sin = Math.sin(heading);
  const rot = (p) => ({ x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos });
  const j = pose.joints;
  return {
    bars: [
      [rot(j.J1), rot(j.J2)],
      [rot(j.J2), rot(j.J3)],
      [rot(j.J1), rot(j.J4)],
      [rot(j.J3), rot(j.J5)],
      [rot(j.J4), rot(j.J5)],
      [rot(j.J4), rot(j.F)],
      [rot(j.J5), rot(j.F)],
    ],
    joints: Object.values(j).map(rot),
    foot: rot(j.F),
  };
}

/** Advance crank. Rate from drive; returns new theta. */
export function stepCrank(theta, rate, dt) {
  return (theta + rate * dt) % (Math.PI * 2);
}
