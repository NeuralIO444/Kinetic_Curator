// queenLean — #1139 PR-2: the sway mechanics M1–M5.
//
// Design-doc reference only (rule 10): she is never named on the surface —
// not even a tooltip. Identifiers live here and in code comments only. The
// lean field (lean_lois / lean_davis) is runtime-only, never serialized; the
// selfcheck scans UI source for the identifiers.
//
// What this module is: five bounded, relaxing biases on existing continuous
// parameters, anchored in the artist's own kept taste (keeps ledger) or a
// live signal. She changes inclinations, never outcomes. Nothing here
// renders.
//
// Gating: the sway computes for real, but the public output stays neutral
// while PR-3's GATE_OPEN is false (#762 proof gate). The pure mechanics are
// exported for the selfcheck; the gated composite is what consumers read.
// Identity below MIN_KEEPS keeps holds regardless of the gate.
//
// Magnitudes: 2026-10-08 spec comment on #1139 (feel values). Bounds:
//   M1 rank bias      +0.06 on rankLois scores, proximity ≥ 0.72, one top-3
//                     slot swap max, never demotes (biases are ≥ 0)
//   M2 temperature    T' = 0.4 + 0.15 × richness, cap 0.55, floor 0.40,
//                     relaxes over 2.5s loop time
//   M3 palette drift  +0.10 mix toward the kept palette at beat confidence
//                     (≥ 0.62 across two attacks), relaxes over 1 phrase
//   M4 beat-sway      phrase arm ≤ 40ms early, hold +8% (cap +1 beat),
//                     loop-time only, relaxes over 1 phrase
//   M5 lean-in        reactivity gain 1.18 → 1.00 over one phrase on
//                     audio/MIDI return (never FILE/unsupported/denied),
//                     no stacking
import { GATE_OPEN } from './queenChannel.js';
import { extractFeatures } from './taste.js';
import { personaTuning, TUNING_DEFAULTS } from '../personas/tuning.mjs';

const clamp01 = (v) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

// #2382: every magnitude in this module lives in the persona tuning table (personas/tuning.json,
// `kc-persona-tuning/1`, spec §3c). The exported constants below are the SHIPPED values — what existing
// importers and pins read — while the mechanics read the table in force through qk(), so a DEV-mode edit
// moves the live value without a reload. With no edits in force the two are the same numbers.
const QK_DEFAULTS = TUNING_DEFAULTS.personas.queen.knobs;
const qk = () => personaTuning().personas.queen.knobs;

/** v1 anchor: the keeps that already exist. Below this she is identity. */
export const MIN_KEEPS = QK_DEFAULTS.minKeeps;

// ─── M1: nod-easing → rankLois bias ──────────────────────────────────────
export const M1_BIAS = QK_DEFAULTS.m1.bias;
export const M1_PROXIMITY = QK_DEFAULTS.m1.proximity;

/** Cosine proximity of two 0..1 feature maps. */
export function proximity(a, b) {
  const keys = Object.keys(a);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const k of keys) {
    const x = typeof a[k] === 'number' ? a[k] : 0.5;
    const y = typeof b[k] === 'number' ? b[k] : 0.5;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return na > 0 && nb > 0 ? dot / Math.sqrt(na * nb) : 0;
}

/**
 * Kept-taste centroid: mean feature vector of keeps that carry a layout.
 * Null when no keep has one — then there is nothing to lean toward.
 */
export function keptCentroid(keeps) {
  const feats = [];
  for (const k of keeps || []) {
    const layout = k && k.config && k.config.layout;
    if (layout && typeof layout === 'object') feats.push(extractFeatures(layout));
  }
  if (!feats.length) return null;
  const keys = Object.keys(feats[0]);
  const mean = {};
  for (const k of keys) {
    let s = 0;
    for (const f of feats) s += f[k];
    mean[k] = s / feats.length;
  }
  return mean;
}

