// davisState.js — Davis, the generator: five states, every one a measurement (#1126).
//
// LOIS judges the product; Davis loves the process. Same honest feed (curator/loisActivity.js), opposite
// philosophy. Each state below reads named fields of that feed and nothing else, with a threshold you can read
// here and tune by feel. No timer has an opinion: when no signal is true, Davis has NO state (silence is default,
// DS rule 4), he is not invented into FLOW.
//
//   BLOOM     a keep that followed a run of passes ("the ugly paid off"); holds a minute (the matrix says "savor it")
//   UGLY      heavy passing: rolls that replaced a frame nobody kept ("sifting through the ugly", his words)
//   STUCK     one seed for a long time, rolled on repeatedly, nothing kept
//   SEEDLING  a fresh seed just dropped
//   FLOW      rolls at a good clip
// Priority: BLOOM > UGLY > STUCK > SEEDLING > FLOW > (none).
//
// A PASS is a roll (CURATOR, a KIN tap, or an EVOLVE fire) that replaced a frame nobody kept. EVOLVE fires count:
// with LOIS away and the generator running unattended, the room is DAVIS ALONE, and that is only honest if
// Davis's own fires are in the feed.

export const DAVIS_FLOW_ROLLS = 3; // rolls...
export const DAVIS_FLOW_WINDOW_MS = 60 * 1000; // ...inside this window
export const DAVIS_UGLY_PASSES = 5; // passes...
export const DAVIS_UGLY_WINDOW_MS = 2 * 60 * 1000; // ...inside this window
export const DAVIS_SEEDLING_MS = 20 * 1000; // a seed this young is a seedling
export const DAVIS_STUCK_MS = 2 * 60 * 1000; // one seed this long...
export const DAVIS_STUCK_ROLLS = 6; // ...rolled on at least this many times, nothing kept
export const DAVIS_BLOOM_MS = 60 * 1000; // the payoff holds this long

export const DAVIS_STATES = {
  BLOOM: { code: 'BLOOM', label: 'The ugly paid off.' },
  UGLY: { code: 'UGLY', label: 'Sifting through the ugly.' },
  STUCK: { code: 'STUCK', label: 'Same seed, nothing kept.' },
  SEEDLING: { code: 'SEEDLING', label: 'A fresh seed.' },
  FLOW: { code: 'FLOW', label: 'Rolling at a good clip.' },
};

/** @param {object} feed loisActivity.snapshot() @returns {{code:string,label:string}|null} */
export function resolveDavisState(feed = {}) {
  const f = feed || {};
  if (f.bloomAgeMs != null && f.bloomAgeMs < DAVIS_BLOOM_MS) return DAVIS_STATES.BLOOM;
  if ((f.passesLast2m || 0) >= DAVIS_UGLY_PASSES) return DAVIS_STATES.UGLY;
  if ((f.seedAgeMs || 0) >= DAVIS_STUCK_MS && (f.rollsSinceSeed || 0) >= DAVIS_STUCK_ROLLS && !f.keptThisSeed) return DAVIS_STATES.STUCK;
  if (f.seedDropped && (f.seedAgeMs ?? Infinity) < DAVIS_SEEDLING_MS) return DAVIS_STATES.SEEDLING;
  if ((f.rollsLastMinute || 0) >= DAVIS_FLOW_ROLLS) return DAVIS_STATES.FLOW;
  return null;
}
