/**
 * MATH shader library — order:12 (#1010).
 *
 * Twelve pure-ALU tone ops on the #195 template contract, each tagged
 * `math: true` and registered with registerTemplateEffect. They ride the
 * existing FX fold in gl/renderer.mjs (the fold treats MATH tracks like FX
 * tracks) — zero new renderer plumbing.
 *
 * Like fxShaders.mjs, the descriptors are declared INLINE here rather than
 * imported from the UI-side catalog (fx/mathFilters.js): gl/renderer.mjs's
 * transitive imports must stay inside src/gl/ (the parity harness serves
 * only that subtree). mathShaders.selfcheck.mjs pins the two catalogs
 * together — ranges, defaults, and types must mirror MATH_EFFECT_DEFS.
 *
 * The chain carries premultiplied alpha (see fxShaders.mjs grade): ops that
 * add or reshape color un-premultiply before the math and restore after, so
 * a graded edge pixel never darkens against its own alpha. Pure multiplies
 * (GAIN, VIGNETTE) stay in premultiplied space — identical result, one less
 * divide.
 *
 * Cost: every op declares tier 3 (pure ALU, no taps) — asserted by
 * mathShaders.selfcheck.mjs. Deterministic across renderers (no noise).
 *
 * QUANTIZE ships tone-only. The spec's optional time-hold knob would sample
 * the ACCUM echo ring's held frame — a second texture and new plumbing,
 * explicitly out. Cut, not stubbed.
 */

import { registerTemplateEffect } from './template.mjs';
import { registerCostTier } from '../costTiers.mjs';

const PRELUDE = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform vec2 u_res;
`;

const VARYING = `in vec2 v_cuv;
out vec4 o;
`;

// Un-premultiply helper, inlined per shader (template shaders are
// self-contained; shared math comes from the kc_* chunk library).
const UNPREMULT = `
  vec4 src = texture(u_tex, v_cuv);
  float a = max(src.a, 1e-5);
  vec3 c = src.rgb / a;