/**
 * Per-candidate rank bias: +M1_BIAS for candidates whose proximity to the
 * kept centroid clears M1_PROXIMITY, else 0. Never negative — she never
 * demotes. Returns an array aligned with candidates.
 */
export function rankBiases(candidates, centroid) {
  const n = candidates ? candidates.length : 0;
  const out = new Array(n).fill(0);
  if (!centroid || n === 0) return out;
  const k = qk();
  for (let i = 0; i < n; i++) {
    let p = 0;
    try {
      p = proximity(extractFeatures(candidates[i]), centroid);
    } catch {
      p = 0;
    }
    out[i] = p >= k.m1.proximity ? k.m1.bias : 0;
  }
  return out;
}

/**
 * Apply biases to a score list with at most ONE adjacent swap inside the
 * top 3 (stable, unbiased order first). Returns the new index order.
 * The swap only ever promotes the biased-better candidate — with
 * non-negative biases nothing is demoted.
 */
export function applyRankBias(scores, biases) {
  const n = scores ? scores.length : 0;
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => scores[b] - scores[a] || a - b);
  const bScore = (i) => scores[i] + (biases && biases[i] ? biases[i] : 0);
  let swapAt = -1;
  let swapGain = 0;
  const top = Math.min(3, n);
  for (let k = 0; k < top - 1; k++) {
    const gain = bScore(order[k + 1]) - bScore(order[k]);
    if (gain > swapGain) {
      swapGain = gain;
      swapAt = k;
    }
  }
  if (swapAt >= 0) {
    const t = order[swapAt];
    order[swapAt] = order[swapAt + 1];
    order[swapAt + 1] = t;
  }
  return order;
}

// ─── M2: temperature warming ─────────────────────────────────────────────
export const M2_T0 = QK_DEFAULTS.m2.t0;
export const M2_SLOPE = QK_DEFAULTS.m2.slope;
export const M2_CAP = QK_DEFAULTS.m2.cap;
export const M2_FLOOR = QK_DEFAULTS.m2.floor;

/**
 * Warmed softmax temperature from audio richness 0..1.
 * FILE sessions pass honest-zero richness (a file is not a quiet room),
 * which lands exactly on the floor. Never below floor, never above cap.
 */
export function warmedTemperature(richness) {
  const { t0, slope, cap, floor } = qk().m2;
  const r = clamp01(richness);
  return Math.min(cap, Math.max(floor, t0 + slope * r));
}

// ─── M3: palette gravity ─────────────────────────────────────────────────
export const M3_DRIFT = QK_DEFAULTS.m3.drift;

/**
 * Most-kept palette id (mode; first max wins ties — deterministic).
 * Null when no keep names a palette.
 */
export function keptPaletteId(keeps) {
  const counts = new Map();
  for (const k of keeps || []) {
    const id = k && k.config && k.config.palette && k.config.palette.id;
    if (typeof id === 'string' && id) counts.set(id, (counts.get(id) || 0) + 1);
  }
  let best = null;
  let bestN = 0;
  for (const [id, c] of counts) {
    if (c > bestN) {
      best = id;
      bestN = c;
    }
  }
  return best;
}

/**
 * Palette drift target at beat confidence: mix toward the kept palette at
 * up to M3_DRIFT. Null when not confident or no kept palette — no drift.
 * The consumer caps the hold at its own beat interval; the weight here is
 * the only number this module owns.
 */
export function paletteDriftTarget(keeps, beatConfident) {
  if (!beatConfident) return null;
  const id = keptPaletteId(keeps);
  return id ? { paletteId: id, weight: qk().m3.drift } : null;
}

// ─── M4: beat-sway (phrase timing) ───────────────────────────────────────
export const M4_ARM_MS = QK_DEFAULTS.m4.armMs;
export const M4_HOLD_PCT = QK_DEFAULTS.m4.holdPct;

