// breakTrigger.js — #2116 assemble: the trigger fold. Turns the recorded trigger counters into the two stamps the assemble
// kineme reads on the KINEME CLOCK (never the wall clock), so a take replays it.
//
//   Event handlers (curator/breakLive.js) never touch time: they bump a monotone recorded input,
//   `breakSeq = { out, in }` — `out` a strong audio hit (a scatter), `in` a landing or a downbeat after a scatter (a settle).
//   The first frame this fold sees a counter move it stamps that frame's kineme time. Given the same recorded frames it gives
//   the same stamps; snapshotState / restoreState carry it with the clock, as createKinemeClock does.
//
//   at(seq, t) -> [tOut, tIn] (NEVER = -1e30 for "never") while a trigger is live, null when none is (idle, or fully settled).
//   null is what keeps an untouched scene's contract — and every still, export and golden — exactly what it was.
//
// Pure, browser-safe, no clock of its own.
import { KINEMES, ASSEMBLE_RIPPLE, ASSEMBLE_HOLD_PERIODS } from '../../data/kinemes.js';

export const BREAK_NEVER = -1e30;
const PER = KINEMES.find((k) => k.id === 'assemble').period;
/** Seconds after a settle starts at which every piece is exactly home (the last piece's ripple delay + one settle). */
export const BREAK_SETTLED_AFTER = (1 + ASSEMBLE_RIPPLE) * PER;
/** A scatter nobody settles (no downbeat: the clock is not running) settles itself this many seconds after it flew out. */
export const BREAK_HOLD_MAX = ASSEMBLE_HOLD_PERIODS * PER;

const count = (x) => (Number.isFinite(x) && x > 0 ? Math.floor(x) : 0);

export function createBreakTrigger() {
  let init = false;
  let seenOut = 0;
  let seenIn = 0;
  let tOut = BREAK_NEVER;
  let tIn = BREAK_NEVER;
  let last = 0;

  const rest = () => {
    tOut = BREAK_NEVER;
    tIn = BREAK_NEVER;
  };

  function at(seq, tRaw) {
    const t = Number.isFinite(tRaw) ? tRaw : 0;
    const out = count(seq && seq.out);
    const inn = count(seq && seq.in);
    if (!init) {
      // The first frame adopts the counters as already seen: a take that starts with counters at n does not open displaced.
      init = true;
      seenOut = out;
      seenIn = inn;
      last = t;
      return null;
    }
    if (t < last) {
      // Time ran backwards (a loop restart, a rewind): nothing is live; the counters are re-adopted.
      rest();
      seenOut = out;
      seenIn = inn;
      last = t;
      return null;
    }
    last = t;
    if (out > seenOut) {
      // A hit scatters only pieces that are home: one already out (or mid-settle) would snap back to start the new flight.
      if (tOut === BREAK_NEVER && tIn === BREAK_NEVER) tOut = t;
      seenOut = out;
    }
    if (inn > seenIn) {
      tIn = t;
      seenIn = inn;
    }
    // A scatter that was never settled settles itself, so a piece is never stranded.
    if (tOut > tIn && t - tOut >= BREAK_HOLD_MAX) tIn = tOut + BREAK_HOLD_MAX;
    // Fully home: forget it, so the contract goes back to carrying nothing.
    if (tIn >= tOut && tIn > BREAK_NEVER && t - tIn >= BREAK_SETTLED_AFTER) rest();
    if (tOut === BREAK_NEVER && tIn === BREAK_NEVER) return null;
    return [tOut, tIn];
  }

  return {
    at,
    snapshotState: () => ({ init, seenOut, seenIn, tOut, tIn, last }),
    restoreState(s) {
      if (!s || typeof s !== 'object') return;
      init = !!s.init;
      seenOut = count(s.seenOut);
      seenIn = count(s.seenIn);
      tOut = Number.isFinite(s.tOut) ? s.tOut : BREAK_NEVER;
      tIn = Number.isFinite(s.tIn) ? s.tIn : BREAK_NEVER;
      last = Number.isFinite(s.last) ? s.last : 0;
    },
  };
}
