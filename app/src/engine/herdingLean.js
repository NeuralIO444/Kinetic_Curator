// app/src/engine/herdingLean.js — BEAST S4: the Queen's 6th bounded "herding" lean.
//
// Biases each beast's target heading toward the user's kept taste.
// Enabled for beasts NOW, independent of the proof gate (#762).
// Values are not persisted; the computed bias is logged per crank cycle for replay.
// Cap on the tilt so it cannot override the creature's own drives.

const LEAN_CAP = 0.25; // radians, max bias

export function queenHerdingLean(tasteHeading, currentHeading, strength = 0.5) {
  const raw = (tasteHeading - currentHeading) * Math.max(0, Math.min(1, strength));
  return Math.max(-LEAN_CAP, Math.min(LEAN_CAP, raw));
}

export function logBias(cycle, bias, t, log = []) {
  // `t` is loop time, passed in by the caller — engine code never reads the
  // wall clock (determinism law, eslint-rules/determinism.mjs), so a replay
  // re-derives the same log. The stamp is debug context only; replay keys
  // on the bias value.
  log.push({ cycle, bias, t });
  return bias;
}
