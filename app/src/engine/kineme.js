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

/** Boil default: the classic hand-drawn rate (Matt decision 2). */
export const BOIL_FPS_DEFAULT = 8;
export const BOIL_FPS_MIN = 6;
export const BOIL_FPS_MAX = 12;

/**
 * Loop ms → loop seconds. The loopClock mirror starts at 0 ("not observed
 * yet") — 0 is unknown, not a stamp, so it maps to 0, never backwards.
 */
export function kinemeLoopSec(loopMs) {
  const ms = Number(loopMs);
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return ms / 1000;
}

/** Boil fps into the exposed 6–12 range; garbage → default. */
export function clampBoilFps(fps) {
  const f = Number(fps);
  if (!Number.isFinite(f)) return BOIL_FPS_DEFAULT;
  return Math.min(BOIL_FPS_MAX, Math.max(BOIL_FPS_MIN, f));
}

/** Which boil frame the loop second sits in. */
export function boilStep(loopSec, fps = BOIL_FPS_DEFAULT) {
  const t = Number(loopSec);
  if (!Number.isFinite(t) || t <= 0) return 0;
  return Math.floor(t * clampBoilFps(fps));
}

/** The loop second snapped down to its boil frame. Holds inside a frame. */
export function boilSec(loopSec, fps = BOIL_FPS_DEFAULT) {
  return boilStep(loopSec, fps) / clampBoilFps(fps);
}

/**
 * Per-instance phase: TWO decorrelated [0,1) values from the seed hash —
 * [0] offsets where in the noise field the mark samples, [1] offsets which
 * boil frame it lands on. Copies never move in lockstep.
 *
 * Sine-free by construction: it reuses Build A's djb2 string hash
 * (kinemePhase), which is arithmetic, not the fract(sin(dot)) form that
 * degrades on weaker GPUs. Domain-separated keys decorrelate the pair.
 */
export function kinemePhase2(seed, index) {
  return [hashPhase(seed, `n:${index}`), hashPhase(seed, `b:${index}`)];
}

/** The anchored performer clock. One instance per loop owner. */
export function createDriverClock() {
  return createKinemeClock();
}

/** Driver time in seconds: anchored clock over loop ms at the given RATE. */
export function driverTimeSec(clock, loopMs, rate = 1) {
  return clock.at(kinemeLoopSec(loopMs), rate);
}
