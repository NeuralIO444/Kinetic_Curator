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
// never in the live loop. Each tick that changes the room publishes `director:room` (directorRoom.js: a readout for
// the personas' minds — no gains, no sway, no tilt). Nothing a mind answers ever comes back in.
//
// FIELD (2026-10-31): at pick time the pure fieldEval.step is called and the
// chosen poetId (or null for silence) is attached to the room readout.
// No live loop. No inventing candidates. Seeded RNG only.
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
import {
  swayBiases,
  M2_FLOOR,
  M2_CAP,
  MIN_KEEPS,
  keptCentroid,
  rankBiases,
  applyRankBias,
  warmCentre,
  tempoEase,
  wetnessLean,
  evolveLean,
  M8_EVOLVE_RANGE,
  surgeCall,
} from './queenLean.mjs';
import { GATE_OPEN } from './queenChannel.js';
import { createRoomPublisher } from './directorRoom.js';
import { emit, Events } from '../composition/eventBus.js';
import { step as fieldStep, INITIAL_STATE as FIELD_INITIAL } from './fieldEval.js';

// ─── the gates ───────────────────────────────────────────────────────────────
// The room table's two taste-derived columns. #762's proof cleared on 2026-10-08 and Matt opened SWAY (rank and
// temperature: the room's sway_allowance now scales the pull). TILT opened 2026-10-11 (Matt): #1144's explore/refine
// phase is now supplied live at pick time (taste.js → getPhase()), and tilt only ever applies in explore. Constants,
// flipped by PR only; the selfcheck tripwires both.
export const SWAY_GATE_OPEN = true;
export const TILT_GATE_OPEN = true;

