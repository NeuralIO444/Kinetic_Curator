// One shipped ladder for #109 / #119.
// Frames come from studio/geom.py (org_drop_01 → org_petal_01).
// Live code only selects an index from u. No path lerp on rAF.

import frames from './wing-open.json';

export const DEMO_LADDER_ID = 'wing-open';
export const DEMO_LADDER_STEPS = frames.map((f) => f.svg);

export function ladderFrame(u) {
  const t = Number.isFinite(u) ? Math.min(1, Math.max(0, u)) : 0;
  return Math.round(t * (DEMO_LADDER_STEPS.length - 1));
}
