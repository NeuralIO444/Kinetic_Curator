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
import { effectiveTemp, TEMP_DEFAULT, TEMP_CAP } from './effectiveTemp.js';
import { resolveDavisState } from './davisState.js';
import { resolveLoisFace } from './loisFace.js';
import { createBeatTracker } from './beatConfidence.mjs';
import { audioEnergyNow } from './keepContext.js';
import { swayBiases, M2_FLOOR, MIN_KEEPS, keptCentroid, rankBiases, applyRankBias } from './queenLean.mjs';
import { GATE_OPEN } from './queenChannel.js';

// ─── the gates ─────────────────────────────────────────────────────────────
// #762's proof is not done: the Queen's taste-derived columns (sway_allowance,
// tilt_limit) are wired through the table but held neutral here. Flip only
// when the proof clears — the selfcheck tripwires both constants.
export const SWAY_GATE_OPEN = false;
export const TILT_GATE_OPEN = false;

// ─── the pull's inputs (#1139 wiring, PR 2) ────────────────────────────────
// The Director is where the hidden pull is hosted: it already runs at pick time (never per frame) and never renders.
// PR 2 only COLLECTS what the pull will read and returns it as `sway`; nothing reads it yet, and with the gate
// closed it is exactly zero. A pull that throws must never take CURATOR down with it, so the whole derivation is
// wrapped: any failure is the neutral answer.
export const NEUTRAL_VIEW = Object.freeze({ temperatureDelta: 0 });

/**
 * M2 (temperature warming): the room's gains with the pull's warming added on top, never past the cap. effectiveTemp()
 * stays the single base source (its header says M2 composes at the pick site and must not be folded in there); this is
 * that site. A zero delta returns the SAME gains object, so with the gate closed nothing is even reallocated.
 */
export function applySway(gains, view) {
  const d = view && Number.isFinite(view.temperatureDelta) ? view.temperatureDelta : 0;
  if (!(d > 0)) return gains;
  return { ...gains, temperature: Math.min(TEMP_CAP, gains.temperature + d) };
}

/** A keep that carries a PATTERN layer: the artist has said they dislike that look, so the pull does not learn from it. */
const hasPatternLayer = (keep) => Array.isArray(keep?.stack?.l) && keep.stack.l.some((l) => l && l.type === 'pattern');

let lastKeeps = null;
let lastKept = [];
/** The keeps the pull may learn from. Memoised on the array's identity: a pick must not re-filter a long ledger. */
export function pullKeeps(keeps) {
  if (!Array.isArray(keeps)) return [];
  if (keeps === lastKeeps) return lastKept;
  lastKeeps = keeps;
  lastKept = keeps.filter((k) => !hasPatternLayer(k));
  return lastKept;
}

let centroidFor = null;
let centroidMemo = null;
/** The kept-taste centroid, memoised on the filtered ledger's identity (a pick must not rebuild it). */
function centroidOf(kept) {
  if (kept === centroidFor) return centroidMemo;
  centroidFor = kept;
  centroidMemo = keptCentroid(kept);
  return centroidMemo;
}

/**
 * M1 (rank bias): the chooser handed to rankLois, or null. Null is the answer whenever the pull is closed, the room
 * allows none, fewer than MIN_KEEPS keeps count, or there is nothing to lean toward: rankLois(candidates, null) IS
 * today's argmax. `open` defaults to the gate; a selfcheck passes true to exercise the open path (no live override).
 * The chooser only ever promotes inside the top 3 by one adjacent swap (applyRankBias), scaled by the room's allowance.
 */
export function makeRankChooser({ keeps = [], allowance = 0, open = GATE_OPEN } = {}) {
  try {
    const a = clamp01(allowance);
    if (!open || !(a > 0)) return null;
    const kept = pullKeeps(keeps);
    if (kept.length < MIN_KEEPS) return null;
    const centroid = centroidOf(kept);
    if (!centroid) return null;
    return (scores, candidates) => applyRankBias(scores, rankBiases(candidates, centroid).map((b) => b * a))[0];
  } catch {
    return null;
  }
}

/** Spectral richness 0..1 from the live bands: how far apart bass, mid and treble are, times the level. A file is not a room: 0. */
export function richnessFrom({ bands = null, enabled = false, sourceType = null } = {}) {
  if (!enabled || sourceType === 'file' || !bands) return 0;
  const { bass, mid, treble, rms } = bands;
  const v = [bass, mid, treble].map((x) => (Number.isFinite(x) ? clamp01(x) : 0));
  const mean = (v[0] + v[1] + v[2]) / 3;
  const variance = ((v[0] - mean) ** 2 + (v[1] - mean) ** 2 + (v[2] - mean) ** 2) / 3;
  const r = clamp01(Math.sqrt(variance) * 2 * (Number.isFinite(rms) ? clamp01(rms) : 0));
  return Math.round(r * 1e6) / 1e6; // a flat spectrum is zero, not float dust
}

/**
 * What the pull would do right now, scaled by the room's allowance. Pure: `sway` is the mechanics (injectable ONLY
 * here, so a selfcheck can drive the open path with swayOpen without a live override existing anywhere).
 * Gate closed: swayBiases() is neutral and the allowance is 0, so this is the neutral view.
 */
export function deriveSway({ keeps = [], richness = 0, allowance = 0 } = {}, sway = swayBiases) {
  try {
    const a = clamp01(allowance);
    const kept = pullKeeps(keeps);
    if (a === 0 || kept.length < MIN_KEEPS) return NEUTRAL_VIEW;
    const out = sway(kept, { richness: clamp01(richness) });
    const t = Number(out && out.temperature);
    return { temperatureDelta: Number.isFinite(t) ? Math.max(0, (t - M2_FLOOR) * a) : 0 };
  } catch {
    return NEUTRAL_VIEW;
  }
}

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
  let pull = { keeps: [], bands: null, enabled: false, sourceType: null }; // fed by setPullInputs (store subscription)
  let lastAllowance = 0; // the room's allowance as of the last tick (a pick reads it; it never recomputes the room)

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
    const base = directorGains({
      loisCode: face ? face.code : null,
      davisCode: davis ? davis.code : null,
      phase,
    });
    lastAllowance = base.swayAllowance;
    const sway = deriveSway({ keeps: pull.keeps, richness: richnessFrom(pull), allowance: base.swayAllowance });
    const gains = applySway(base, sway);
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
      temp: +base.temperature.toFixed(2), // the room's own, before any pull: a trace must not reveal one
    });
    return { gains: out, intensity: level, directorPhase, sway };
  }

  return {
    tick,
    /** The chooser for rankLois, or null (today's argmax). */
    rankChooser() {
      return makeRankChooser({ keeps: pull.keeps, allowance: lastAllowance });
    },
    /** The store's view for the pull (keeps, bands, source): cheap references only, read at pick time. */
    setPullInputs(next) {
      pull = { ...pull, ...next };
    },
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
    if (s) d.setPullInputs({ keeps: s.keeps, bands: s.audioBands, enabled: !!s.audioEnabled, sourceType: s.audioSource && s.audioSource.type });
  });
}
