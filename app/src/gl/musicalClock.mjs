// musicalClock.mjs — #1458: musical time (bar, beat, phase) on the LOOP clock.
//
// Matt (2026-10-13): the clock runs on loop time, never AudioContext time, so a take replays exactly with or without
// audio on any machine. Audio may NUDGE the tempo (the BPM passed in); it never drives the clock. Pure: the same
// sequence of (loopMs, bpm) gives the same bars, beats and ticks. No Date.now, no performance.now, no timers.
//
// Beat position is INTEGRATED (pos += dt * bpm / 60000), so a tempo change bends the future and never jumps the
// past: bar and beat do not skip when the BPM moves.
import { sanitizeBeatBpm } from './beatClock.mjs';

export const BEATS_PER_BAR = 4;
/** Most ticks one advance may report (a stalled tab must not flood the bus; the loop clock already clamps dt). */
export const MAX_TICKS_PER_ADVANCE = 8;
/** Beats are integrated in floating point; 2 beats at 120 BPM must land at exactly 1000 ms, not 1.9999999999. */
const EPS = 1e-9;
const whole = (x) => Math.floor(x + EPS);

/**
 * @param beatsPerBar  beats in a bar (4/4 by default)
 * @returns { advance(loopMs, bpm) -> { pos, bar, beat, phase, bpm, ticks, restarted }, now(), reset() }
 *   ticks: [{ type: 'beat' | 'bar', bar, beat, bpm }] in order, for each whole beat crossed (a 'bar' tick follows the
 *   'beat' tick that starts a bar). bar and beat are 0-based; phase is 0..1 within the beat.
 */
export function createMusicalClock({ beatsPerBar = BEATS_PER_BAR } = {}) {
  const per = Number.isInteger(beatsPerBar) && beatsPerBar > 0 ? beatsPerBar : BEATS_PER_BAR;
  let last = null; // loop ms at the last advance
  let pos = 0; // beats since the clock was armed
  let bpm = 120;
  const view = () => {
    const w = whole(pos);
    return { pos, bar: Math.floor(w / per), beat: w % per, phase: Math.max(0, pos - w), bpm };
  };
  return {
    advance(loopMs, rawBpm) {
      bpm = sanitizeBeatBpm(rawBpm);
      const t = Number(loopMs);
      if (!Number.isFinite(t)) return { ...view(), ticks: [], restarted: false };
      if (last === null) { last = t; return { ...view(), ticks: [], restarted: false }; }
      if (t < last) { // the loop clock went back (REC restarts the scene): start the bars over from here
        last = t; pos = 0;
        return { ...view(), ticks: [], restarted: true };
      }
      const before = whole(pos);
      pos += ((t - last) * bpm) / 60000;
      last = t;
      const after = whole(pos);
      const ticks = [];
      const from = Math.max(before + 1, after - MAX_TICKS_PER_ADVANCE + 1);
      for (let b = from; b <= after; b++) {
        const beat = b % per; const bar = Math.floor(b / per);
        ticks.push({ type: 'beat', bar, beat, bpm });
        if (beat === 0) ticks.push({ type: 'bar', bar, beat, bpm });
      }
      return { ...view(), ticks, restarted: false };
    },
    now: view,
    reset() { last = null; pos = 0; },
  };
}
