// One shipped ladder for #109 / #119.
// Frames are authored here on purpose: live code only *selects* an index from u.
// Replace with studio/geom.py --assets output when a real pair is chosen.
// Never interpolate paths on the rAF path.

export const DEMO_LADDER_ID = 'wing-open';
export const DEMO_LADDER_STEPS = [
  '<ellipse cx="50" cy="50" rx="10" ry="30" fill="var(--ink)"/>',
  '<ellipse cx="50" cy="50" rx="16" ry="28" fill="var(--ink)"/>',
  '<ellipse cx="50" cy="50" rx="22" ry="24" fill="var(--ink)"/>',
  '<ellipse cx="50" cy="50" rx="28" ry="20" fill="var(--ink)"/>',
  '<ellipse cx="50" cy="50" rx="34" ry="16" fill="var(--ink)"/>',
];

export function ladderFrame(u) {
  const t = Number.isFinite(u) ? Math.min(1, Math.max(0, u)) : 0;
  return Math.round(t * (DEMO_LADDER_STEPS.length - 1));
}
