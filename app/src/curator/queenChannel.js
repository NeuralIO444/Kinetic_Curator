// queenChannel — #1140 PR-3: the deniable consumption channel for the third
// taste head (inclination).
//
// Design-doc reference only (rule 10): nothing in this module may reach a UI
// string, help text, log line, panel, HUD, or saved file. It feeds hidden
// biases ONLY — the visible consumers pick() and scoreBoldness() are never
// touched (queenChannel.selfcheck.mjs asserts the import graph).
//
// The channel is INERT until #762's proof gate clears (overlay question
// answered, taste.json trusted). GATE_OPEN is flipped by a future PR; the
// selfcheck tripwires it so the flip is always deliberate. PR-2's sway module
// (queenLean.mjs) reads through hiddenBias(); the open path is defined there.
import { HEAD_MIN_FIDELITY } from './tasteHead.js';

/**
 * #762 proof gate — false until the overlay question is answered and the
 * artifact is trusted. Flipped by a future PR, never at runtime.
 */
export const GATE_OPEN = false;

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
