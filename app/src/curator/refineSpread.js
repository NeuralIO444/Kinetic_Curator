// refineSpread.js — the live "how far" dial for refine mutations (#1144). A module singleton, like phase.js.
// Only the tuning overlay (?tune=refine) ever writes it; nothing persists it by default, so shipping the default
// is a one-line constant change once Matt has felt out the value.
import { DEFAULT_SPREAD, clampSpread } from './refineMutate.js';

let spread = DEFAULT_SPREAD;
export function getRefineSpread() {
  return spread;
}
export function setRefineSpread(v) {
  spread = clampSpread(v);
  return spread;
}
/** Tests only. */
export function resetRefineSpread() {
  spread = DEFAULT_SPREAD;
}

/** True when the page was opened with ?tune=refine (the dial overlay mounts only then). */
export const TUNE_REFINE =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('tune') === 'refine';
