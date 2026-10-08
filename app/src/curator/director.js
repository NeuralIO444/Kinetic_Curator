// director.js — the Left4Dead scheduler: the triad as supervisory control (#1145).
//
// One scheduler, three hands (Matt's mapping):
//   Davis → primaries: kin_weight scales the CURATOR candidate count
//   LOIS  → weights:    lois_weight blends his rank against Davis's pick
//   Queen → constraints: relax timers + two-sided clamping (STRUCTURAL only —
//           nothing taste-derived; her taste columns stay gated until #762)
//
// L4D patterns stolen: intensity scalar with max-pool aggregation, relax
// timers after peaks, subtractive control (remove before adding — the module
// has no code path that invents candidates or scores), visibility gating
// (the Director never renders; debug is console-only), the Music Director
// announce pattern (phase is legible through the existing whisper/meter
// channel — the Director adds no triggers and no UI), deck-not-dice is
// inherent (mixture sampling, no streaks), two-sided clamping, and
// gain-scheduled modes (the 20 room rows).
//
// Reads the room from directorsMatrix (READOUT-ONLY — never written here),
// intensity from directorSense, gains from directorTable, temperature from
// effectiveTemp. Runs on roll/keep/seed/evolve events (i.e. at pick time),
// never in the live loop.
import { roomFor } from './directorsMatrix.js';
import { rowFor, relaxSecondsFor } from './directorTable.js';
import {
  INTENSITY_PEAK,
  normalizeKeepPassVelocity,
  normalizePhaseTime,
  createIntensityTracker,
} from './directorSense.mjs';
import { effectiveTemp, TEMP_DEFAULT } from './effectiveTemp.js';
import { resolveDavisState } from './davisState.js';
import { resolveLoisFace } from './loisFace.js';
import { createBeatTracker } from './beatConfidence.mjs';
import { audioEnergyNow } from './keepContext.js';

// ─── the gates ─────────────────────────────────────────────────────────────
// #762's proof is not done: the Queen's taste-derived columns (sway_allowance,
// tilt_limit) are wired through the table but held neutral here. Flip only
// when the proof clears — the selfcheck tripwires both constants.
export const SWAY_GATE_OPEN = false;
export const TILT_GATE_OPEN = false;

/** During relax the room cools to at most this (the Queen's structural hand). */
export const RELAX_TEMP = 0.3;
/** Intensity below this counts as cool (resets the phase-time clock). */
export const COOL_FLOOR = 0.2;

const clamp01 = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
};

/**
 * Silence default (DS rule 4: silence is default). No room → no Director:
 * yesterday's temperature, one candidate pool, no LOIS blend, no sway.
 */
export const NEUTRAL_GAINS = Object.freeze({
  temperature: TEMP_DEFAULT,
  kinWeight: 1,
  loisWeight: 0,
  swayAllowance: 0,
  tiltLimit: 0,
  intensityBudget: 0.5,
  relaxSeconds: relaxSecondsFor(0.5),
  room: null,
});

/**
 * Pure: room + phase → gains. No state, no signals — the scheduler's mind
 * without its eyes. Null room (either Director stateless) → NEUTRAL_GAINS.
 */
export function directorGains({ loisCode = null, davisCode = null, phase = null } = {}) {
  const room = roomFor(loisCode, davisCode);
  const row = rowFor(loisCode, davisCode);
  if (!room || !row) return NEUTRAL_GAINS;
  // AWAY freezes weights structurally: the critic is not in the room.
  // (The table already says 0; this is the backstop.)
  const loisWeight = loisCode === 'AWAY' ? 0 : clamp01(row.lois_weight);
  return {
    temperature: effectiveTemp({ room: row, phase }),
    kinWeight: Math.min(2, Math.max(0.25, row.kin_weight)),
    loisWeight,
    swayAllowance: SWAY_GATE_OPEN ? row.sway_allowance : 0,
    tiltLimit: TILT_GATE_OPEN && phase === 'explore' ? row.tilt_limit : 0,
    intensityBudget: row.intensity_budget,
    relaxSeconds: row.relax_seconds,
    room: { n: room.n, verdict: room.verdict, lois: loisCode, davis: davisCode },
  };
}

/**
 * The LOIS/Davis blend: with probability loisWeight the critic's top pick
 * wins, otherwise the generator's. Pure mixture — it returns exactly one of
 * its two input indices, never an invented third. rng injectable for tests.
 */
