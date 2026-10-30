// blockStops.mjs — #1608 (Strata Q Phase 2): the stop tables for the
// strata BLOCK editors, beside the catalogs they quantize.
//
// Phase 1's table (PARAM_STOPS in data/layout-modes.js) covers the layout
// params — shelves, the #716 motion keys, and the DISH knobs, whose rows
// live in blocks but whose values are layout params. The tables here cover
// what PARAM_SPEC never held: the per-layer composite values (WET, PATCH
// strength), the FX catalog (fx/fxFilters.js FX_EFFECT_DEFS), the MATH
// catalog (fx/mathFilters.js MATH_EFFECT_DEFS), and the PATTERN editor's
// params (state/patternTrack.js).
//
// The law is Phase 0's (docs/research/strata-quantized/plan.md, "Phase 0
// paper"): stops are authored per param, never derived blind; the shipped
// default is always one of the stops; detent labels name EFFECT strength
// (rule 4 — a param whose effect strengthens as its number falls descends
// in effect order, flagged `inverse`); OFF means the param contributes
// nothing, per class (rule 5 — magnitude: the no-effect value, usually
// the floor; identity: the default itself, flagged `identity`); bipolar
// params carry unsigned magnitude stops and a sign cell on the row
// (rule 6, flagged `bipolar`).
//
// Entry shape mirrors PARAM_STOPS: { stops: [off, low, mid, high], ...flags }.
// Catalog keys are `${kind}.${param}`.

/** Stratum WET — the layer's wet/dry (its stored opacity), 0..1, default 1. */
export const WET_STOPS = Object.freeze([0, 0.35, 0.65, 1]);

/**
 * The WET stops under a track ceiling (#1023: HUE ROTATE caps a MATH
 * track's honored wet at 0.5). The authored table is for the param's full
 * range; a ceiling scales the stops exactly as the old slider's max did,
 * so a hand tap on a capped track never writes past what the renderer
 * will honor — and uncapped tracks read the authored table untouched.
 */
export function wetStopsForCap(cap) {
  if (!(cap < 1)) return [...WET_STOPS];
  return WET_STOPS.map((s) => Math.round(s * cap * 100) / 100);
}

/** PATCH strength (FEED / MOD / FIELD), 0..1 — the shipped default 0.16 is LOW. */
export const PATCH_STRENGTH_STOPS = Object.freeze([0, 0.16, 0.5, 1]);

export const FX_PARAM_STOPS = {
  // EF-1 · Blur / Focus
  'sharpen.amount': { stops: [0, 0.6, 1.2, 2] },
  'sharpen.radius': { stops: [0.5, 1, 1.8, 3] }, // a setting: stops ascend from the floor (the plateRadius precedent)
  'haze.amount': { stops: [0, 0.35, 0.65, 1] },
  'haze.lift': { stops: [0, 0.25, 0.5, 0.85] }, // how light the mist is — a setting, default mid
  // EF-2 · Distort
  'displace.scale': { stops: [0, 24, 60, 120] },
  'displace.seed': { stops: [0, 7, 42, 99] }, // a setting (which warp), not a magnitude: authored seed detents
  'displace.warp': { stops: [0, 15, 35, 60] },
  'tear.bands': { stops: [2, 18, 36, 60] },
  'tear.amount': { stops: [0, 12, 24, 40] },
  'rgbSplit.dx': { stops: [0, 3, 10, 24] },
  'feedbackWarp.amount': { stops: [0, 0.3, 0.6, 1] },
  // EF-3 · Tonal
  // Rule 4: fewer levels = a stronger poster — the stops descend in effect order.
  'posterize.levels': { stops: [8, 6, 4, 2], inverse: true },
  'grade.hue': { stops: [0, 30, 90, 180], bipolar: true },
  // Identity class (Phase 0 names chroma + lift explicitly): OFF is the
  // shipped 1, never the floor — chroma at 0 is full desaturation, an
  // effect, not an off. The detents run in the op's working direction.
  'grade.chroma': { stops: [1, 1.3, 1.6, 2], identity: true },
  'grade.lift': { stops: [1, 1.15, 1.3, 1.5], identity: true },
  // EF-4 · Finish
  'grain.amount': { stops: [0, 0.4, 0.7, 1] },
  'scanlines.density': { stops: [0.05, 0.35, 0.65, 1] }, // line frequency — a setting from the floor
  'scanlines.amount': { stops: [0, 0.5, 0.8, 1] },
  'halo.amount': { stops: [0, 0.4, 0.8, 1.5] },
  'halo.radius': { stops: [1, 8, 18, 64] }, // a setting: how far the light spreads
  'halo.threshold': { stops: [0, 0.2, 0.45, 0.75] }, // a setting: the bloom cut point
  'halo.vignette': { stops: [0, 0.3, 0.6, 1] },
  // invert / solarize / edge carry no params — no entries, by census.
};

