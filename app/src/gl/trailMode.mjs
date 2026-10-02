// #560 Leave — hold the trail. Unknown stays accum.

export const TRAIL_MODES = ['accum', 'echo', 'leave', 'ribbon', 'comet'];

export function resolveTrail(value) {
  return TRAIL_MODES.includes(value) ? value : 'accum';
}

export function isLeave(value) {
  return resolveTrail(value) === 'leave';
}