export function blendPick({ davisIndex, loisIndex, loisWeight, rng = Math.random } = {}) {
  const w = clamp01(loisWeight);
  if (w <= 0) return davisIndex;
  if (w >= 1) return loisIndex;
  return rng() < w ? loisIndex : davisIndex;
}

/** Console-only, behind localStorage['kc:director:trace']==='1', off by default. */
export function directorTrace(...args) {
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('kc:director:trace') === '1') {
      console.log('[director]', ...args);
    }
  } catch {
    /* storage unavailable — stay silent */
  }
}

function liveAudio() {
  try {
    const e = audioEnergyNow();
    return e == null ? 0 : clamp01(e);
  } catch {
    return 0;
  }
}

/**
 * The stateful scheduler: intensity tracker, beat tracker, relax machine.
 * Tick it on roll/keep/seed/evolve events — never per frame.
 */
export function createDirector({ now = () => Date.now() } = {}) {
  const intensity = createIntensityTracker({ now });
  const beats = createBeatTracker();
  let relaxUntil = 0;
  let lastCoolAt = now();

  /**
   * @param {object} p { feed, audio?, keep?, phase?, nowTs? }
   *   feed: loisActivity.snapshot(); audio: 0..1 or null to read live;
   *   keep: a keep just landed (strong user action — ends relax early);
   *   phase: 'refine'|'explore'|null (#1144's interface; null = unmodulated).
   * @returns { gains, intensity, directorPhase: 'build'|'peak'|'relax' }
   */
  function tick({ feed = {}, audio = null, keep = false, phase = null, nowTs = now() } = {}) {
    const face = resolveLoisFace(feed);
    const davis = resolveDavisState(feed);
    const gains = directorGains({
      loisCode: face ? face.code : null,
      davisCode: davis ? davis.code : null,
      phase,
    });
    // Strong user action ends relax early (L4D: relax ends early on movement).
    if (keep) relaxUntil = 0;
    const audioN = audio == null ? liveAudio() : clamp01(audio);
    const signals = {
      audio: audioN,
      keepPass: normalizeKeepPassVelocity((feed.keepsLast5m || 0) / 5),
      beat: beats.confident ? 1 : 0,
      phaseTime: normalizePhaseTime((nowTs - lastCoolAt) / 1000),
    };
    const level = intensity.update(signals, nowTs);
    if (level < COOL_FLOOR) lastCoolAt = nowTs;
    // Peak → forced relax. No re-peak while relaxing: never high-amplitude
    // back-to-back (Booth's explicit rule). The tick that crosses the peak
    // reports 'peak' — the peak lands hot — and the room cools from the
    // next tick.
    const wasRelaxing = nowTs < relaxUntil;
    let entering = false;
    if (level >= INTENSITY_PEAK && !wasRelaxing) {
      relaxUntil = nowTs + gains.relaxSeconds * 1000;
      entering = true;
    }
    const relaxing = nowTs < relaxUntil && !entering;
    // The Queen's structural hand: relax cools the room. Temperature capped,
    // candidate multiplier held to neutral. No taste involved — shippable now.
    const out = relaxing
      ? { ...gains, temperature: Math.min(gains.temperature, RELAX_TEMP), kinWeight: Math.min(gains.kinWeight, 1) }
      : gains;
    const directorPhase = entering ? 'peak' : relaxing ? 'relax' : 'build';
    directorTrace('tick', {
      room: out.room ? `${out.room.n} ${out.room.verdict}` : 'silence',
      level: +level.toFixed(2),
      directorPhase,
      temp: +out.temperature.toFixed(2),
    });
    return { gains: out, intensity: level, directorPhase };
  }

  return {
    tick,
    /** Feed the beat tracker (wired to the store in App via initDirectorBeat). */
    pushBeat(pulse) {
      beats.push(pulse);
    },
    get intensity() {
      return intensity.value;
    },
    reset() {
      intensity.reset();
      relaxUntil = 0;
      lastCoolAt = now();
    },
  };
}

// Module-level singleton — the established pattern (cf. taste.js activePersonaId).
let singleton = null;
/** The live Director. */
export function getDirector() {
  if (!singleton) singleton = createDirector();
  return singleton;
}
/** Tests only: drop the singleton. */
export function resetDirector() {
  singleton = null;
}

/**
 * Wire the beat tracker to the store. Call once (from App, next to
 * initWhisperTriggers). subscribe is injected so this module stays
 * framework-free.
 */
export function initDirectorBeat(subscribe) {
  const d = getDirector();
  subscribe((s) => {
    const b = s && typeof s.beatPulse === 'number' ? s.beatPulse : 0;
    d.pushBeat(b);
  });
}
