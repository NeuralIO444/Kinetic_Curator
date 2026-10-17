// engine/creaturePose.js — Phase 2 creature system, slice S5: the creature's POSTURE as a pure function of the
// room's band. Four poses (Matt's ruling 8): OPEN (Relax), NEUTRAL (Normal), WITHERED (Tighten — the
// starve-and-wither ruling: chains curl, segments thin, and the MATERIAL dims first and most), and the Relax
// DISPLAY FLOURISH, a slow frame-indexed sway that only deep Relax earns.
//
// THE BAND READER OWNS THE BAND (issues #1635/#1636). This module never decides what band the room is in and
// never re-derives one: the edges are IMPORTED from curator/stress.js (a pure leaf — no store, no clock), the
// caller passes the tracker's filtered outputs (the band it settled on, its smoothed stress), and the only
// thresholds declared here are POSE thresholds (how far into deep Relax the flourish begins, how wide the
// pose's own easing is) — feel constants of the posture, not band constants. Hysteresis lives in the tracker
// alone: the flourish, the one discrete move here, is gated on the tracker's band, so while hysteresis holds
// a band the flourish cannot flicker; everything else blends continuously on the smoothed value, which the
// tracker's EMA already keeps from strobing.
//
// Time is a FRAME INDEX (the builder counts its own frames, like its grow-in ages): the flourish's sway is a
// function of that index, never of a clock. No unseeded chance anywhere: same (band, stress, frame) in, same
// pose out, on any machine.
import { BAND_RELAX, BANDS, RELAX_BELOW, TIGHTEN_ABOVE } from '../curator/stress.js';

/** How wide (in stress) the pose's easing straddles each band edge: a posture leans in before the band flips. */
export const POSE_BLEND = 0.06;
/** The flourish lives only below this smoothed stress (deep Relax), and is full below FLOURISH_FLOOR. */
export const FLOURISH_CEILING = 0.16;
export const FLOURISH_FLOOR = 0.06;
/** The flourish's sway: degrees of wing swing, one full sway per this many frames (near the moth's own beat). */
export const FLOURISH_FLAP_DEG = 7;
export const FLOURISH_PERIOD_FRAMES = 96;

/**
 * The four poses as parameter endpoints. Deltas are against the moth's own recipe/skeleton numbers:
 * foreDirDeg/hindDirDeg add to the wing directions, bodyScale/wingScale multiply the trait scales,
 * chainCurlDeg adds per-segment curl to every chain (positive curls the tips under), dim is the material's
 * brightness for whoever skins/paints the creature (S2/S4 consume it; 1 = undimmed). WITHERED leads with
 * the material, per the ruling: dim falls furthest, then the chains thin (wingScale), then the curl.
 */
export const POSE_PARAMS = Object.freeze({
  open: Object.freeze({ foreDirDeg: 10, hindDirDeg: 6, bodyScale: 1.06, wingScale: 1.08, chainCurlDeg: 0, dim: 1 }),
  neutral: Object.freeze({ foreDirDeg: 0, hindDirDeg: 0, bodyScale: 1, wingScale: 1, chainCurlDeg: 0, dim: 1 }),
  withered: Object.freeze({ foreDirDeg: -16, hindDirDeg: -12, bodyScale: 0.93, wingScale: 0.88, chainCurlDeg: 10, dim: 0.5 }),
  flourish: Object.freeze({ foreDirDeg: 20, hindDirDeg: 12, bodyScale: 1.1, wingScale: 1.14, chainCurlDeg: -4, dim: 1 }),
});

const clamp01 = (v) => Math.min(1, Math.max(0, v));
/** Smoothstep on [lo, hi]: 0 at/below lo, 1 at/above hi, eased between. Exact at the ends. */
const ramp = (lo, hi, v) => {
  const t = clamp01((v - lo) / (hi - lo));
  return t * t * (3 - 2 * t);
};

/**
 * The pose for one frame.
 *
 * @param band   the band reader's filtered band ('relax' | 'normal' | 'tighten'); anything else = no pose
 * @param stress the band reader's SMOOTHED stress, 0..1 — the continuous blend rides this, never the raw value
 * @param frame  the frame index (the flourish's sway phase); junk reads as 0
 * @returns null when there is no band to pose against, else
 *   { name, weights: { open, neutral, withered, flourish }, foreDirDeg, hindDirDeg, bodyScale, wingScale,
 *     chainCurlDeg, dim }
 *   Weights sum to 1; at a band's depths exactly one weight is 1 and the parameters are that pose's, exactly.
 */
export function creaturePose({ band = null, stress = NaN, frame = 0 } = {}) {
  if (!BANDS.includes(band) || !Number.isFinite(stress)) return null;
  const s = clamp01(stress);
  const f = Number.isFinite(frame) ? Math.max(0, Math.floor(frame)) : 0;

  // Blend on the smoothed value, easing across the reader's own edges (imported, never re-stated).
  let open = 1 - ramp(RELAX_BELOW - POSE_BLEND, RELAX_BELOW + POSE_BLEND, s);
  const withered = ramp(TIGHTEN_ABOVE - POSE_BLEND, TIGHTEN_ABOVE + POSE_BLEND, s);
  // The flourish is carved out of OPEN, and only where the reader's band itself says Relax: hysteresis
  // holding Normal at a low value keeps the display move off, however deep the smoothed value dips.
  let flourish = 0;
  if (band === BAND_RELAX) {
    flourish = open * (1 - ramp(FLOURISH_FLOOR, FLOURISH_CEILING, s));
    open -= flourish;
  }
  const neutral = 1 - open - withered - flourish;
  const weights = { open, neutral, withered, flourish };

  const mix = (key) => (
    weights.open * POSE_PARAMS.open[key]
    + weights.neutral * POSE_PARAMS.neutral[key]
    + weights.withered * POSE_PARAMS.withered[key]
    + weights.flourish * POSE_PARAMS.flourish[key]
  );

  // The flourish's sway: a frame-indexed angle offset, in counterphase on the hind pair (the moth's own
  // hind beat runs at 0.7 against the fore pair — the same character, stated here as a pose constant).
  const sway = flourish * FLOURISH_FLAP_DEG * Math.sin((2 * Math.PI * f) / FLOURISH_PERIOD_FRAMES);

  let name = 'neutral';
  let best = weights.neutral;
  if (weights.open > best) { name = 'open'; best = weights.open; }
  if (weights.flourish > best) { name = 'flourish'; best = weights.flourish; }
  if (weights.withered > best) { name = 'withered'; }

  return {
    name,
    weights,
    foreDirDeg: mix('foreDirDeg') + sway,
    hindDirDeg: mix('hindDirDeg') - sway * 0.7,
    bodyScale: mix('bodyScale'),
    wingScale: mix('wingScale'),
    chainCurlDeg: mix('chainCurlDeg'),
    dim: mix('dim'),
  };
}