/**
 * Phrase-timing lean at beat confidence, loop-time only. Arm the phrase up
 * to 40ms early so boundaries land on the grid; hold up to +8% (the consumer
 * caps the hold extension at one beat interval — this module does not know
 * the beat length). All zeros when not confident.
 */
export function phraseTiming(beatConfident) {
  const { armMs, holdPct } = qk().m4;
  return beatConfident ? { armEarlyMs: armMs, holdPct } : { armEarlyMs: 0, holdPct: 0 };
}

// ─── M5: the lean-in ─────────────────────────────────────────────────────
export const M5_GAIN_PEAK = QK_DEFAULTS.m5.gainPeak;

/**
 * Reactivity gain on audio/MIDI return: 1.18 at the return, relaxing
 * linearly to 1.00 across one phrase. Stateless by construction — calling
 * it again mid-decay recomputes from the given progress, so it can never
 * stack. 1.00 when nothing returned.
 */
export function reactivityGain(returned, phraseProgress) {
  if (!returned) return 1.0;
  const p = clamp01(phraseProgress);
  return 1 + (qk().m5.gainPeak - 1) * (1 - p);
}

// ─── beat confidence ─────────────────────────────────────────────────────
// Detector confidence ≥ 0.62 across two attacks. Attacks arrive as peaks;
// this module does not detect them (the beat path does) — it judges them.
export const BEAT_CONFIDENCE = QK_DEFAULTS.beatConfidence;

/** True when the last two recorded attack peaks both clear the bar. */
export function beatConfidentFromPeaks(peaks) {
  if (!Array.isArray(peaks) || peaks.length < 2) return false;
  const [a, b] = peaks.slice(-2);
  const bar = qk().beatConfidence;
  return a >= bar && b >= bar;
}

// ─── gated composite ─────────────────────────────────────────────────────
/** All-zero sway: she is not leaning. (The shipped snapshot; the live neutral is built from the table in force.) */
export const NEUTRAL_SWAY = Object.freeze({
  temperature: M2_T0,
  palette: null,
  phrase: Object.freeze({ armEarlyMs: 0, holdPct: 0 }),
  reactivity: 1.0,
});
const neutralSway = () => ({
  temperature: qk().m2.t0,
  palette: null,
  phrase: Object.freeze({ armEarlyMs: 0, holdPct: 0 }),
  reactivity: 1.0,
});

/**
 * Ungated sway computation. Exported so the selfcheck can prove the
 * MIN_KEEPS identity and the mechanic bounds without the gate.
 * Live consumers must read swayBiases(), never this.
 */
export function swayOpen(keeps, signals) {
  const list = Array.isArray(keeps) ? keeps : [];
  if (list.length < qk().minKeeps) return neutralSway();
  const s = signals || {};
  const beatConfident = beatConfidentFromPeaks(s.attackPeaks);
  // M5 never fires on FILE/unsupported/denied — only a live return counts.
  const returned = !!s.audioReturned && (s.source === 'mic' || s.source === 'midi');
  return {
    temperature: warmedTemperature(s.richness),
    palette: paletteDriftTarget(list, beatConfident),
    phrase: phraseTiming(beatConfident),
    reactivity: reactivityGain(returned, s.phraseProgress),
  };
}

/**
 * The sway for one evaluation. Signals: { richness, attackPeaks,
 * audioReturned, phraseProgress, source }.
 * Neutral while the gate is closed (#762) — identity is provable, not
 * promised (see the selfcheck).
 * Note: M1's rank bias is computed at pick time (it needs the candidates)
 * via rankBiases() + applyRankBias(), not here.
 */
export function swayBiases(keeps, signals) {
  if (!GATE_OPEN) return neutralSway();
  return swayOpen(keeps, signals);
}

// ─── debug trace ─────────────────────────────────────────────────────────
/** Console-only, behind localStorage['kc:queen:trace']==='1', off by default. */
export function trace(...args) {
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('kc:queen:trace') === '1') {
      console.log('[sway]', ...args);
    }
  } catch {
    /* storage unavailable — stay silent */
  }
}

