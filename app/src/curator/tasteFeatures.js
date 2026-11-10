// tasteFeatures.js — the 19 honest visual features, as a pure leaf.
//
// #2046 (Canon S4): extractFeatures moved here from curator/taste.js, unchanged, so the data layer can measure a
// recipe in taste's own terms without importing the curator machinery (the Director, LOIS's rank, the activity
// feed). A Canon style's `feel` — and so a Book chapter's — is this function averaged over the style's own
// looks (data/canon/settings.js). curator/taste.js re-exports it; every existing import still resolves.
//
// Pure: no imports, no state.

const clamp01 = (v) => Math.min(1, Math.max(0, v));
// Unknown/missing feature: neutral 0.5, never 0 (0 would read as "absent").
const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) ? clamp01((v - lo) / (hi - lo)) : 0.5);
const rangeMean = (r, lo, hi) => (Array.isArray(r) && r.length >= 2 ? num((r[0] + r[1]) / 2, lo, hi) : 0.5);
const rangeSpan = (r, lo, hi) => (Array.isArray(r) && r.length >= 2 ? num(Math.abs(r[1] - r[0]), 0, hi - lo) : 0.5);

/**
 * Measure 19 honest visual features from a candidate layoutParams object.
 * Every feature is normalized 0..1 and computed only from values that are
 * actually in the params. Palette is NOT randomized by the Curator, so
 * there is deliberately no palette feature — that would be a fake signal.
 * Never throws; never mutates its input.
 */
export function extractFeatures(params) {
  const p = params ?? {};
  const disorder = (num(p.jitter, 0, 150) + num(p.displacement, 0, 150)) / 2;
  return {
    markDensity: num(p.count, 30, 600),
    markSize: rangeMean(p.scale, 0.1, 3.0),
    sizeVariety: rangeSpan(p.scale, 0.1, 3.0),
    rotationSpread: rangeSpan(p.rotate, -180, 180),
    opacity: rangeMean(p.alpha, 10, 100),
    opacityVariety: rangeSpan(p.alpha, 10, 100),
    disorder,
    coverage: num(p.density, 20, 120),
    depth: num(p.zTiers, 1, 10),
    flowEnergy: num(p.noiseSpeed, 0.1, 2.0),
    flowWarp: num(p.noiseFreq, 0.002, 0.015),
    swarmDrive: num(p.swarmCohesion, 0.2, 4.0),
    attractors: num(p.gravityWells, 0.1, 3.0),
    particles: num(p.particleCount, 50, 300),
    calm: num(p.damping, 0.9, 0.98),
    // #518 motion features — from the same keys the Motion factors drive.
    windPush: num(p.wind, 0, 3),
    breathSwell: num(p.breath, 0, 1),
    drift: num(p.lifeDrift, 0, 1),
    flowRate: num(p.flap, 0, 1), // flap = wing/tail beat rate
  };
}

/** The feature names extractFeatures measures, in its own order (the 19 of curator/personaTastes.js). */
export const FEATURE_KEYS = Object.freeze(Object.keys(extractFeatures({})));
