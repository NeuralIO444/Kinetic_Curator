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

const clamp01 = (v) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/** v1 anchor: the keeps that already exist. Below this she is identity. */
export const MIN_KEEPS = 8;

// ─── M1: nod-easing → rankLois bias ──────────────────────────────────────
export const M1_BIAS = 0.06;
export const M1_PROXIMITY = 0.72;

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
  for (let i = 0; i < n; i++) {
    let p = 0;
    try {
      p = proximity(extractFeatures(candidates[i]), centroid);
    } catch {
      p = 0;
    }
    out[i] = p >= M1_PROXIMITY ? M1_BIAS : 0;
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
  const order = Array.from({ length: n }, (_, i) => i).sort(
    (a, b) => (scores[b] - scores[a]) || (a - b),
  );
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
export const M2_T0 = 0.4;
export const M2_SLOPE = 0.15;
export const M2_CAP = 0.55;
export const M2_FLOOR = 0.4;

/**
 * Warmed softmax temperature from audio richness 0..1.
 * FILE sessions pass honest-zero richness (a file is not a quiet room),
 * which lands exactly on the floor. Never below floor, never above cap.
 */
export function warmedTemperature(richness) {
  const r = clamp01(richness);
  return Math.min(M2_CAP, Math.max(M2_FLOOR, M2_T0 + M2_SLOPE * r));
}

// ─── M3: palette gravity ─────────────────────────────────────────────────
export const M3_DRIFT = 0.1;

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
  return id ? { paletteId: id, weight: M3_DRIFT } : null;
}

// ─── M4: beat-sway (phrase timing) ───────────────────────────────────────
export const M4_ARM_MS = 40;
export const M4_HOLD_PCT = 0.08;

/**
 * Phrase-timing lean at beat confidence, loop-time only. Arm the phrase up
 * to 40ms early so boundaries land on the grid; hold up to +8% (the consumer
 * caps the hold extension at one beat interval — this module does not know
 * the beat length). All zeros when not confident.
 */
export function phraseTiming(beatConfident) {
  return beatConfident
    ? { armEarlyMs: M4_ARM_MS, holdPct: M4_HOLD_PCT }
    : { armEarlyMs: 0, holdPct: 0 };
}

// ─── M5: the lean-in ─────────────────────────────────────────────────────
export const M5_GAIN_PEAK = 1.18;

/**
 * Reactivity gain on audio/MIDI return: 1.18 at the return, relaxing
 * linearly to 1.00 across one phrase. Stateless by construction — calling
 * it again mid-decay recomputes from the given progress, so it can never
 * stack. 1.00 when nothing returned.
 */
export function reactivityGain(returned, phraseProgress) {
  if (!returned) return 1.0;
  const p = clamp01(phraseProgress);
  return 1 + (M5_GAIN_PEAK - 1) * (1 - p);
}

// ─── beat confidence ─────────────────────────────────────────────────────
// Detector confidence ≥ 0.62 across two attacks. Attacks arrive as peaks;
// this module does not detect them (the beat path does) — it judges them.
export const BEAT_CONFIDENCE = 0.62;

/** True when the last two recorded attack peaks both clear the bar. */
export function beatConfidentFromPeaks(peaks) {
  if (!Array.isArray(peaks) || peaks.length < 2) return false;
  const [a, b] = peaks.slice(-2);
  return a >= BEAT_CONFIDENCE && b >= BEAT_CONFIDENCE;
}

// ─── gated composite ─────────────────────────────────────────────────────
/** All-zero sway: she is not leaning. */
export const NEUTRAL_SWAY = Object.freeze({
  temperature: M2_T0,
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
  if (list.length < MIN_KEEPS) return NEUTRAL_SWAY;
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
  if (!GATE_OPEN) return NEUTRAL_SWAY;
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
