/**
 * MATH layer filters — the math-op catalog for #1010.
 *
 * A MATH track holds an ordered `effects` array exactly like an FX track,
 * e.g. [{ kind: 'gain', params: { exposure: 1.5 }, mod: { exposure: 'beatPulse' } }]
 * but every kind is a pure-ALU tone op (tier 3) from gl/effects/mathShaders.mjs.
 * MATH tracks ride the existing FX fold in gl/renderer.mjs — zero new
 * renderer plumbing — so this module mirrors fxFilters.js's data contract:
 * defs (UI + sanitize), defaults, sanitizer, and the small pure helpers the
 * renderer and the BUILD panel need.
 *
 * Hard rules:
 * - Math ops NEVER sit inside the ACCUM echo/trails feedback path. They
 *   grade the composite fold only; the no-feedback selfcheck asserts no
 *   math kind is referenced from gl/accum.mjs.
 * - Every `math: true` op declares tier 3 (asserted by
 *   gl/effects/mathShaders.selfcheck.mjs).
 * - QUANTIZE ships tone-only. The spec's optional time-hold knob would need
 *   the ACCUM echo ring's held frame as a second texture — new renderer
 *   plumbing, explicitly out. Cut, documented, no stub.
 * - #724 owns the knob-assignment mechanism; this module owns the ops.
 *   A #724 macro may point at a MATH knob, but neither side duplicates the
 *   other's machinery.
 */

export const isMathLayer = (layer) => !!layer && layer.type === 'math';

/** MOD sources for one knob: none, or push the knob toward its max on the envelope. */
export const MATH_MOD_SOURCES = ['none', 'rms', 'flux', 'beatPulse'];

/** HUE ROTATE's default wet ceiling: the track's wrap opacity clamps here. */
export const MATH_WET_CEILING = 0.5;
export const MATH_WET_CEILING_KINDS = ['hueRotate'];

/**
 * Math-op catalog: the single source of truth for the MATH inspector,
 * the sanitizer. Params mirror the template-descriptor shape
 * ({ type, label, min, max, step, def, unit, hint }); the shader-side
 * descriptors in gl/effects/mathShaders.mjs duplicate these numbers and
 * mathShaders.selfcheck.mjs pins the two catalogs together.
 * `unit` is the artist-unit suffix for readouts ('st', '°', 'steps', '').
 */
