// #560 PR1 — the trail field. Unknown stays today's accum. No look change.

export const TRAIL_MODES = ['accum', 'echo', 'leave', 'ribbon', 'comet'];

export function resolveTrail(value) {
  return TRAIL_MODES.includes(value) ? value : 'accum';
}

export function trailUsesAccumRecipe(value) {
  const mode = resolveTrail(value);
  return mode === 'accum' || mode === 'echo';
}
