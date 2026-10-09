// queenChannel — #1140 PR-3: the deniable consumption channel for the third
// taste head (inclination).
//
// Design-doc reference only (rule 10): nothing in this module may reach a UI
// string, help text, log line, panel, HUD, or saved file. It feeds hidden
// biases ONLY — the visible consumers pick() and scoreBoldness() are never
// touched (queenChannel.selfcheck.mjs asserts the import graph).
//
// The channel was INERT until #762's proof gate cleared. It cleared on 2026-10-08 (taste.json trusted: fidelity 0.733,
// held out 0.595, Matt approved the picks) and Matt opened the rank and temperature sway the same day. GATE_OPEN is
// still a CONSTANT, never a runtime value, and the selfcheck tripwires it so any flip is deliberate. The sway module
// (queenLean.mjs) reads it; the Director hosts the consumers.
import { HEAD_MIN_FIDELITY } from './tasteHead.js';

/**
 * #762 proof gate: OPEN since 2026-10-08 (Matt: "open it, rank + temperature"). A constant, flipped by a PR, never at
 * runtime. Opening it does not make anything visible: nothing on any surface reads it.
 */
export const GATE_OPEN = true;

/** The hidden-bias knobs PR-2's M1–M5 read. All zero = she is not leaning. */
export const NEUTRAL_BIAS = Object.freeze({
  rank: 0,
  temperature: 0,
  palette: 0,
  phrase: 0,
  reactivity: 0,
});
export const BIAS_KEYS = Object.freeze(Object.keys(NEUTRAL_BIAS));

/** The validated third head, or null when absent/neutral. Never throws. */
export function readQueenHead(taste) {
  const head = taste && taste.queen && taste.queen.head;
  return head && typeof head === 'object' ? head : null;
}

/** True only when the gate is open AND a usable third head is loaded. */
export function isLive(taste) {
  if (!GATE_OPEN) return false;
  const head = readQueenHead(taste);
  return !!head && head.fidelity >= HEAD_MIN_FIDELITY;
}

/**
 * Hidden biases for one candidate's signal map. While the gate is closed
 * every input maps to the neutral bias — flipping inputs changes no output
 * (proven by queenChannel.selfcheck.mjs). PR-2 defines the open path.
 */
export function hiddenBias(taste, signals) {
  void taste;
  void signals;
  return NEUTRAL_BIAS;
}