// ─── M6: warm a moth's birth toward the recent keeps (Phase 4 step 5, #1356) ──
// Matt (2026-10-13): she looks at the last 3 keeps (5 if 3 swings). At a keep, the traits of the moths then alive are
// remembered in a session ring (never saved, never replayed from a file: the traits ride the resolver input like
// Davis's own). A moth born later is rolled around a CENTRE nudged from the default toward the mean of those, by
// M6_STRENGTH x the room's allowance. Identity below MIN_KEEPS keeps and while the gate is closed. Surfaces nothing.
export const M6_KEEPS = QK_DEFAULTS.m6.keeps;
export const M6_STRENGTH = QK_DEFAULTS.m6.strength;

/**
 * Ungated: the centre for one birth, or null for "no nudge".
 * @param ring       [ [traits, ...], ... ] oldest first (each entry: the moths alive at one keep)
 * @param defaults   TRAIT_DEFAULTS
 * @param allowance  the room's allowance 0..1
 */
export function warmCentreOpen(ring, defaults, allowance, nKeeps = Infinity) {
  const k = qk();
  if (!(nKeeps >= k.minKeeps) || !Array.isArray(ring)) return null;
  const a = clamp01(allowance) * k.m6.strength;
  if (a === 0) return null;
  const sample = ring
    .slice(-k.m6.keeps)
    .flat()
    .filter((t) => t && typeof t === 'object');
  if (!sample.length) return null;
  const out = {};
  for (const k of Object.keys(defaults)) {
    let sum = 0;
    for (const t of sample) sum += Number.isFinite(t[k]) ? t[k] : defaults[k];
    out[k] = defaults[k] + a * (sum / sample.length - defaults[k]);
  }
  return out;
}

/** The gated centre. Neutral (null) while the gate is closed (#762). */
export function warmCentre(ring, defaults, allowance, nKeeps) {
  return GATE_OPEN ? warmCentreOpen(ring, defaults, allowance, nKeeps) : null;
}

// ─── M7: ease the BEAT BPM toward a confident audio tempo (Phase 4 / #1460) ──────────────────────────────────
// Matt (2026-10-13): she may ease the BPM toward the music, a small bounded step per phrase, only while her mark
// shows; a BPM the artist sets by hand always wins and silences her (the driver, curator/paceLive.js, owns that).
// Identity below MIN_KEEPS keeps, with no allowance, with a doubtful tempo, and while the gate is closed.
export const M7_CONFIDENCE = QK_DEFAULTS.m7.confidence; // below this the tempo is not trusted
export const M7_STEP = QK_DEFAULTS.m7.step; // bpm per phrase at full allowance (half of it at the smallest hand)
export const M7_DEADBAND = QK_DEFAULTS.m7.deadband; // within this of the target she is done: no chasing a wobble
export const M7_RANGE = QK_DEFAULTS.m7.range; // never leaves the BEAT dial's useful span

/**
 * Ungated: the next BPM, or null for "no move".
 * @param current     the BEAT BPM now
 * @param target      audio:tempo's bpm
 * @param confidence  audio:tempo's confidence 0..1
 * @param nKeeps      keeps the pull may learn from
 * @param allowance   the room's allowance 0..1
 */
export function tempoEaseOpen({ current, target, confidence, nKeeps = Infinity, allowance = 0 } = {}) {
  const k = qk();
  if (!(nKeeps >= k.minKeeps)) return null;
  const a = clamp01(allowance);
  if (a === 0) return null;
  if (!(confidence >= k.m7.confidence)) return null;
  const cur = Number(current);
  const want = Number(target);
  if (!Number.isFinite(cur) || !Number.isFinite(want)) return null;
  const goal = Math.min(k.m7.range[1], Math.max(k.m7.range[0], want));
  const gap = goal - cur;
  if (Math.abs(gap) <= k.m7.deadband) return null;
  const step = Math.min(Math.abs(gap), k.m7.step * (0.5 + 0.5 * a));
  return Math.round((cur + Math.sign(gap) * step) * 10) / 10;
}

