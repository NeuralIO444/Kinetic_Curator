// audioBallistics.mjs — envelope ballistics for audio reactivity (#306).
//
// The raw gain mapping (applyAudioEnvelope in accum.mjs) reads an envelope
// sample { rms, flux, beatPulse } every frame. Raw analyser output is
// jittery: transients snap the driven scale/rotation/glow hard, then drop.
// Ballistics shape each sample through an envelope follower (attack/release
// time constants) and a response curve *before* it reaches the mapping, so
// the gestures land with a heavy, fluid weight instead of snapping.
//
// Pure and DOM-free: the caller owns one follower state object per audio
// session (createBallisticsState), feeds raw samples plus wall-clock dt,
// and gets a shaped sample back. Silence (all zeros) decays to exact zeros
// — values below the epsilon snap to 0 — so the downstream no-op contracts
// (applyAudioEnvelope's silence passthrough) are preserved exactly.
//
// The response curves:
//   linear      — the followed value, unchanged.
//   exponential — x²: suppresses low-level jitter, loud passages hit with
//                 weight. The default; transients stop snapping.
//   logarithmic — lifts quiet swells toward audibility (subtle music stays
//                 visible instead of sitting under the floor).
//   peak-hold   — snap to the peak instantly, then fall off linearly at
//                 1/releaseMs per ms. Punchy attacks, smooth decays.

export const BALLISTICS_CURVES = ['linear', 'exponential', 'logarithmic', 'peak-hold'];

/** Live-instrument defaults: fast enough to feel played, slow enough to flow. */
export const BALLISTICS_DEFAULTS = Object.freeze({
  attackMs: 25,
  releaseMs: 320,
  curve: 'exponential',
  swell: 1,
});

// Below this a shaped value is exactly 0 — silence is a true no-op downstream.
const EPSILON = 1e-4;

function clampNum(v, lo, hi, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
}

/** Clamp/validate a partial ballistics param set onto the defaults. */
export function sanitizeBallistics(partial = {}) {
  const p = partial && typeof partial === 'object' ? partial : {};
  return {
    attackMs: clampNum(p.attackMs, 0, 2000, BALLISTICS_DEFAULTS.attackMs),
    releaseMs: clampNum(p.releaseMs, 0, 5000, BALLISTICS_DEFAULTS.releaseMs),
    curve: BALLISTICS_CURVES.includes(p.curve) ? p.curve : BALLISTICS_DEFAULTS.curve,
    swell: clampNum(p.swell, 0, 1, BALLISTICS_DEFAULTS.swell),
  };
}

/** Fresh follower state: channel name -> followed value. */
export function createBallisticsState() {
  return {};
}

/** Zero the follower — call on audio session start / source switch so the
 *  envelope never resumes from a stale previous session. */
export function resetBallistics(state) {
  for (const k of Object.keys(state)) state[k] = 0;
  return state;
}

// Shape the *followed* value, 0..1 -> 0..1. Peak-hold's shape lives in the
// follower itself (snap + linear falloff), so its curve is the identity.
function applyCurve(x, curve) {
  switch (curve) {
    case 'exponential':
      return x * x;
    case 'logarithmic':
      return Math.log1p(9 * x) / Math.log1p(9);
    case 'linear':
    case 'peak-hold':
    default:
      return x;
  }
}

function followChannel(prev, raw, dtMs, { attackMs, releaseMs, curve }) {
  // A tab-switch gap must not freeze the follower mid-value: it converges
  // to the raw sample on a long dt instead.
  const dt = Math.min(250, Math.max(0, dtMs || 0));
  if (raw > prev) {
    // Attack. Peak-hold snaps to the peak instantly; attack 0 = instant.
    if (curve === 'peak-hold' || attackMs <= 0) return raw;
    return prev + (raw - prev) * (1 - Math.exp(-dt / attackMs));
  }
  if (curve === 'peak-hold') {
    // Hold the peak, fall off linearly at 1/releaseMs per ms. Never falls
    // below the current raw sample — a rising tail catches the fall.
    return releaseMs <= 0 ? raw : Math.max(raw, prev - dt / releaseMs);
  }
  const k = releaseMs <= 0 ? 1 : 1 - Math.exp(-dt / releaseMs);
  return prev + (raw - prev) * k;
}

/**
 * Shape one raw envelope sample through the follower.
 *
 * @param {object} state  per-session follower state (mutated in place)
 * @param {object} raw    { channel: 0..1 } — e.g. { rms, flux, beatPulse }
 * @param {number} dtMs   milliseconds since the previous sample
 * @param {object} params { attackMs, releaseMs, curve } (sanitized here)
 * @returns a shaped sample with the same channels as `raw`.
 */
export function processBallistics(state, raw, dtMs, params = {}) {
  const p = sanitizeBallistics(params);
  const out = {};
  for (const [k, rv] of Object.entries(raw || {})) {
    const r = Number.isFinite(rv) ? Math.min(1, Math.max(0, rv)) : 0;
    const prev = Number.isFinite(state[k]) ? state[k] : 0;
    let v = applyCurve(followChannel(prev, r, dtMs, p), p.curve);
    if (v < EPSILON) v = 0;
    state[k] = v;
    out[k] = v;
  }
  return out;
}