// ─── the pull's inputs (#1139 wiring, PR 2) ──────────────────────────────────
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
 * The anchor a pick-time consumer leans on, hosted here like everything
 * the pull touches (never a surface): the kept-taste centroid over the
 * pull's keeps (pullKeeps — pattern-layer keeps do not teach it), with
 * its state said plainly: 'identity' when too few keeps count to lean
 * (below MIN_KEEPS — no tilt exists), 'none' when no counted keep
 * carries a layout, else 'live' with the centroid. Keeps K2's fill
 * (#1590) reads its consensus tilt through this door.
 */
export function keptAnchor(keeps) {
  try {
    const kept = pullKeeps(keeps);
    if (kept.length < MIN_KEEPS) return { state: 'identity', centroid: null };
    const centroid = centroidOf(kept);
    return centroid ? { state: 'live', centroid } : { state: 'none', centroid: null };
  } catch {
    return { state: 'identity', centroid: null };
  }
}

/**
 * M1 (rank bias): the chooser handed to rankLois, or null. Null is the answer whenever the pull is closed, the room
 * allows none, fewer than MIN_KEEPS keeps count, or there is nothing to lean toward: rankLois(candidates, null) IS
 * today's argmax. `open` defaults to the gate; a selfcheck passes true to exercise the open path (no live override).
 * The chooser only ever promotes inside the top 3 by one adjacent swap (applyRankBias), scaled by the room's allowance.
 *
 * TILT (#1144, Matt 2026-10-08): during EXPLORE the same instrument runs in reverse. `tilt` (0.01..0.05, the room's
 * tilt_limit, and 0 unless the tilt gate is open AND the phase is explore) gives candidates that are NOT near the keeps a
 * small boost instead, so exploring leans a little away from what the artist already has. No randomness, still at most one
 * adjacent swap inside the top 3. When tilt is on it REPLACES the pull toward the keeps (refine is "demonstrated taste
 * only", explore is "bounded exploration"); with tilt 0 this is exactly M1.
 */
export function makeRankChooser({ keeps = [], allowance = 0, tilt = 0, open = GATE_OPEN } = {}) {
  try {
    const a = clamp01(allowance);
    const t = Number.isFinite(tilt) ? Math.max(0, Math.min(0.05, tilt)) : 0;
    if (!open || !(a > 0 || t > 0)) return null;
    const kept = pullKeeps(keeps);
    if (kept.length < MIN_KEEPS) return null;
    const centroid = centroidOf(kept);
    if (!centroid) return null;
    return (scores, candidates) => {
      const near = rankBiases(candidates, centroid); // > 0 exactly for candidates near the keeps
      const biases = t > 0 ? near.map((b) => (b > 0 ? 0 : t)) : near.map((b) => b * a);
      return applyRankBias(scores, biases)[0];
    };
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

// ─── her presence (#1145 × Mind 3, 2026-10-14) ────────────────────────────────────
// The third's hand grows with her Mind 3 tier, which is earned from honest engagement (never from a model): people who
// play KC-1 longer get more of her. The room's sway_allowance is multiplied by her presence; cool-down softens it.
// With no presence wired (tests, or before the app starts it) the scale is 1: exactly today's allowance.
export const PRESENCE_SCALE = Object.freeze({ 1: 0.5, 2: 0.7, 3: 0.85, 4: 1 });
export const PRESENCE_COOL = 0.6;

/** The allowance multiplier for her presence { tier 1..4, cool }, or 1 when there is none. Never throws. */
export function presenceScale(presence) {
  if (!presence || typeof presence !== 'object') return 1;
  const s = PRESENCE_SCALE[presence.tier];
  if (!Number.isFinite(s)) return 1;
  return presence.cool === true ? s * PRESENCE_COOL : s;
}

let presenceProvider = null;
/** The app hands the Director a reader of her presence (() => { tier, cool }). Injected: the Director imports no mind. */
export function setPresenceProvider(fn) {
  presenceProvider = typeof fn === 'function' ? fn : null;
}
/** Her presence right now, or null (unwired, or the reader threw). */
export function currentPresence() {
  try {
    return presenceProvider ? presenceProvider() : null;
  } catch {
    return null;
  }
}

// ─── pacing debt (#1145, 2026-10-09 spec; part 3) ─────────────────────────────────────
// The room table maps mood to gains but did not remember what the room just did, so it could flatter or punish all
// night. Debt is one number on the existing argument, from honest transitions only: each time LOIS's face turns BURN
// it adds 1 (cap 4), each time it turns NOD it pays 1 back (floor 0). At DEBT_OWED the room OWES quiet, and keeps owing
// until the debt is paid down to 0. While it owes:
//   - the temperature is capped at DEBT_TEMP_CAP, even in FULL BURN
//   - her allowance floors at DEBT_HOLD (she holds; she does not back off) — still × her presence
//   - Davis's freedom is held (kin_weight ≤ 1): he is allowed ugly again once the debt is paid
// A stall (Davis STUCK: same seed, nothing kept) still widens and stays warm: debt never overrides a stall.
// Not a timer, not a persona, never serialized, never on a surface; it lives inside the Director's closure.
export const DEBT_CAP = 4;
export const DEBT_OWED = 3;
export const DEBT_TEMP_CAP = 0.4;
export const DEBT_HOLD = 0.6;

/** One LOIS transition's effect on the debt (from → to codes). Pure. */
export function nextDebt(debt, from, to) {
  const d = Number.isFinite(debt) ? debt : 0;
  if (to === from) return d;
  if (to === 'BURN') return Math.min(DEBT_CAP, d + 1);
  if (to === 'NOD') return Math.max(0, d - 1);
  return d;
}

/** Owing quiet, with hysteresis: starts at DEBT_OWED, lasts until the debt is paid to 0. Pure. */
export function nextOwed(owed, debt) {
  return owed ? debt > 0 : debt >= DEBT_OWED;
}

/**
 * Pure: room + phase (+ her presence) → gains. No state, no signals — the scheduler's mind
 * without its eyes. Null room (either Director stateless) → NEUTRAL_GAINS.
 */
export function directorGains({ loisCode = null, davisCode = null, phase = null, presence = null, owed = false } = {}) {
  const room = roomFor(loisCode, davisCode);
  const row = rowFor(loisCode, davisCode);
  if (!room || !row) return NEUTRAL_GAINS;
  const quiet = owed === true && davisCode !== 'STUCK'; // a stall still widens: debt never overrides it
  // AWAY freezes weights structurally: the critic is not in the room.
  // (The table already says 0; this is the backstop.)
  const loisWeight = loisCode === 'AWAY' ? 0 : clamp01(row.lois_weight);
  return {
    temperature: quiet
      ? Math.min(DEBT_TEMP_CAP, effectiveTemp({ room: row, phase }))
      : effectiveTemp({ room: row, phase }),
    kinWeight: Math.min(quiet ? 1 : 2, Math.max(0.25, row.kin_weight)),
    loisWeight,
    swayAllowance: SWAY_GATE_OPEN
      ? clamp01((quiet ? Math.max(DEBT_HOLD, row.sway_allowance) : row.sway_allowance) * presenceScale(presence))
      : 0,
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
 * Audit fix 3f — no Math.random default (the 3a contract): a
 * missing/non-function rng rolls 0, so any positive weight takes the
 * blend, deterministically. Production (taste.js) passes the seeded stream.
 */
export function blendPick({ davisIndex, loisIndex, loisWeight, rng = null } = {}) {
  const draw = typeof rng === 'function' ? rng : () => 0;
  const w = clamp01(loisWeight);
  if (w <= 0) return davisIndex;
  if (w >= 1) return loisIndex;
  return draw() < w ? loisIndex : davisIndex;
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
export function createDirector({ now = () => Date.now(), onRoom = null, fieldRng = null } = {}) {
  const intensity = createIntensityTracker({ now });
  const beats = createBeatTracker();
  let relaxUntil = 0;
  let lastCoolAt = now();
  let pull = { keeps: [], bands: null, enabled: false, sourceType: null }; // fed by setPullInputs (store subscription)
  let lastAllowance = 0; // the room's allowance as of the last tick (a pick reads it; it never recomputes the room)
  let lastTilt = 0; // the room's tilt as of the last tick: 0 unless the tilt gate is open and the phase is explore
  let lastSway = { temperatureDelta: 0 }; // the sway view of the last tick, for the UI presence mark (#1258). Retained here, never rendered here.
  let debt = 0; // pacing debt (#1145 part 3): honest LOIS transitions only, never serialized
  let owed = false;
  let lastLois = null;
  let fieldState = { ...FIELD_INITIAL };
  const rng = typeof fieldRng === 'function' ? fieldRng : () => 0.5;

  /**
   * @param {object} p { feed, audio?, keep?, phase?, nowTs? }
   *   feed: loisActivity.snapshot(); audio: 0..1 or null to read live;
   *   keep: a keep just landed (strong user action — ends relax early);
   *   phase: 'refine'|'explore'|null (#1144's interface; null = unmodulated).
   * @returns { gains, intensity, directorPhase: 'build'|'peak'|'relax', poet: {poetId}|null }
   */
  function tick({ feed = {}, audio = null, keep = false, phase = null, nowTs = now() } = {}) {
    const face = resolveLoisFace(feed);
    const davis = resolveDavisState(feed);
    const loisNow = face ? face.code : null;
    if (loisNow !== lastLois) {
      debt = nextDebt(debt, lastLois, loisNow);
      lastLois = loisNow;
    }
    owed = nextOwed(owed, debt);
    const base = directorGains({
      loisCode: loisNow,
      davisCode: davis ? davis.code : null,
      phase,
      presence: currentPresence(),
      owed,
    });
    lastAllowance = base.swayAllowance;
    lastTilt = base.tiltLimit;
    const sway = deriveSway({ keeps: pull.keeps, richness: richnessFrom(pull), allowance: base.swayAllowance });
    lastSway = sway;
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
      ? { ...gains, temperature: Math.min(RELAX_TEMP, gains.temperature), kinWeight: 1 }
      : gains;

    // FIELD pure step at pick time only. Silence when no decision.
    const fieldInput = {
      intensity: level,
      verdict: out.room ? out.room.verdict : null,
      rejected: false,
    };
    const fieldResult = fieldStep(fieldState, fieldInput, rng);
    fieldState = fieldResult.nextState;
    const poet = fieldResult.decision
      ? { poetId: fieldResult.decision.poetId, pieceId: fieldResult.decision.pieceId, layout: fieldResult.decision.layout }
      : null;

    const directorPhase = relaxing ? 'relax' : entering ? 'peak' : 'build';
    const tickOut = { gains: out, intensity: level, directorPhase, poet };
    if (onRoom) onRoom(tickOut, phase);
    return tickOut;
  }

  return {
    tick,
    setPullInputs(next) {
      pull = { ...pull, ...next };
    },
    get lastAllowance() {
      return lastAllowance;
    },
    get lastTilt() {
      return lastTilt;
    },
    get lastSway() {
      return lastSway;
    },
    get fieldState() {
      return fieldState;
    },
  };
}
