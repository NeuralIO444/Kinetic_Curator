// taper.js — shared slider response curves (#274).
//
// Every slider used to map its position to a parameter with a hand-rolled
// linear mapping. Some parameters are linear (fine), some are log-perceptual
// (noise freq), some are hyperbolic (fade), some compound in feedback (glow).
// A taper maps a 0..1 slider position to a physical parameter value at the
// panel→state boundary. Stored params stay in physical units — only the slider
// position is remapped — so renders are identical for the same stored value.
//
// A taper is { toParam(s01) -> physical, toSlider(v) -> 0..1 }. Both ends must
// round-trip: toSlider(toParam(s)) ≈ s. RangeRow applies the taper when it
// gets a `taper` prop; without one it behaves exactly as before (linear —
// today's mapping), so honest sliders are untouched.

const clamp01 = (s) => Math.min(1, Math.max(0, s));

/** Linear: today's mapping. The default — honest sliders keep it. */
const linear = (min, max) => ({
  toParam: (s) => min + clamp01(s) * (max - min),
  toSlider: (v) => clamp01((v - min) / (max - min)),
});

/** Exponential: log-perceptual quantities (noise freq — wavelength = 1/f). */
const exponential = (min, max) => ({
  toParam: (s) => min * Math.pow(max / min, clamp01(s)),
  toSlider: (v) => clamp01(Math.log(Math.max(v, 1e-9) / min) / Math.log(max / min)),
});

/** Power curve: quantities that compound in feedback (glow — bloom adds into
 *  the feedback buffer every frame, so the top of a linear slider is violent
 *  and the bottom is dead). exp=2: full travel stays usable. */
const power = (min, max, exp = 2) => ({
  toParam: (s) => min + (max - min) * Math.pow(clamp01(s), exp),
  toSlider: (v) => clamp01(Math.pow((v - min) / (max - min), 1 / exp)),
});

/** Half-life: trail persistence. The slider sweeps trail half-life in frames
 *  (physical, log-ish) instead of the raw keep factor whose drama is crammed
 *  into 0.9–0.98. Convert to keep at the loop boundary: keep = 0.5^(1/hl). */
const halfLife = (minFrames, maxFrames) => ({
  toParam: (s) => minFrames * Math.pow(maxFrames / minFrames, clamp01(s)),
  toSlider: (v) => clamp01(Math.log(Math.max(v, 1e-9) / minFrames) / Math.log(maxFrames / minFrames)),
});

/** Soft knee: linear to the knee, deliberately compressed after (displace —
 *  honest to ~120, the top end reachable only in the last quarter of travel). */
const softKnee = (knee, max) => ({
  toParam: (s) => {
    const c = clamp01(s);
    return c <= 0.75 ? (c / 0.75) * knee : knee + ((c - 0.75) / 0.25) * (max - knee);
  },
  toSlider: (v) => {
    if (v <= knee) return clamp01((v / knee) * 0.75);
    return clamp01(0.75 + ((v - knee) / (max - knee)) * 0.25);
  },
});

const KINDS = { linear, exponential, power, halfLife, softKnee };

/**
 * Get a taper by kind. min/max are physical units (ignored by halfLife and
 * softKnee, which take their geometry from opts).
 * @param {string} kind 'linear'|'exponential'|'power'|'halfLife'|'softKnee'
 * @param {object} opts { min, max, exp, minFrames, maxFrames, knee }
 */
export function getTaper(kind, opts = {}) {
  const make = KINDS[kind];
  if (!make) throw new Error(`[taper] unknown taper kind "${kind}"`);
  if (kind === 'halfLife') return make(opts.minFrames ?? 1, opts.maxFrames ?? 40);
  if (kind === 'softKnee') return make(opts.knee ?? 120, opts.max ?? 250);
  if (kind === 'power') return make(opts.min ?? 0, opts.max ?? 1, opts.exp ?? 2);
  return make(opts.min ?? 0, opts.max ?? 100);
}

/** Trail half-life (frames) → per-frame keep factor. Inverse of the fade taper. */
export function halfLifeToKeep(hl) {
  const h = Math.max(0.25, Number(hl) || 1);
  return Math.pow(0.5, 1 / h);
}
