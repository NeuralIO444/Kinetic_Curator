// clockLive.js — #1458: the live driver of the musical clock. One call per resolved frame with the loop time and the
// BPM; it publishes clock:beat / clock:bar for each tick, stamps the envelope with the clock's musical time, and
// releases quantised emits (emitOn) on the tick they were waiting for.
//
// The bus carries decisions, not frames: there is no per-frame tick event. The renderer and the personas read the
// phase straight from now() every frame.
import { createMusicalClock } from '../gl/musicalClock.mjs';
import { emit, Events, setStampProvider, releaseTick, clearPending, resetEnvelope } from './eventBus.js';

const clock = createMusicalClock();
let loopMs = 0;

setStampProvider(() => ({ loopMs, ...stampOf(clock.now()) }));
const stampOf = (v) => ({ bar: v.bar, beat: v.beat, phase: +v.phase.toFixed(4), bpm: v.bpm });

/** The musical time right now: { pos, bar, beat, phase, bpm }. */
export function getMusicalTime() {
  return clock.now();
}

/** Drive the clock. Returns the tick list (the bus has already been told). */
export function observeClock(loopTimeMs, bpm) {
  const r = clock.advance(loopTimeMs, bpm);
  if (Number.isFinite(loopTimeMs)) loopMs = loopTimeMs;
  if (r.restarted) { clearPending(); resetEnvelope(); } // a restarted scene starts a fresh take's sequence
  for (const t of r.ticks) {
    if (t.type === 'beat') {
      emit(Events.CLOCK_BEAT, { bar: t.bar, beat: t.beat, bpm: t.bpm }, { cause: 'clock' });
      releaseTick('beat');
    } else {
      emit(Events.CLOCK_BAR, { bar: t.bar, bpm: t.bpm }, { cause: 'clock' });
      releaseTick('bar');
    }
  }
  return r.ticks;
}

/** Start over (tests; a take begins from a fresh clock). */
export function resetClock() {
  clock.reset(); loopMs = 0; clearPending(); resetEnvelope();
}
