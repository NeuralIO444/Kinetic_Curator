// mindDemo.js — #1462: a stand-in model backend for REVIEWING the face blend, on ?debug=mind only.
//
// Until the Apple Intelligence helper exists (Mind 2, #1463) nothing ever requests a face state: the rules only report
// the face the room already shows. With ?debug=mind on the URL this stand-in answers instead, so the blend can be seen
// end to end through the real path (thinker → request on the downbeat → face). Its decisions are recorded as
// backend 'demo', never as 'apple'. Pure: a deterministic function of (persona, bar); no clock, no network.
export const DEBUG_MIND =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === 'mind';

const LOIS_SHOW = [
  { id: 'side-eye', intensity: 0.9, decay: 2 },
  { id: 'BURN', intensity: 1, decay: 2 },
  { id: 'unimpressed', intensity: 0.6, decay: 3 },
];
const DAVIS_SHOW = [
  { id: 'BLOOM', intensity: 1, decay: 2 },
  { id: 'tinkering', intensity: 0.8, decay: 2 },
];

/**
 * Once every 8 bars LOIS tries a state (bars 0-1 of each 8), Davis halfway (bars 4-5); otherwise a plain reading.
 * Two-bar windows because a model is asked every other bar (one in flight, its reply lands a bar later).
 */
export function demoReply(persona, bar) {
  const k = Math.floor(bar / 8);
  if (persona === 'lois')
    return bar % 8 < 2 ? { critique: null, state: LOIS_SHOW[k % LOIS_SHOW.length] } : { critique: null };
  if (persona === 'davis')
    return bar % 8 >= 4 && bar % 8 < 6
      ? { propose: null, state: DAVIS_SHOW[k % DAVIS_SHOW.length] }
      : { propose: null };
  return { mood: 'calm', lean: {} };
}

/** The demo as a model backend for startMind. The reply is asked for one bar and lands on the next. */
export const demoModel = Object.freeze({
  name: 'demo',
  available: () => true,
  ask: (persona, _context, { bar }) => Promise.resolve(demoReply(persona, bar + 1)),
});
