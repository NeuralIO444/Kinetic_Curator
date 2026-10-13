// motionTap.mjs — #1469: the always-alive motion, published once a frame for the STIMULI readout. A module holder,
// like audioMeterTap: NOT store state (no re-render per frame), read-only for everyone but the live loop. The values
// are the engine's own numbers (kineme amounts, the life breath, wind); nothing here simulates anything.
export const MOTION_KEYS = Object.freeze(['life', 'drift', 'breath', 'pulse', 'wind', 'rhythm', 'palette']);

const cur = { life: 0, drift: 0, breath: 0, pulse: 0, wind: 0, rhythm: 0, palette: 0 };

/** The live loop publishes the frame's values (copied in place: no per-frame allocation). */
export function publishMotion(v) {
  for (const k of MOTION_KEYS) cur[k] = Number.isFinite(v[k]) ? v[k] : 0;
}

/** The latest values, 0..1 each. Read-only by contract: callers must not write to it. */
export function readMotion() {
  return cur;
}
