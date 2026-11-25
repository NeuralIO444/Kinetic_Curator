// beatSynthLive.js — #2389 (Persona Kernel P9, spec §4 Q10): her beats, audible. OPT-IN, OFF by default.
//
// Switch: `globalThis.__KC_QUEEN_AUDIBLE === true` (a DEV flag like the band's; per machine, read on every tick, never
// saved in a project). Off — the default — this driver makes no AudioContext and plays nothing.
// On, it still waits for an explicit user gesture (a pointer or key press) before it creates or resumes an
// AudioContext: no autoplay, per the browser's policy. With no AudioContext at all (a sandbox, node, a test) it is a
// silent no-op.
//
// What it plays: the pattern the silent set is playing right now (setLive.js), at the set's own mix, synthesized from
// the pattern data by four drum-machine voices (beatSynth.mjs: kick, snare, hats, bass — oscillators and filtered
// noise, no samples). Quiet, tight and dry by default (Matt, 2026-11-19): a low master, short voices, no reverb — it
// sits under live audio and never fights it. DEV-only: __KC_QUEEN_AUDIBLE_VOLUME and __KC_QUEEN_AUDIBLE_TONE (0..1). It YIELDS the moment live audio arrives: the master is cut and disconnected on that tick.
//
// OUTPUT ONLY. It reads the set's pattern and mix, the musical clock and whether live audio is on; it writes nothing
// back — not to the band feed, the store, the bus or a take. AudioContext time schedules the sound and nothing else;
// a take records and replays exactly what it did without it.
import { AUDIBLE_DEFAULTS, scheduleWindow, secondsPerBeat, voiceAt } from './beatSynth.mjs';

/** Is the audible layer switched on (per machine, off by default)? */
export function audibleOn() {
  try {
    return globalThis.__KC_QUEEN_AUDIBLE === true;
  } catch {
    return false;
  }
}

/**
 * Set the same switch the console sets (the DEV panel's neutral `audible beats` row): on writes `true`, off removes
 * it. The flag's name stays in this driver (queenDeniability). Read on every tick, so it takes effect live; on, the
 * next pointer or key press opens the AudioContext as before. Never saved. The volume/tone levers stay console-only.
 */
export function setAudibleOn(value) {
  try {
    if (value === true) globalThis.__KC_QUEEN_AUDIBLE = true;
    else delete globalThis.__KC_QUEEN_AUDIBLE;
  } catch {
    /* a frozen global: the switch stays as it was */
  }
  return audibleOn();
}

/** How far ahead the driver schedules, in beats, and how often it wakes, in ms (the WebAudio look-ahead idiom). */
export const LOOKAHEAD_BEATS = 0.25;
export const TICK_MS = 25;
/** The master level at full mix: quiet by default (Matt, 2026-11-19). DEV override: __KC_QUEEN_AUDIBLE_VOLUME. */
export const MASTER_GAIN = AUDIBLE_DEFAULTS.volume;

const devNumber = (key, fallback) => {
  try {
    const v = globalThis[key];
    return typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;
  } catch {
    return fallback;
  }
};
/** The DEV volume (0..1) in force: the flag, else the quiet default. */
export const audibleVolume = () => devNumber('__KC_QUEEN_AUDIBLE_VOLUME', AUDIBLE_DEFAULTS.volume);
/** The DEV tone (0..1) in force: the flag, else the voices as written. */
export const audibleTone = () => devNumber('__KC_QUEEN_AUDIBLE_TONE', AUDIBLE_DEFAULTS.tone);

const defaultContext = () => {
  try {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    return typeof AC === 'function' ? new AC() : null;
  } catch {
    return null;
  }
};

// one second of white noise from a fixed LCG (no Math.random anywhere, even in the output layer)
function noiseBuffer(ctx) {
  const n = Math.max(1, Math.round(ctx.sampleRate || 44100));
  const buf = ctx.createBuffer(1, n, ctx.sampleRate || 44100);
  const d = buf.getChannelData(0);
  let x = 0x2389;
  for (let i = 0; i < n; i++) {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    d[i] = (x / 0x100000000) * 2 - 1;
  }
  return buf;
}

