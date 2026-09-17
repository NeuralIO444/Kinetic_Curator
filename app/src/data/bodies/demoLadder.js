// Shipped ladders for #109: wing-open (#119 / #125) + pair-2.
// Frames come from studio/geom.py. Live code only selects an index from u.
// No path lerp on rAF — compounds never interpolate live.

import wingOpen from './wing-open.json' with { type: 'json' };
import pair2 from './pair-2.json' with { type: 'json' };

export const DEMO_LADDER_ID = 'wing-open';
export const DEMO_LADDER_STEPS = wingOpen.map((f) => f.svg);

export const MOTH_LADDERS = [
  { id: 'wing-open', steps: wingOpen.map((f) => f.svg) },
  { id: 'pair-2', steps: pair2.map((f) => f.svg) },
];

export function ladderById(ladderId) {
  return MOTH_LADDERS.find((l) => l.id === ladderId) || MOTH_LADDERS[0];
}

export function ladderFrame(u, ladderId = DEMO_LADDER_ID) {
  const steps = ladderById(ladderId).steps;
  const t = Number.isFinite(u) ? Math.min(1, Math.max(0, u)) : 0;
  return Math.round(t * (steps.length - 1));
}

export function ladderSymbolId(ladderId, frame) {
  return `kc-blend-${ladderById(ladderId).id}-${frame}`;
}
