// patternAudio.mjs — apply the #1110 pattern.* route outputs to the RESOLVED pattern tracks.
//
// A route output is an offset added to each pattern track's own value, then clamped to that param's range
// by sanitizePattern. It is applied to the per-frame resolved block, which is replaced, never mutated:
// the stored `layer.pattern` is untouched, so a route never reaches a saved project (as hue does not).
// An empty or absent output returns the very same array, so the default table renders exactly as before.
// The offsets are non-finite-safe: junk is ignored, never poisons a frame.
import { sanitizePattern } from '../state/patternTrack.js';

/** @param {Array} resolved resolveLayers output  @param {object|undefined} offsets { drift?, mix?, hero?, grout?, density? } */
export function applyPatternAudio(resolved, offsets) {
  if (!offsets || !Array.isArray(resolved)) return resolved;
  const keys = Object.keys(offsets).filter((k) => Number.isFinite(offsets[k]) && offsets[k] !== 0);
  if (!keys.length) return resolved;
  for (const rl of resolved) {
    if (!rl || !rl.isPattern) continue;
    const next = { ...rl.pattern };
    for (const k of keys) next[k] = (Number(next[k]) || 0) + offsets[k];
    rl.pattern = sanitizePattern(next);
  }
  return resolved;
}