/** Sound one hit of `voice` at context time `at` into `out`. */
function strike(ctx, out, noise, voice, amp, at, tone) {
  const v = voiceAt(voice, tone);
  if (!v) return;
  const g = ctx.createGain();
  g.gain.setValueAtTime(v.gain * amp, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + v.decay);
  let src;
  if (v.source === 'noise') {
    src = ctx.createBufferSource();
    src.buffer = noise;
  } else {
    src = ctx.createOscillator();
    src.type = v.source;
    src.frequency.setValueAtTime(v.freq, at);
    if (v.freqEnd) src.frequency.exponentialRampToValueAtTime(v.freqEnd, at + v.sweep);
  }
  let head = src;
  if (v.filter) {
    const f = ctx.createBiquadFilter();
    f.type = v.filter;
    f.frequency.setValueAtTime(v.cutoff, at);
    head.connect(f);
    head = f;
  }
  head.connect(g);
  g.connect(out);
  if (v.tone) {
    // the snare's body: a short tone under the noise
    const o = ctx.createOscillator();
    const og = ctx.createGain();
    o.frequency.setValueAtTime(v.tone, at);
    og.gain.setValueAtTime(v.gain * amp * 0.5, at);
    og.gain.exponentialRampToValueAtTime(0.0001, at + v.decay * 0.6);
    o.connect(og);
    og.connect(out);
    o.start(at);
    o.stop(at + v.decay);
  }
  src.start(at);
  src.stop(at + v.decay + 0.02);
}

/**
 * @param getPattern   () => the set's current pattern (kc-beat/1) or null
 * @param getMix       () => the set's mix 0..1 (0 = the set is not playing)
 * @param getTime      () => { pos, bpm } the musical clock (beats since start, and the BPM)
 * @param isLiveAudio  () => true once live audio is on (she yields at once)
 * @param enabled      () => boolean (default: audibleOn)
 * @param makeContext  () => an AudioContext or null (default: the browser's, or null where there is none)
 * @param target       where the user gesture is heard (default: window); nothing without addEventListener
 * @returns stop()
 */
export function startAudibleBeats({
  getPattern,
  getMix,
  getTime,
  isLiveAudio = () => false,
  enabled = audibleOn,
  makeContext = defaultContext,
  target = typeof window !== 'undefined' ? window : null,
  setTimer = (fn, ms) => setInterval(fn, ms),
  clearTimer = (id) => clearInterval(id),
} = {}) {
  let ctx = null;
  let noise = null;
  let master = null;
  let scheduledTo = null;
  let timer = null;
  let tick = () => {};

  const gesture = () => {
    if (ctx || !enabled()) return;
    ctx = makeContext();
    if (!ctx) return;
    try {
      noise = noiseBuffer(ctx);
      if (ctx.state === 'suspended' && typeof ctx.resume === 'function') ctx.resume().catch(() => {});
    } catch {
      ctx = null;
      return;
    }
    // the clock only starts once there is something to play through: off, the driver never wakes
    if (timer === null) timer = setTimer(() => tick(), TICK_MS);
  };
  const events = ['pointerdown', 'keydown'];
  const listening = !!(target && typeof target.addEventListener === 'function');
  if (listening) for (const e of events) target.addEventListener(e, gesture, { passive: true });

  const quiet = () => {
    scheduledTo = null;
    if (!master) return;
    try {
      master.gain.cancelScheduledValues(0);
      master.gain.setValueAtTime(0, ctx.currentTime);
      master.disconnect();
    } catch {
      /* already gone */
    }
    master = null;
  };

  tick = () => {
    if (!enabled() || !ctx) return quiet();
    let read;
    try {
      read = { live: isLiveAudio() === true, pattern: getPattern(), mix: Number(getMix()) || 0, time: getTime() };
    } catch {
      return quiet();
    }
    const { live, pattern, mix, time } = read;
    if (live || !pattern || !(mix > 0) || !time || !Number.isFinite(time.pos)) return quiet();
    try {
      if (!master) {
        master = ctx.createGain();
        master.connect(ctx.destination);
      }
      master.gain.setValueAtTime(audibleVolume() * Math.min(1, mix), ctx.currentTime);
      const tone = audibleTone();
      const spb = secondsPerBeat(time.bpm);
      let from = scheduledTo;
      if (from === null || from < time.pos - 1 || from > time.pos + 1) from = time.pos; // a seek or a restart
      const to = time.pos + LOOKAHEAD_BEATS;
      for (const h of scheduleWindow(pattern, from, to))
        strike(
          ctx,
          master,
          noise,
          h.voice,
          h.amp,
          Math.max(ctx.currentTime, ctx.currentTime + (h.beat - time.pos) * spb),
          tone,
        );
      scheduledTo = Math.max(from, to);
    } catch {
      quiet();
    }
  };
  return () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
    if (listening) for (const e of events) target.removeEventListener(e, gesture);
    quiet();
    if (ctx && typeof ctx.close === 'function') ctx.close().catch(() => {});
    ctx = null;
  };
}