export const MATH_EFFECT_DEFS = {
  gain: {
    label: 'Gain',
    hint: 'The rescuer. Fixed-point exposure multiply — pull a blown-out stack back in one gesture.',
    params: {
      exposure: { type: 'float', label: 'Exposure', unit: 'st', min: -3, max: 3, step: 0.1, def: 0, hint: 'Stops of exposure. 0 is the picture untouched.' },
    },
  },
  lift: {
    label: 'Lift',
    hint: "Gain's partner. Lifts or crushes the blacks with a straight offset.",
    params: {
      offset: { type: 'float', label: 'Offset', unit: '', min: -1, max: 1, step: 0.01, def: 0, hint: 'Straight add. Positive lifts blacks, negative crushes them.' },
    },
  },
  contrast: {
    label: 'Contrast',
    hint: 'S-curve around the 0.5 luminance pivot. Snaps the mids apart.',
    params: {
      amount: { type: 'float', label: 'Amount', unit: '', min: 0, max: 1, step: 0.01, def: 0.5, hint: 'S-curve strength. 0 is the picture untouched.' },
    },
  },
  saturate: {
    label: 'Saturate',
    hint: 'Luma-preserving saturation. 0 is grey, 1 is as-is, past 1 runs hot.',
    params: {
      saturation: { type: 'float', label: 'Saturation', unit: '', min: 0, max: 2, step: 0.05, def: 1, hint: '0 is grey, 1 is unchanged, up to 2 is hot.' },
    },
  },
  threshold: {
    label: 'Threshold',
    hint: 'Hard cut to black-and-white. Put level on beatPulse for the drop.',
    params: {
      level: { type: 'float', label: 'Level', unit: '', min: 0, max: 1, step: 0.01, def: 0.5, hint: 'Luminance cut point. MOD: beatPulse slams it on the one.' },
      softness: { type: 'float', label: 'Softness', unit: '', min: 0, max: 1, step: 0.01, def: 0, hint: 'Edge feather. 0 is a hard cut.' },
    },
  },
  quantize: {
    label: 'Quantize',
    hint: 'Tone steps only — stepped film-stutter over smooth flow. (Time hold was cut: it needs the echo ring, which is new plumbing.)',
    params: {
      steps: { type: 'int', label: 'Steps', unit: 'steps', min: 2, max: 16, step: 1, def: 8, hint: 'Tonal steps per channel. ≤ 4 reads hard — the track name flashes.' },
    },
  },
  knee: {
    label: 'Knee',
    hint: 'Highlight rolloff — soft-clips the whites so they never hit pure clip.',
    params: {
      rolloff: { type: 'float', label: 'Rolloff', unit: '', min: 0, max: 1, step: 0.01, def: 0.5, hint: 'Shoulder compression above 0.8. 0 is off.' },
    },
  },
  tempTint: {
    label: 'Temp / Tint',
    hint: 'White-balance grade. Warmth on temperature, green–magenta on tint.',
    params: {
      temperature: { type: 'float', label: 'Temperature', unit: '', min: -1, max: 1, step: 0.01, def: 0, hint: 'Warm (+) / cool (−) balance.' },
      tint: { type: 'float', label: 'Tint', unit: '', min: -1, max: 1, step: 0.01, def: 0, hint: 'Green (+) / magenta (−) shift.' },
    },
  },
  vignette: {
    label: 'Vignette',
    hint: 'Edge falloff. Pulls the eye to the middle of the frame.',
    params: {
      amount: { type: 'float', label: 'Amount', unit: '', min: 0, max: 1, step: 0.01, def: 0.5, hint: 'Edge darkening. 0 is off.' },
      roundness: { type: 'float', label: 'Roundness', unit: '', min: 0, max: 1, step: 0.01, def: 0.5, hint: 'Falloff shape — round to rectangular.' },
    },
  },
  channelMix: {
    label: 'Channel Mix',
    hint: 'Route the red channel: r→r scales red, r→g crossfades green toward red, r→b crossfades blue toward red. Defaults are identity — the picture is untouched until you move a knob.',
    params: {
      r_to_r: { type: 'float', label: 'R → R', unit: '', min: 0, max: 1, step: 0.01, def: 1, hint: 'Red channel gain.' },
      r_to_g: { type: 'float', label: 'R → G', unit: '', min: 0, max: 1, step: 0.01, def: 0, hint: 'Crossfade green toward red.' },
      r_to_b: { type: 'float', label: 'R → B', unit: '', min: 0, max: 1, step: 0.01, def: 0, hint: 'Crossfade blue toward red.' },
    },
  },
  hueRotate: {
    label: 'Hue Rotate',
    hint: '⚠ Dangerous: hue rotation compounds fast and can eat a set. This track is capped at 50% wet while HUE ROTATE is in the chain.',
    params: {
      degrees: { type: 'float', label: 'Degrees', unit: '°', min: -180, max: 180, step: 1, def: 0, hint: 'Hue rotation in degrees. 0 is the picture untouched.' },
    },
  },
  levelsFixed: {
    label: 'Levels (Fixed)',
    hint: 'The 80% auto-normalize: black/white points with no histogram, fully predictable. Never guesses.',
    params: {
      black: { type: 'float', label: 'Black pt', unit: '', min: 0, max: 1, step: 0.01, def: 0, hint: 'Input black point.' },
      white: { type: 'float', label: 'White pt', unit: '', min: 0, max: 1, step: 0.01, def: 1, hint: 'Input white point. Keep above black.' },
    },
  },
};

export const MATH_OP_KINDS = Object.keys(MATH_EFFECT_DEFS);

/** Default chain on a new MATH track: GAIN → CONTRAST, the set-glue two-knob grade. */
export function defaultMathEffects() {
  return [
    { kind: 'gain', params: defaultMathParams('gain'), mod: {} },
    { kind: 'contrast', params: defaultMathParams('contrast'), mod: {} },
  ];
}

