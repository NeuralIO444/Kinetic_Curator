// app/src/engine/queenLean.js — BEAST S4: the Queen's 6th bounded "herding" lean.
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

export function logBias(cycle, bias, log = []) {
  log.push({ cycle, bias, t: Date.now() }); // timestamp only for debug; replay uses the bias value
  return bias;
}
