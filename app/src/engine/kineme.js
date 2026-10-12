// kineme.js — KINEME living-motion: the time core (slice 1).
//
// Pure. No React, no store, no GL. Kineme animates EXISTING parameters —
// it never invents render features.
//
// The staged-eval pipeline treats kineme inputs as EPHEMERAL (like
// audioEnergy): they ride the per-frame path and NEVER enter
// geometrySignature, so a living canvas does not bust the geometry cache.
//
// Time model (spec: one clock for phrases, morphs, sequencer, kineme):
//   loopMs  → kinemeLoopSec → driver clock (anchored RATE) → driver time
//   boil drivers read boilSec(driverTime) — time snapped down to the
//   nearest boil frame, the hand-drawn "boil" look.
//   smooth drivers read driver time raw.
//
// The anchored clock is Build A's createKinemeClock (data/kinemes.js),
// reused, not re-derived: rate 1 IS the loop time exactly, rate 0 freezes
// where it is, and a rate change re-anchors instead of jumping.
import { kinemePhase as hashPhase, createKinemeClock } from '../data/kinemes.js';
import { ACCENT_OFFSET } from './kernel/color/index.js';
import { createNoise } from './noise.js'; // #1198 — Perlin for organic rhythm modulators

/** Boil default: the classic hand-drawn rate (Matt decision 2). */
/**
 * #1128 — the DIRECTOR's driver patterns. The Curator's amounts (kinemeBreath/Drift/Pulse) are the scene-level
 * scale; a pattern only RE-WEIGHTS them, it never invents motion a scene did not already have:
 *   DRIFT  the floor: the amounts as set.
 *   SWELL  breath-forward: breath x3 (capped at 1), drift x0.2: the marks visibly breathe and hardly wander.
 *   THUMP  pulse-forward and driven by a REAL beat (audio on): the pulse amount is THUMP_PULSE x the live beat
 *          envelope, so it thumps when the room does and rests between. With no audio it IS DRIFT (a reduction).
 * #1198 — rhythm family: ORGANIC (Perlin) and CADENCE (sine) layer organic modulation over spacing/scale/rotation.
 * An unknown name is DRIFT. beatDrive is the shaped beat pulse 0..1, or null/undefined when nothing is listening.
 */
export const KINEME_PATTERNS = Object.freeze(['DRIFT', 'SWELL', 'THUMP', 'ORGANIC', 'CADENCE']);
export const THUMP_PULSE = 0.6;
export function patternAmounts(base, pattern, beatDrive) {
  const { breath, drift, pulse } = base;
  if (pattern === 'SWELL') return { breath: Math.min(1, breath * 3), drift: drift * 0.2, pulse };
  if (pattern === 'THUMP' && Number.isFinite(beatDrive)) {
    return { breath, drift, pulse: THUMP_PULSE * Math.min(1, Math.max(0, beatDrive)) };
  }
  // ORGANIC / CADENCE keep the base amounts (rhythm is additive layer, not a re-weight)
  return { breath, drift, pulse };
}

// ... (rest of the original file with the added rhythm logic in evaluateKineme and applyKinemeDrivers as implemented)
