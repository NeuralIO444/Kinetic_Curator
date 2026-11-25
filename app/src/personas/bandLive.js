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
//
// #2389 (P9) — the rhythm section's seat, wired: after each phrase's turns, her timing lean on each turn (getTiming,
// hosted by the Director: when a horn comes in, how long a solo breathes, how tight a trade sits — never who or what)
// and, at most once a phrase when her eyes are ruled and a local vision model is linked, one look at the frame
// (eyes). Both are noted to rhythmRecord.mjs (the holder + the take's band.rhythm). Neither is on the band's view,
// the bus or any surface. Unruled (null) shares lean nothing; an unruled cadence never looks.
import { on, emit, Events } from '../composition/eventBus.js';
import { PHRASE_BARS } from '../curator/paceLive.js';
import { personaTuning } from './tuning.mjs';
import { createBandState, stepBand, bandReadiness } from './band.mjs';
import { noteBandTurn, noteBandHeads } from './bandRecord.mjs';
import { noteRhythmTiming, noteRhythmLook, resetRhythm } from './rhythmRecord.mjs';
import { shouldLook } from './rhythmVision.mjs';

/** Is the band switched on (per machine, off by default)? */
export function bandOn() {
  try {
    return globalThis.__KC_BAND === true;
  } catch {
    return false;
  }
}

/** Set the same switch the console sets (the DEV panel's band row): on writes `true`, off removes it. Never saved. */
export function setBandOn(value) {
  try {
    if (value === true) globalThis.__KC_BAND = true;
    else delete globalThis.__KC_BAND;
  } catch {
    /* a frozen global: the switch stays as it was */
  }
  return bandOn();
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
 * @param getHeads     () => the steering bundle of earned-in persona heads, or null (Adapters A1, #2394;
 *                     default: none — the band plays on rules exactly as before A1). Read per phrase,
 *                     like the tuning; the bundle is data, built by the caller from the loaded taste.
 * @param getTiming    (turn, look) => her timing lean on one turn, or null (#2389; default: none)
 * @param eyes         { canLook(), look(): Promise<{ motion } | null> } her eyes, or null (#2389; default: none)
 * @returns stop()
 */
export function startBand({
  getSeed,
  getPressure = () => 0,
  getHold = () => ({}),
  isReplaying = () => false,
  enabled = bandOn,
  getTuning = personaTuning,
  getHeads = null,
  getTiming = null,
  eyes = null,
}) {
  let state = createBandState();
  let stopped = false;
  let lastLook = null; // her latest reading { motion }, applied to the turns after it
  let lastLookPhrase = null;
  let looking = false;
  let silent = false;
  let bar = -1;
  const log = [];
  const stops = [];

  const publish = (extra) => {
    view = { on: true, ...extra, state, log: log.slice() };
    notify();
  };

  // her eyes: at most once a phrase, only on a ruled cadence, only with a local vision model; the reading arrives later
  // and leans the turns AFTER it (it never re-times a turn already played)
  const lookMaybe = (phrase, tuning) => {
    let every;
    try {
      every = tuning.personas.queen.knobs.vision.everyPhrases;
    } catch {
      every = null;
    }
    if (!shouldLook({ phrase, lastLookPhrase, everyPhrases: every, inFlight: looking })) return;
    if (!eyes.canLook()) return;
    looking = true;
    lastLookPhrase = phrase;
    Promise.resolve()
      .then(() => eyes.look())
      .catch(() => null)
      .then((r) => {
        looking = false;
        if (!r || stopped || isReplaying() || !enabled()) return;
        lastLook = { motion: r.motion };
        noteRhythmLook({ phrase, motion: r.motion });
      });
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
        lastLook = null;
        lastLookPhrase = null;
        resetRhythm();
      }
      bar = p.bar;
      if (p.bar % PHRASE_BARS !== 0) return;
      if (isReplaying() || !enabled()) return;
      let ctx;
      let seed;
      let heads;
      try {
        ctx = { phrase: p.bar / PHRASE_BARS, pressure: getPressure(), hold: getHold(), ending: silent };
        seed = getSeed();
        heads = getHeads ? getHeads() : null;
      } catch {
        return;
      }
      const res = stepBand(state, ctx, { seed, tuning: getTuning(), heads: heads || null });
      state = res.state;
      if (res.steered && res.steered.length) noteBandHeads(res.steered); // A1: the take stamps who steered
      for (const turn of res.turns) {
        emit(Events.BAND_TURN, turn, { cause: 'band' });
        noteBandTurn(turn);
        log.unshift(turn);
        if (log.length > LOG_MAX) log.length = LOG_MAX;
        if (getTiming) {
          let t;
          try {
            t = getTiming(turn, lastLook);
          } catch {
            t = null;
          }
          if (t) noteRhythmTiming(t);
        }
      }
      if (eyes && res.unruled === null) lookMaybe(ctx.phrase, getTuning());
      publish({ ready: bandReadiness(getTuning()).ready, unruled: res.unruled ? res.unruled.length : 0 });
    }),
  );
  return () => {
    stopped = true;
    for (const off of stops) off();
    resetRhythm();
    view = null;
    notify();
  };
}