/** The gated ease. Null while the gate is closed (#762). */
export function tempoEase(args) {
  return GATE_OPEN ? tempoEaseOpen(args) : null;
}

// ─── M8: the dial lean (#1640 — the Queen's lean, applied) ─────────────────────────────────────────────
// The validated Mind lean (mindContract's queen reply: { wetness?, evolve? }, each 0..1) was answered for
// and then dropped — validated by the contract, applied nowhere. M8 applies it to the two dials the ruling
// named (Matt, 2026-10-16, on #1640): the WETNESS dial (layoutParams.accumulationWetness, 0..1, live-only)
// and the EVOLVE rate (evolveInterval, 200..10000 ms). It is M7's shape aimed at two more dials — the same
// gates (MIN_KEEPS floor, the room's allowance; M7's third gate, a confident measurement, has no analogue
// here: a validated lean IS the measurement, and a missing key is its absent case), the same bounded step
// scaled by the hand she is given, the same dead-band so she stops rather than chases the last wobble, and
// null whenever she should not move — no lean means the dials are bit-identical to a build without her.
//
// The two leans read as TARGETS in each dial's own terms, symmetric with the contract validating them
// identically: wetness names the wetness (0 is dry — the dial's own copy says so). Evolve names how much
// evolution she wants, 0..1 from the dial's slowest to its fastest: the goal interval is
// MAX − lean × (MAX − MIN), so evolve 1 aims at 200 ms and evolve 0 at 10000 ms. Steps are a like fraction
// of each dial's span to M7's (3 BPM of a 120 span ≈ 2.5%): wetness 0.05 of its unit span, evolve 250 ms
// of its 9800 span, each scaled by (0.5 + 0.5·allowance) exactly as M7 scales. One step lands per phrase —
// the driver (curator/leanLive.js, hosted by director.leanDialSteps) steps on CLOCK_BAR phrase boundaries,
// and only inside a silence window with no artist hand on either dial (the hand-silence lives in the
// driver, exactly as M7's lives in paceLive). Nothing here reads a clock or a die: a recorded lean
// replays to the same dial values.
export const M8_WET_STEP = QK_DEFAULTS.m8.wetStep; // of the wetness dial's 0..1 span, per phrase, at a full hand
export const M8_WET_DEADBAND = QK_DEFAULTS.m8.wetDeadband; // within this of the goal she is done
export const M8_EVOLVE_RANGE = QK_DEFAULTS.m8.evolveRange; // the evolve dial's own span, ms (EvolveControls' min/max)
export const M8_EVOLVE_STEP = QK_DEFAULTS.m8.evolveStep; // ms per phrase at a full hand (≈2.5% of the span, M7's fraction)
export const M8_EVOLVE_DEADBAND = QK_DEFAULTS.m8.evolveDeadband; // ms — within this of the goal she is done

const boundedDialStep = (current, goal, stepMax, deadband) => {
  const gap = goal - current;
  if (Math.abs(gap) <= deadband) return null;
  const step = Math.min(stepMax, Math.abs(gap));
  return current + Math.sign(gap) * step;
};

/** wetnessLeanOpen({ current, target, nKeeps, allowance }) — PURE (ignores GATE_OPEN): one bounded step
 *  of the wetness dial toward the lean's wetness target, or null: below the keeps floor, no hand, no
 *  target named, not a number, already arrived. */
export function wetnessLeanOpen(args = {}) {
  const { current, target, nKeeps, allowance } = args;
  const k = qk();
  if (!(nKeeps >= k.minKeeps)) return null;
  if (!(allowance > 0)) return null;
  if (!Number.isFinite(current) || !Number.isFinite(target)) return null;
  const next = boundedDialStep(
    current,
    clamp01(target),
    k.m8.wetStep * (0.5 + 0.5 * clamp01(allowance)),
    k.m8.wetDeadband,
  );
  return next === null ? null : Math.round(next * 1000) / 1000;
}

