// beatSynth.mjs — #2389 (Persona Kernel P9, spec §4 Q10): the drum machine's score, pure.
//
// Her beats may be heard (opt-in, off by default): synthesized live from the pattern data (kc-beat/1) with four
// drum-machine voices — kick, snare, hats, bass. No samples, no recordings, nothing to license. This module is the
// SCORE only: which voice sounds at which beat, how loud, and each voice's synthesis recipe as plain numbers. It
// knows no AudioContext (the live driver, beatSynthLive.js, owns that), no clock and no die — so a pattern at a beat
// position always schedules the same hits, exactly as beatPlayer.mjs always gives the same silent levels.
//
// Output only: nothing here, and nothing the driver does with it, feeds back into the band feed, the stage, the store
// or a take. The silent set (setLive.js / beatPlayer.mjs) is unchanged whether or not anyone is listening.
import { STEPS, LANES } from './beatLibrary.js';

/**
 * The four voices, as synthesis recipes (oscillator / filtered noise, envelope in seconds). Data, not samples.
 * Matt's ruling (2026-11-19): quiet, tight and dry — short voices, no reverb, no delay, no tail — so it sits under live
 * audio and never fights it. Nothing in this module or the driver adds any space (no convolver, no feedback).
 */
export const VOICES = Object.freeze({
  kick: Object.freeze({ source: 'sine', freq: 140, freqEnd: 50, sweep: 0.06, decay: 0.16, gain: 0.9 }),
  snare: Object.freeze({ source: 'noise', filter: 'bandpass', cutoff: 1800, tone: 185, decay: 0.08, gain: 0.45 }),
  hat: Object.freeze({ source: 'noise', filter: 'highpass', cutoff: 7000, decay: 0.03, gain: 0.25 }),
  bass: Object.freeze({ source: 'triangle', freq: 55, filter: 'lowpass', cutoff: 420, decay: 0.14, gain: 0.55 }),
});

/**
 * The audible layer's defaults (Matt, 2026-11-19: quiet, tight, dry). DEV-only overrides, never rendered, never saved:
 * `globalThis.__KC_QUEEN_AUDIBLE_VOLUME` (0..1, the master at full mix) and `globalThis.__KC_QUEEN_AUDIBLE_TONE`
 * (0..1: darker below 0.5, brighter above; 0.5 is the voices as written). The DEV toggle that will expose them lands
 * in a later PR.
 */
export const AUDIBLE_DEFAULTS = Object.freeze({ volume: 0.2, tone: 0.5 });

/** A voice's recipe at a tone 0..1: filter cutoffs scale ×0.5 (dark) .. ×2 (bright); nothing else moves. Pure. */
export function voiceAt(voice, tone = AUDIBLE_DEFAULTS.tone) {
  const v = VOICES[voice];
  if (!v) return null;
  const t = Number.isFinite(tone) ? Math.min(1, Math.max(0, tone)) : AUDIBLE_DEFAULTS.tone;
  if (!v.cutoff) return v;
  return { ...v, cutoff: v.cutoff * 2 ** ((t - 0.5) * 2) };
}

/** A full hit and a soft one. */
export const HIT_AMP = Object.freeze({ x: 1, o: 0.5 });
/** Steps per beat (sixteenths of a 4-beat bar). */
export const STEPS_PER_BEAT = STEPS / 4;

/** Seconds per beat at a BPM (a bad BPM reads as 120). */
export function secondsPerBeat(bpm) {
  const b = Number(bpm);
  return 60 / (Number.isFinite(b) && b > 0 ? b : 120);
}

/** The beat position a step k (any integer, past bars included) lands on, with the pattern's swing on odd steps. */
export function stepBeat(k, swing = 0) {
  const s = Number.isFinite(swing) ? Math.min(0.5, Math.max(0, swing)) : 0;
  return (k + (((k % 2) + 2) % 2 === 1 ? s : 0)) / STEPS_PER_BEAT;
}

/** The hits on one step k: [{ voice, amp }] in lane order (kick, snare, hat, bass). */
export function stepHits(pattern, k) {
  const out = [];
  if (!pattern || !pattern.lanes) return out;
  const i = ((k % STEPS) + STEPS) % STEPS;
  for (const lane of LANES) {
    const c = pattern.lanes[lane] && pattern.lanes[lane][i];
    if (c === 'x' || c === 'o') out.push({ voice: lane, amp: HIT_AMP[c] });
  }
  return out;
}

/**
 * Every hit whose (swung) beat falls in [fromBeat, toBeat): [{ voice, amp, beat, step }], in time order. Pure: the
 * look-ahead window the driver schedules. An empty or inverted window, or no pattern, schedules nothing.
 */
export function scheduleWindow(pattern, fromBeat, toBeat) {
  const out = [];
  if (!pattern || !Number.isFinite(fromBeat) || !Number.isFinite(toBeat) || !(toBeat > fromBeat)) return out;
  const swing = pattern.swing || 0;
  const k0 = Math.floor(fromBeat * STEPS_PER_BEAT) - 1; // a swung odd step from just before may land inside
  const k1 = Math.ceil(toBeat * STEPS_PER_BEAT);
  for (let k = k0; k <= k1; k++) {
    const beat = stepBeat(k, swing);
    if (beat < fromBeat || beat >= toBeat) continue;
    for (const h of stepHits(pattern, k)) out.push({ ...h, beat, step: ((k % STEPS) + STEPS) % STEPS });
  }
  return out;
}