export const MATH_PARAM_STOPS = {
  'gain.exposure': { stops: [0, 0.5, 1.5, 3], bipolar: true },
  'lift.offset': { stops: [0, 0.15, 0.45, 1], bipolar: true },
  'contrast.amount': { stops: [0, 0.25, 0.5, 1] },
  // Identity class (Phase 0 names saturate explicitly): OFF = 1 as-is.
  'saturate.saturation': { stops: [1, 1.3, 1.6, 2], identity: true },
  'threshold.level': { stops: [0, 0.25, 0.5, 0.75] }, // the cut point — a setting from the floor
  'threshold.softness': { stops: [0, 0.2, 0.5, 1] },
  // Rule 4: fewer steps = a harder cut — the stops descend in effect order.
  'quantize.steps': { stops: [16, 8, 4, 2], inverse: true },
  'knee.rolloff': { stops: [0, 0.5, 0.8, 1] },
  'tempTint.temperature': { stops: [0, 0.25, 0.6, 1], bipolar: true },
  'tempTint.tint': { stops: [0, 0.25, 0.6, 1], bipolar: true },
  'vignette.amount': { stops: [0, 0.3, 0.5, 1] },
  'vignette.roundness': { stops: [0, 0.25, 0.5, 1] }, // falloff shape — a setting, default mid
  // r_to_r is identity by the law's own definition: the shipped default 1
  // IS the value at which the route contributes nothing new (red passes as
  // red). OFF = 1; the detents run toward less red. Its sibling routes are
  // plain magnitudes from 0.
  'channelMix.r_to_r': { stops: [1, 0.7, 0.4, 0], identity: true },
  'channelMix.r_to_g': { stops: [0, 0.3, 0.65, 1] },
  'channelMix.r_to_b': { stops: [0, 0.3, 0.65, 1] },
  'hueRotate.degrees': { stops: [0, 45, 90, 180], bipolar: true },
  'levelsFixed.black': { stops: [0, 0.1, 0.25, 0.5] },
  // Identity: white at 1 is the levels untouched; lower bites harder, so
  // the stops descend in effect order (rules 4 + 5 together).
  'levelsFixed.white': { stops: [1, 0.85, 0.65, 0.4], identity: true },
};

export const PATTERN_STOPS = {
  // Every mode's shipped density default is a stop (QUILT 8 · GLYPH 4 ·
  // FIELD 6 · TIDES 10) — with four modes and four detents the table is
  // exactly the defaults; 11–12 stay reachable in the exact editor.
  density: { stops: [4, 6, 8, 10] },
  // Both shipped mix defaults are stops: 0.4 (TIDES) and 0.55 (the rest).
  mix: { stops: [0, 0.4, 0.55, 1] },
  grout: { stops: [0, 0.015, 0.03, 0.08] },
  hero: { stops: [0, 0.25, 0.5, 1] },
  drift: { stops: [0, 0.25, 0.55, 1] },
  movers: { stops: [0, 0.3, 0.6, 1] },
};

/** The catalog entry for one FX param (`kind`, `param`), or null when it has none. */
export function fxStopsFor(kind, param) {
  return FX_PARAM_STOPS[`${kind}.${param}`] ?? null;
}

/** The catalog entry for one MATH param (`kind`, `param`), or null when it has none. */
export function mathStopsFor(kind, param) {
  return MATH_PARAM_STOPS[`${kind}.${param}`] ?? null;
}

/** The entry for one PATTERN param key, or null when it has none. */
export function patternStopsFor(key) {
  return PATTERN_STOPS[key] ?? null;
}