/** Default params for one math kind (used by "add op" / "change op"). */
export function defaultMathParams(kind) {
  const def = MATH_EFFECT_DEFS[kind];
  if (!def) return null;
  const params = {};
  for (const [key, p] of Object.entries(def.params)) params[key] = p.def;
  return params;
}

/** Sanitize one mod map: known params + known sources only; 'none' normalizes out. */
function sanitizeMod(kind, raw) {
  const def = MATH_EFFECT_DEFS[kind];
  if (!def || !raw || typeof raw !== 'object') return {};
  const out = {};
  for (const [key, src] of Object.entries(raw)) {
    if (!def.params[key]) continue;
    if (src === 'none' || src == null) continue;
    if (!MATH_MOD_SOURCES.includes(src)) continue;
    out[key] = src;
  }
  return out;
}

/**
 * Sanitize a raw math effects array: drop unknown kinds and non-objects,
 * clamp params to catalog ranges, fill defaults, sanitize mod routing.
 * Fail closed, never throw.
 */
export function sanitizeMathEffects(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const fx of raw) {
    if (!fx || typeof fx !== 'object' || typeof fx.kind !== 'string') continue;
    const def = MATH_EFFECT_DEFS[fx.kind];
    if (!def) continue; // unknown kind: skipped
    const params = {};
    const src = fx.params && typeof fx.params === 'object' ? fx.params : {};
    for (const [key, p] of Object.entries(def.params)) {
      const v = Number(src[key]);
      if (p.type === 'int') {
        params[key] = Number.isFinite(v) ? Math.min(p.max, Math.max(p.min, Math.round(v))) : p.def;
      } else {
        params[key] = Number.isFinite(v) ? Math.min(p.max, Math.max(p.min, v)) : p.def;
      }
    }
    out.push({ kind: fx.kind, params, mod: sanitizeMod(fx.kind, fx.mod) });
  }
  return out;
}

/**
 * Readout theater: does this MATH track change the picture hard?
 * Threshold with a hard-ish edge, or quantize at ≤ 4 steps — the track
 * name flashes in the layer stack (the nanosecond-communication rule).
 */
export function mathTrackHitsHard(layer) {
  if (!isMathLayer(layer) || layer.visible === false) return false;
  for (const fx of layer.effects || []) {
    if (!fx || typeof fx !== 'object') continue;
    if (fx.kind === 'threshold' && Number(fx.params?.softness ?? 0) < 0.5) return true;
    if (fx.kind === 'quantize' && Number(fx.params?.steps ?? 8) <= 4) return true;
  }
  return false;
}

/** Does this track's chain include a wet-ceiling op (HUE ROTATE)? */
export function mathTrackWetCeiling(layer) {
  if (!isMathLayer(layer)) return 1;
  for (const fx of layer.effects || []) {
    if (fx && MATH_WET_CEILING_KINDS.includes(fx.kind)) return MATH_WET_CEILING;
  }
  return 1;
}

/**
 * #1023 — what the wet slider may show for a track. `cap` is the ceiling the
 * renderer enforces; `wet` is the stored value clamped to it, i.e. the value
 * the renderer will actually honor. The STORED opacity is never rewritten, so
 * removing HUE ROTATE brings the performer's own setting back.
 * @returns {{cap:number, wet:number, capped:boolean}}
 */
export function wetDisplay(layer) {
  const cap = mathTrackWetCeiling(layer);
  const stored = layer && layer.layerOpacity != null ? Number(layer.layerOpacity) : NaN;
  const base = Number.isFinite(stored) ? Math.min(1, Math.max(0, stored)) : 1;
  return { cap, wet: Math.min(base, cap), capped: cap < 1 };
}

/** Artist-unit readout for one knob value: stops, degrees, steps, or plain. */
export function formatMathParam(kind, key, value) {
  const p = MATH_EFFECT_DEFS[kind]?.params[key];
  const v = Number(value);
  if (!p || !Number.isFinite(v)) return String(value ?? '');
  if (p.unit === 'st') return `${v > 0 ? '+' : ''}${v.toFixed(1)} st`;
  if (p.unit === '°') return `${Math.round(v)}°`;
  if (p.unit === 'steps') return `${Math.round(v)}`;
  return String(Math.round(v * 100) / 100);
}
