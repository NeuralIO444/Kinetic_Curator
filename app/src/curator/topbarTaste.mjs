// topbarTaste.mjs — pure resolvers for the top-bar affective grammar (#1122).
// Every pill state traces to a real signal; these functions only translate.
// No store, no DOM, no wall-clock — safe to unit-test.

import { HEAD_MIN_FIDELITY } from './tasteHead.js';

/**
 * ◆ Diamond level from an imported taste (tasteStore.getTaste()).
 * 0 = dark/silent: no taste, or fidelity below the 0.3 bar (#762 hasn't
 * landed a real run yet, so this is the honest default).
 * 1..4 = compressive amber shimmer levels once fidelity clears 0.3.
 */
export function tasteLevel(taste) {
  const f = taste?.head?.fidelity;
  if (typeof f !== 'number' || !(f >= HEAD_MIN_FIDELITY)) return 0;
  const t = (f - HEAD_MIN_FIDELITY) / (1 - HEAD_MIN_FIDELITY); // 0..1 above the bar
  return Math.min(4, 1 + Math.floor(t * 3.999));
}

/**
 * CUR verdict detent from rankLois parts ({ score 0..1 }).
 * Discrete TE steps: 0 = no verdict / weak, 2 = lean, 4 = strong.
 * null parts (no verdict yet) → 0.
 */
export function verdictDetent(parts) {
  const s = parts?.score;
  if (typeof s !== 'number' || !Number.isFinite(s)) return 0;
  if (s >= 0.65) return 4;
  if (s >= 0.35) return 2;
  return 0;
}

/**
 * V voice breath period (seconds) from a persona's drift weight.
 * |drift| 0 → slow 9s swell; |drift| 1 → lively 3s. LOIS (no weight) → 6s neutral.
 * The weight is the persona's authored drift (personaTastes.js), not a faked rate.
 */
export function voiceBreathS(driftWeight) {
  const d = typeof driftWeight === 'number' && Number.isFinite(driftWeight) ? Math.abs(driftWeight) : 0.25;
  const t = Math.min(1, d);
  return 9 - 6 * t;
}

/**
 * V voice level 0..4 from the honest feed: how long ago the last roll was (null = none this session). The voice
 * breathes only AFTER it did something and decays to still over VOICE_ACT_MS: a time-based Davis signal that
 * traces to a real roll, never a permanent animation (rule 3).
 */
export const VOICE_ACT_MS = 20000;
export function voiceLevel(lastRollAgoMs) {
  if (typeof lastRollAgoMs !== 'number' || !Number.isFinite(lastRollAgoMs) || lastRollAgoMs < 0 || lastRollAgoMs >= VOICE_ACT_MS) return 0;
  return Math.max(1, Math.min(4, Math.ceil((1 - lastRollAgoMs / VOICE_ACT_MS) * 4)));
}

/**
 * Bar-quiet precedence (#1122): when more pills are lit than the cap allows,
 * the lowest-precedence accents go subdued. Order: CUR > locks > KIN > V > L > diamond.
 * Returns the set of pill keys that stay lit.
 */
const PRECEDENCE = ['cur', 'locks', 'kin', 'voice', 'look', 'diamond'];
export const TOPBAR_LIT_CAP = 4;
export function litPills(lit) {
  const on = PRECEDENCE.filter((k) => lit[k]);
  return new Set(on.slice(0, TOPBAR_LIT_CAP));
}
