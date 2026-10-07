// shuffleGate.js — the DROP gate: BEAT-quantized SHUFFLE (#1042).
//
// SHUFFLE writes a new uint32 SEED (and re-runs `assign` only: no bake, no
// atlas). DROP decides WHEN it lands:
//
//   DROP off                      immediate, same frame
//   DROP on, BEAT not running     immediate (unquantized)
//   DROP on, BEAT running         pending, fires at the next bar boundary
//
// High DRIFT never implies DROP: nothing here reads drift.
//
// Decisions (Matt, 2026-10-06): "BEAT running" is always on whenever a BPM is
// set, so DROP alone gates; the bar is FIXED at 4 beats; the bar grid is
// absolute on the loop clock (no tap-as-downbeat anchor in v1, a known
// ceiling: the grid lines up with the music only if the tempo was tapped on a
// downbeat).
//
// Pure and wall-clock-free: the loop clock is an argument, so a held clock
// (freeze, slow render, batch pause) holds the pending shuffle and it fires on
// thaw. The gate is a plain value; every function returns the next one.

import { sanitizeBeatBpm } from '../gl/beatClock.mjs';

/** A bar is four beats, fixed, independent of phraseLength. */
export const BAR_BEATS = 4;

/** Bar length in loop ms: 120 BPM → 2000, 300 → 800, 30 → 8000. */
export const barMs = (bpm) => (BAR_BEATS * 60000) / sanitizeBeatBpm(bpm);

/** The first bar boundary STRICTLY after `loopMs`: a tap exactly on a boundary lands on the next bar. */
export function nextBarMs(loopMs, bpm) {
  const bar = barMs(bpm);
  return (Math.floor(loopMs / bar) + 1) * bar;
}

/** BEAT is running when a BPM is set and the loop clock has been observed (0 = not yet). */
export const beatRunning = (bpm, loopMs) => bpm != null && Number.isFinite(Number(bpm)) && Number.isFinite(loopMs) && loopMs > 0;

/** A fresh gate: nothing pending. */
export const createShuffleGate = () => Object.freeze({ pendingAt: null, bpm: null });

const settle = (gate, fire) => ({ gate, fire });

/**
 * SHUFFLE was pressed.
 * @param {{pendingAt:number|null, bpm:number|null}} gate
 * @param {{drop:boolean, bpm:number, loopMs:number}} now
 * @returns {{gate, fire:boolean}} fire = reseed in THIS frame
 */
export function requestShuffle(gate, { drop, bpm, loopMs }) {
  if (!drop || !beatRunning(bpm, loopMs)) return settle(createShuffleGate(), true);
  if (gate.pendingAt != null) return settle(gate, false); // coalesce: one reseed per bar
  return settle(Object.freeze({ pendingAt: nextBarMs(loopMs, bpm), bpm: sanitizeBeatBpm(bpm) }), false);
}

/**
 * One frame. Call once per presented frame with the loop clock.
 * - DROP turned off while pending: flush now, never strand it.
 * - BPM changed while pending: recompute the bar from the current loop time.
 * - Clock rolled back (a new take): re-arm to the next bar instead of waiting out a stale target.
 * - Held clock: `loopMs` does not move, so nothing fires; a thaw jump fires once.
 */
export function tickShuffle(gate, { drop, bpm, loopMs }) {
  if (gate.pendingAt == null) return settle(gate, false);
  if (!drop || !beatRunning(bpm, loopMs)) return settle(createShuffleGate(), true);
  let { pendingAt } = gate;
  const b = sanitizeBeatBpm(bpm);
  if (b !== gate.bpm || loopMs < pendingAt - barMs(bpm)) pendingAt = nextBarMs(loopMs, bpm);
  if (loopMs >= pendingAt) return settle(createShuffleGate(), true);
  return settle(Object.freeze({ pendingAt, bpm: b }), false);
}