/** wetnessLean(args) — the public, gated M8 wetness step. */
export function wetnessLean(args) {
  return GATE_OPEN ? wetnessLeanOpen(args) : null;
}

/** evolveLeanOpen({ current, lean, nKeeps, allowance }) — PURE (ignores GATE_OPEN): one bounded step of
 *  the evolve interval toward the pace the lean names, or null on the same gates as wetnessLeanOpen. */
export function evolveLeanOpen(args = {}) {
  const { current, lean, nKeeps, allowance } = args;
  const k = qk();
  if (!(nKeeps >= k.minKeeps)) return null;
  if (!(allowance > 0)) return null;
  if (!Number.isFinite(current) || !Number.isFinite(lean)) return null;
  const [lo, hi] = k.m8.evolveRange;
  const goal = hi - clamp01(lean) * (hi - lo);
  const next = boundedDialStep(current, goal, k.m8.evolveStep * (0.5 + 0.5 * clamp01(allowance)), k.m8.evolveDeadband);
  return next === null ? null : Math.round(next);
}

/** evolveLean(args) — the public, gated M8 evolve step. */
export function evolveLean(args) {
  return GATE_OPEN ? evolveLeanOpen(args) : null;
}

// ─── M9: the surge call (#1576 Q3 — the Queen calls the surge) ───────────────
// Matt (2026-10-20, on #1576): what fires a surge is a TASTE CALL, hers — not
// the beat, not a perform control, not a panel. She calls it the way she does
// everything: from the keeps. When a new keep lands she judges it against her
// kept-taste anchor — the centroid of the counted keeps BEFORE it (the same
// anchor M1 leans on, keptAnchor's 'live' state): a keep that lands near what
// the artist already keeps (proximity ≥ M1_PROXIMITY, her own nearness bar)
// is answered with a surge at the proximity's strength; a keep far from the
// centroid gets no answer. The call is a pure function of the recorded
// ledger — no clock, no die, no live signal — so the same recorded state
// always stamps the same demand, and the stamp rides the resolver input as
// recorded data (liveLoop's input.surgeTrigger; the take's input log carries
// it like every other input, so a take that surged replays the surge). It
// never renders (rule 10): no surface reads it, and the envelope it fires is
// surge's own presentation, not a signal about her. Identity — gate closed,
// fewer than MIN_KEEPS counted keeps before it, no centroid (no counted keep
// carries a layout), a new keep with no layout, or a far keep: 0, and an
// unstamped frame is bit-identical to a build without her.

/**
 * Ungated: her surge call for one landed keep — the trigger demand 0..1, or
 * 0 for no call. priorKeeps are the counted keeps BEFORE the new one (the
 * host filters the ledger first: director's pullKeeps); newKeep is the keep
 * that just landed, judged by its config.layout, the read every pull uses.
 */
export function surgeCallOpen({ priorKeeps = [], newKeep = null } = {}) {
  const k = qk();
  const prior = Array.isArray(priorKeeps) ? priorKeeps : [];
  if (prior.length < k.minKeeps) return 0;
  const layout = newKeep && newKeep.config && newKeep.config.layout;
  if (!layout || typeof layout !== 'object') return 0;
  const centroid = keptCentroid(prior);
  if (!centroid) return 0;
  let p = 0;
  try {
    p = proximity(extractFeatures(layout), centroid);
  } catch {
    p = 0;
  }
  return p >= k.m1.proximity ? p : 0;
}

/** surgeCall(args) — the public, gated M9 call. 0 while the gate is closed. */
export function surgeCall(args) {
  return GATE_OPEN ? surgeCallOpen(args) : 0;
}