`;

const D = (label, hint, params) => ({ label, hint, pad: 0, animated: false, params });
const F = (label, min, max, step, def, hint, ui = 'slider') =>
  ({ type: 'float', label, min, max, step, def, ui, hint });
const I = (label, min, max, def, hint) =>
  ({ type: 'int', label, min, max, step: 1, def, ui: 'slider', hint });

export const MATH_GAIN_FS = PRELUDE + `uniform float u_exposure;
` + VARYING + `void main() {
  vec4 src = texture(u_tex, v_cuv);
  // Pure multiply: identical in premultiplied space, no un-premultiply needed.
  float g = exp2(u_exposure);
  o = vec4(src.rgb * g, src.a);
}
`;
export const MATH_GAIN_DESCRIPTOR = D('Gain',
  'The rescuer. Fixed-point exposure multiply — pull a blown-out stack back in one gesture.',
  { exposure: F('Exposure', -3, 3, 0.1, 0, 'Stops of exposure. 0 is the picture untouched.') });

export const MATH_LIFT_FS = PRELUDE + `uniform float u_offset;
` + VARYING + `void main() {
` + UNPREMULT + `  vec3 lifted = clamp(c + u_offset, 0.0, 1.0);
  o = vec4(lifted * a, a);
}
`;
export const MATH_LIFT_DESCRIPTOR = D('Lift',
  "Gain's partner. Lifts or crushes the blacks with a straight offset.",
  { offset: F('Offset', -1, 1, 0.01, 0, 'Straight add. Positive lifts blacks, negative crushes them.') });

export const MATH_CONTRAST_FS = PRELUDE + `uniform float u_amount;
` + VARYING + `void main() {
` + UNPREMULT + `  // Smoothstep S-curve pivoted on 0.5 luminance.
  vec3 sc = c * c * (3.0 - 2.0 * c);
  vec3 cc = mix(c, clamp(sc, 0.0, 1.0), u_amount);
  o = vec4(cc * a, a);
}
`;
export const MATH_CONTRAST_DESCRIPTOR = D('Contrast',
  'S-curve around the 0.5 luminance pivot. Snaps the mids apart.',
  { amount: F('Amount', 0, 1, 0.01, 0.5, 'S-curve strength. 0 is the picture untouched.') });

export const MATH_SATURATE_FS = PRELUDE + `uniform float u_saturation;
` + VARYING + `void main() {
` + UNPREMULT + `  float l = kc_luma(c);
  vec3 sc = clamp(mix(vec3(l), c, u_saturation), 0.0, 1.0);
  o = vec4(sc * a, a);
}
`;
export const MATH_SATURATE_DESCRIPTOR = D('Saturate',
  'Luma-preserving saturation. 0 is grey, 1 is as-is, past 1 runs hot.',
  { saturation: F('Saturation', 0, 2, 0.05, 1, '0 is grey, 1 is unchanged, up to 2 is hot.') });

export const MATH_THRESHOLD_FS = PRELUDE + `uniform float u_level;
uniform float u_softness;
` + VARYING + `void main() {
` + UNPREMULT + `  float l = kc_luma(c);
  // max() keeps the edge pair ordered at softness 0 — a hard step, no NaN.
  float w = max(u_softness, 1e-4);
  float t = smoothstep(u_level - w * 0.5, u_level + w * 0.5, l);
  o = vec4(vec3(t) * a, a);
}
`;
export const MATH_THRESHOLD_DESCRIPTOR = D('Threshold',
  'Hard cut to black-and-white. Put level on beatPulse for the drop.',
  {
    level: F('Level', 0, 1, 0.01, 0.5, 'Luminance cut point. MOD: beatPulse slams it on the one.'),
    softness: F('Softness', 0, 1, 0.01, 0, 'Edge feather. 0 is a hard cut.'),
  });

export const MATH_QUANTIZE_FS = PRELUDE + `uniform int u_steps;
` + VARYING + `void main() {
` + UNPREMULT + `  float s = float(u_steps);
  vec3 q = floor(c * s + 0.5) / s;
  o = vec4(q * a, a);
}
`;
export const MATH_QUANTIZE_DESCRIPTOR = D('Quantize',
  'Tone steps only — stepped film-stutter over smooth flow. (Time hold was cut: it needs the echo ring, which is new plumbing.)',
  { steps: I('Steps', 2, 16, 8, 'Tonal steps per channel. ≤ 4 reads hard — the track name flashes.') });

export const MATH_KNEE_FS = PRELUDE + `uniform float u_rolloff;
` + VARYING + `void main() {
` + UNPREMULT + `  // Shoulder compression above 0.8: highlights bend instead of clipping.
  vec3 over = max(c - 0.8, vec3(0.0));
  vec3 kc = c - over * u_rolloff * 0.6;
  o = vec4(kc * a, a);
}
`;
export const MATH_KNEE_DESCRIPTOR = D('Knee',
  'Highlight rolloff — soft-clips the whites so they never hit pure clip.',
  { rolloff: F('Rolloff', 0, 1, 0.01, 0.5, 'Shoulder compression above 0.8. 0 is off.') });

export const MATH_TEMPTINT_FS = PRELUDE + `uniform float u_temperature;
uniform float u_tint;
` + VARYING + `void main() {
` + UNPREMULT + `  c.r *= 1.0 + u_temperature * 0.25;
  c.b *= 1.0 - u_temperature * 0.25;
  c.g *= 1.0 + u_tint * 0.15;
  o = vec4(clamp(c, 0.0, 1.0) * a, a);
}
`;
export const MATH_TEMPTINT_DESCRIPTOR = D('Temp / Tint',
  'White-balance grade. Warmth on temperature, green–magenta on tint.',
  {
    temperature: F('Temperature', -1, 1, 0.01, 0, 'Warm (+) / cool (−) balance.'),
    tint: F('Tint', -1, 1, 0.01, 0, 'Green (+) / magenta (−) shift.'),
  });

export const MATH_VIGNETTE_FS = PRELUDE + `uniform float u_amount;
uniform float u_roundness;
` + VARYING + `void main() {
  vec4 src = texture(u_tex, v_cuv);
  // v_cuv is y-down canvas UV (0..1) — resolution-independent.
  vec2 d = (v_cuv - 0.5) * 2.0;
  d.x *= mix(1.0, 0.75, u_roundness);
  float dist = length(d);
  float v = 1.0 - u_amount * smoothstep(0.6, 1.4, dist);
  o = vec4(src.rgb * v, src.a);
}
`;
export const MATH_VIGNETTE_DESCRIPTOR = D('Vignette',
  'Edge falloff. Pulls the eye to the middle of the frame.',
  {
    amount: F('Amount', 0, 1, 0.01, 0.5, 'Edge darkening. 0 is off.'),
    roundness: F('Roundness', 0, 1, 0.01, 0.5, 'Falloff shape — round to rectangular.'),
  });

export const MATH_CHANNELMIX_FS = PRELUDE + `uniform float u_r_to_r;
uniform float u_r_to_g;
uniform float u_r_to_b;
` + VARYING + `void main() {
` + UNPREMULT + `  // Defaults (1, 0, 0) are identity. r→g / r→b crossfade their
  // channel toward red; r→r scales red. The R-into-everything trick.
  vec3 m = vec3(c.r * u_r_to_r, mix(c.g, c.r, u_r_to_g), mix(c.b, c.r, u_r_to_b));
  o = vec4(clamp(m, 0.0, 1.0) * a, a);
}
`;
export const MATH_CHANNELMIX_DESCRIPTOR = D('Channel Mix',
  'Route the red channel: r→r scales red, r→g crossfades green toward red, r→b crossfades blue toward red. Defaults are identity.',
  {
    r_to_r: F('R → R', 0, 1, 0.01, 1, 'Red channel gain.'),
    r_to_g: F('R → G', 0, 1, 0.01, 0, 'Crossfade green toward red.'),
    r_to_b: F('R → B', 0, 1, 0.01, 0, 'Crossfade blue toward red.'),
  });

export const MATH_HUEROTATE_FS = PRELUDE + `uniform float u_degrees;
` + VARYING + `void main() {
` + UNPREMULT + `  vec3 hsl = kc_rgb2hsl(c);
  hsl.x = fract(hsl.x + u_degrees / 360.0);
  vec3 h = kc_hsl2rgb(hsl);
  o = vec4(clamp(h, 0.0, 1.0) * a, a);
}
`;
export const MATH_HUEROTATE_DESCRIPTOR = D('Hue Rotate',
  '⚠ Dangerous: hue rotation compounds fast and can eat a set. The track is capped at 50% wet while HUE ROTATE is in the chain.',
  { degrees: F('Degrees', -180, 180, 1, 0, 'Hue rotation in degrees. 0 is the picture untouched.') });

export const MATH_LEVELSFIXED_FS = PRELUDE + `uniform float u_black;
uniform float u_white;
` + VARYING + `void main() {
` + UNPREMULT + `  // The 80% auto-normalize: user-set points, no histogram, never guesses.
  vec3 lv = clamp((c - u_black) / max(u_white - u_black, 1e-4), 0.0, 1.0);
  o = vec4(lv * a, a);
}
`;
export const MATH_LEVELSFIXED_DESCRIPTOR = D('Levels (Fixed)',
  'The 80% auto-normalize: black/white points with no histogram, fully predictable. Never guesses.',
  {
    black: F('Black pt', 0, 1, 0.01, 0, 'Input black point.'),
    white: F('White pt', 0, 1, 0.01, 1, 'Input white point. Keep above black.'),
  });

const KIND_TO_DEF = {
  gain: [MATH_GAIN_FS, MATH_GAIN_DESCRIPTOR],
  lift: [MATH_LIFT_FS, MATH_LIFT_DESCRIPTOR],
  contrast: [MATH_CONTRAST_FS, MATH_CONTRAST_DESCRIPTOR],
  saturate: [MATH_SATURATE_FS, MATH_SATURATE_DESCRIPTOR],
  threshold: [MATH_THRESHOLD_FS, MATH_THRESHOLD_DESCRIPTOR],
  quantize: [MATH_QUANTIZE_FS, MATH_QUANTIZE_DESCRIPTOR],
  knee: [MATH_KNEE_FS, MATH_KNEE_DESCRIPTOR],
  tempTint: [MATH_TEMPTINT_FS, MATH_TEMPTINT_DESCRIPTOR],
  vignette: [MATH_VIGNETTE_FS, MATH_VIGNETTE_DESCRIPTOR],
  channelMix: [MATH_CHANNELMIX_FS, MATH_CHANNELMIX_DESCRIPTOR],
  hueRotate: [MATH_HUEROTATE_FS, MATH_HUEROTATE_DESCRIPTOR],
  levelsFixed: [MATH_LEVELSFIXED_FS, MATH_LEVELSFIXED_DESCRIPTOR],
};

const COST_NOTES = {
  gain: 'single exp2 + multiply',
  lift: 'single add',
  contrast: 'smoothstep S-curve',
  saturate: 'luma + mix',
  threshold: 'luma + smoothstep',
  quantize: 'floor per channel',
  knee: 'shoulder subtract',
  tempTint: 'three channel scales',
  vignette: 'length + smoothstep, premultiplied multiply',
  channelMix: 'two mixes + scale',
  hueRotate: 'rgb2hsl/hsl2rgb round trip, pure ALU',
  levelsFixed: 'subtract + divide',
};

/**
 * The registry: [kind, { fs, descriptor, file, math, cost }].
 * `math: true` tags the op for the tier-3 selfcheck; the cost id is
 * `math/<kind>` so the governor prices MATH tracks separately.
 */
export const MATH_SHADER_EFFECTS = Object.keys(KIND_TO_DEF).map((kind) => [
  kind,
  {
    fs: KIND_TO_DEF[kind][0],
    descriptor: KIND_TO_DEF[kind][1],
    file: `mathShaders.mjs:${kind}`,
    math: true,
    cost: {
      tier: 3,
      memoryBytes: 1920 * 1080 * 8,
      timeMs: 0.2,
      notes: `pure ALU tone op — ${COST_NOTES[kind]}`,
    },
  },
]);

export const MATH_SHADER_KINDS = MATH_SHADER_EFFECTS.map(([kind]) => kind);

// The registry reads the cost declarations straight out of the definitions
// above — no parallel cost-only map to drift out of sync.
for (const [kind, def] of MATH_SHADER_EFFECTS) {
  registerCostTier(`math/${kind}`, def.cost);
}

/**
 * Register all twelve math ops on a bridge. Call once per bridge
 * (the template registry throws on duplicate kinds — fail closed).
 */
export function registerMathShaders(bridge, gl) {
  for (const [kind, def] of MATH_SHADER_EFFECTS) {
    registerTemplateEffect(bridge, gl, kind, def);
  }
}

/**
 * Per-knob audio modulation for MATH chains (gl-local — renderer.mjs's
 * transitive imports must stay inside src/gl/). Each routed knob is pushed
 * toward its catalog max by the envelope value:
 *   v' = v + e * (max - v), clamped to [min, max]
 * e = 0 (silence, audio off, no source) is a true no-op. Deterministic,
 * no state. Ranges come from the inline descriptors above — the same
 * numbers the mirror selfcheck pins to fx/mathFilters.js.
 *
 * @param {Array} effects — sanitized math effects [{ kind, params, mod }]
 * @param {{rms,flux,beatPulse}|null} audio — envelope sample, 0..1 each
 */
export function applyMathMod(effects, audio) {
  if (!Array.isArray(effects) || !effects.length) return effects;
  if (!audio || typeof audio !== 'object') return effects;
  return effects.map((fx) => {
    if (!fx.mod || typeof fx.mod !== 'object' || !Object.keys(fx.mod).length) return fx;
    const entry = KIND_TO_DEF[fx.kind];
    if (!entry) return fx;
    const params = entry[1].params;
    const out = { ...fx.params };
    let touched = false;
    for (const [key, src] of Object.entries(fx.mod)) {
      const e = src === 'rms' ? audio.rms : src === 'flux' ? audio.flux : src === 'beatPulse' ? audio.beatPulse : 0;
      if (!Number.isFinite(e) || e <= 0) continue;
      const p = params[key];
      if (!p) continue;
      const v = out[key];
      const nv = Math.min(p.max, Math.max(p.min, v + e * (p.max - v)));
      out[key] = p.type === 'int' ? Math.round(nv) : nv;
      touched = true;
    }
    return touched ? { ...fx, params: out } : fx;
  });
}
