// personas/bandLive.js — #2387 (P7): the thin live adapter. The band plays on the phrase clock.
//
//   clock:bar                  a phrase boundary (every PHRASE_BARS): the band plays one phrase (band.mjs stepBand)
//   audio:silenceStart / End   the bandleader calls the ending while the room is silent
//
// OPT-IN, default OFF (`window.__KC_BAND === true`, like the other DEV flags; per machine, never saved in a project).
// Off, this adapter subscribes to nothing it acts on and publishes nothing: the instrument is byte-identical.
// On, with the shipped tuning table (the band's numbers are unruled — null), `stepBand` returns no turn and says what
// is missing; the view carries that list. Muted while a take plays (the take's own rows speak, bandRecord.mjs).
// Every turn is announced on the bus (`band:turn`), handed to the take's recorder, and shown in the view. Nothing
// here changes the stage: a turn says who owns the next move and by how much; the movers that read it are later slices.
// Determinism: no clock, no die — a turn is a pure function of the seed, the phrase and what the readers said.
import { on, emit, Events } from '../composition/eventBus.js';
import { PHRASE_BARS } from '../curator/paceLive.js';
import { personaTuning } from './tuning.mjs';
import { createBandState, stepBand, bandReadiness } from './band.mjs';
import { noteBandTurn } from './bandRecord.mjs';

/** Is the band switched on (per machine, off by default)? */
export function bandOn() {
  try {
    return globalThis.__KC_BAND === true;
  } catch {
    return false;
  }
}

const LOG_MAX = 12;
let view = null;
const subs = new Set();
/** The latest band view for DEV readouts, or null when the adapter is not running. */
export function getBandView() {
  return view;
}
/** Called when the view changes; returns the unsubscribe. */
export function subscribeBand(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}
const notify = () => {
  for (const f of subs) {
    try {
      f();
    } catch {
      /* a listener must not stop the band */
    }
  }
};

/**
 * @param getSeed      () => the seed the band draws from (the store's seed)
 * @param getPressure  () => 0..1, how hard the room is pressed (the bandleader cuts past the tuned line)
 * @param getHold      () => { keep?: boolean, lock?: boolean | string[] } the artist's hand; it always wins
 * @param isReplaying  () => true while a take plays
 * @param enabled      () => boolean, read at every phrase (default: bandOn)
 * @param getTuning    () => the tuning table in force (default: personaTuning)
 * @returns stop()
 */
export function startBand({
  getSeed,
  getPressure = () => 0,
  getHold = () => ({}),
  isReplaying = () => false,
  enabled = bandOn,
  getTuning = personaTuning,
}) {
  let state = createBandState();
  let silent = false;
  let bar = -1;
  const log = [];
  const stops = [];

  const publish = (extra) => {
    view = { on: true, ...extra, state, log: log.slice() };
    notify();
  };

  stops.push(on(Events.AUDIO_SILENCE_START, () => (silent = true)));
  stops.push(on(Events.AUDIO_SILENCE_END, () => (silent = false)));
  stops.push(
    on(Events.CLOCK_BAR, (p) => {
      if (!p || !Number.isInteger(p.bar)) return;
      if (p.bar < bar) {
        // the bar counter went backwards (REC restarted the scene): a fresh band, counted in again
        state = createBandState();
        log.length = 0;
      }
      bar = p.bar;
      if (p.bar % PHRASE_BARS !== 0) return;
      if (isReplaying() || !enabled()) return;
      let ctx;
      let seed;
      try {
        ctx = { phrase: p.bar / PHRASE_BARS, pressure: getPressure(), hold: getHold(), ending: silent };
        seed = getSeed();
      } catch {
        return;
      }
      const res = stepBand(state, ctx, { seed, tuning: getTuning() });
      state = res.state;
      for (const turn of res.turns) {
        emit(Events.BAND_TURN, turn, { cause: 'band' });
        noteBandTurn(turn);
        log.unshift(turn);
        if (log.length > LOG_MAX) log.length = LOG_MAX;
      }
      publish({ ready: bandReadiness(getTuning()).ready, unruled: res.unruled ? res.unruled.length : 0 });
    }),
  );
  return () => {
    for (const off of stops) off();
    view = null;
    notify();
  };
}
