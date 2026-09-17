/**
 * Phase-2 FX shader library — order:08 (#188). Browser-safe (no Node imports).
 *
 * The five effects the Phase-1 dispatch shader did not cover, each as one
 * fragment shader + one param descriptor on the #195 template contract,
 * registered with registerTemplateEffect:
 *
 *   displace, tear, scanlines, solarize, edge
 *
 * The other five (rgbSplit, grain, blur, posterize, invert) already exist
 * as GLSL in the bridge's builtin dispatch program (builtinEffects.mjs)
 * and stay there — they pass the parity harness today, and the harness
 * pins their pixels. Rewriting them would risk the corpus for zero visual
 * gain; Phase 2 adds the missing five.
 *
 * Noise: the issue text asked for a generated noise texture for
 * displace/tear. The #196 chunk library supersedes that — kc_fbm /
 * kc_vnoise are driver-stable procedural noise with no texture plumbing,
 * which also honors the template's one-texture (u_tex) contract. Grain
 * keeps its baked LUT (it must match the SVG reference bit-for-bit for
 * the fx-chain-2 parity scene; procedural noise would break it).
 *
 * SVG semantics ported per effect (see fxFilters.js builders):
 * - displace: feTurbulence fractalNoise baseFrequency 0.012, seed param;
 *   feDisplacementMap scale, R->X, G->Y. Noise coords are in canvas units
 *   (v_cuv * 1000/700 * 0.012) so the warp is resolution-independent,
 *   exactly like the SVG user-space frequencies.
 * - tear: stretched noise (X slow, Y at bands/700), Y displacement
 *   flattened to 0, X-only shear of amount*4 user px.
 * - scanlines: stretched noise masked by source alpha, black lines
 *   composited over — same alpha math as the SVG feComposite chain.
 * - solarize: feComponentTransfer type=table '0 0.5 1 0.5 0' is a
 *   piecewise-linear triangle: rises 0->1 on [0, 0.5], falls 1->0 on
 *   [0.5, 1] (5 table values span 4 segments).
 * - edge: 3x3 kernel [-1 -1 -1; -1 8 -1; -1 -1 -1], preserveAlpha.
 *   Convolved in straight (un-premultiplied) space so semi-transparent
 *   AA edge pixels contribute their true color — matches resvg.
 *
 * Filter output is outside the determinism contract (fxFilters.js):
 * turbulence-based effects rasterize differently on every backend by
 * design, so these five carry no parity scenes — they are verified to
 * render sane output, not to match resvg pixel-for-pixel.
 */

import { sanitizeParams, getTemplateEffect, registerTemplateEffect } from './template.mjs';
import { chunksUsedBy } from './chunks.mjs';
import { registerCostTier } from '../costTiers.mjs';

export const FX_DISPLACE_FS = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform float u_scale;
uniform int u_seed;
in vec2 v_cuv;
out vec4 o;
void main() {
  // SVG: feTurbulence fractalNoise baseFrequency 0.012 (user units) +
  // feDisplacementMap scale, xChannelSelector R, yChannelSelector G.
  // v_cuv spans the 1000x700 canvas, so v_cuv*vec2(12, 8.4) reproduces the
  // user-space noise lattice at any output resolution.
  vec2 np = v_cuv * vec2(12.0, 8.4) + vec2(float(u_seed) * 17.31, float(u_seed) * 9.17);
  float nx = kc_fbm(np, 3) - 0.5;
  float ny = kc_fbm(np + vec2(5.2, 1.3), 3) - 0.5;
  vec2 duv = vec2(nx, ny) * u_scale / vec2(1000.0, 700.0);
  o = texture(u_tex, v_cuv + duv);
}
`;

export const FX_DISPLACE_DESCRIPTOR = {
  label: 'Displace',
  hint: 'Warped, melted edges via fractal-noise displacement. Seed keeps the look stable per preset.',
  pad: 0,
  animated: false,
  params: {
    scale: {
      type: 'float', label: 'Scale', min: 0, max: 120, step: 1, def: 24,
      ui: 'slider', hint: 'Maximum warp displacement in pixels',
    },
    seed: {
      type: 'int', label: 'Seed', min: 0, max: 99, step: 1, def: 7,
      ui: 'slider', hint: 'Noise seed — same seed, same warp',
    },
  },
};

export const FX_TEAR_FS = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform int u_bands;
uniform float u_amount;
in vec2 v_cuv;
out vec4 o;
void main() {
  // SVG: stretched fractalNoise (0.008 in X, bands/700 in Y, 1 octave),
  // G flattened to 0.5 so the shear is strictly horizontal, scale amount*4.
  vec2 np = vec2(v_cuv.x * 8.0, v_cuv.y * float(u_bands)) + vec2(95.9, 49.7);
  float n = kc_vnoise(np);
  float dx = (n - 0.5) * u_amount * 4.0;
  o = texture(u_tex, v_cuv + vec2(dx / 1000.0, 0.0));
}
`;

export const FX_TEAR_DESCRIPTOR = {
  label: 'Tear',
  hint: 'Horizontal scanline slice-tears: banded rows shear left/right. X-only displacement (Y is flattened).',
  pad: 0,
  animated: false,
  params: {
    bands: {
      type: 'int', label: 'Bands', min: 2, max: 60, step: 1, def: 18,
      ui: 'slider', hint: 'Tear bands across the canvas height',
    },
    amount: {
      type: 'float', label: 'Amount', min: 0, max: 40, step: 1, def: 12,
      ui: 'slider', hint: 'Maximum horizontal shear in pixels',
    },
  },
};

export const FX_SCANLINES_FS = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform float u_density;
uniform float u_amount;
in vec2 v_cuv;
out vec4 o;
void main() {
  // SVG: stretched noise (0.01 in X, density in Y) -> black with noise
  // alpha, masked by the source alpha (feComposite in), over the source.
  vec4 s = texture(u_tex, v_cuv);
  float fy = max(u_density, 0.01);
  vec2 np = vec2(v_cuv.x * 10.0, v_cuv.y * 700.0 * fy) + vec2(150.7, 78.1);
  float n = kc_fbm(np, 3);
  float lA = u_amount * n * s.a;
  o = vec4(s.rgb * (1.0 - lA), lA + s.a * (1.0 - lA));
}
`;

export const FX_SCANLINES_DESCRIPTOR = {
  label: 'Scanlines',
  hint: 'CRT scanline banding: fine horizontal dark lines over the artwork. Turbulence-based, so the Showrunner clamps its detail under load.',
  pad: 0,
  animated: false,
  params: {
    density: {
      type: 'float', label: 'Density', min: 0.05, max: 1, step: 0.05, def: 0.35,
      ui: 'slider', hint: 'Line frequency — higher = finer lines',
    },
    amount: {
      type: 'float', label: 'Amount', min: 0, max: 1, step: 0.05, def: 0.5,
      ui: 'slider', hint: 'Line darkness',
    },
  },
};

export const FX_SOLARIZE_FS = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform vec2 u_res;
in vec2 v_cuv;
out vec4 o;
void main() {
  // SVG: feComponentTransfer type=table '0 0.5 1 0.5 0' — piecewise-linear
  // over 4 segments: rises 0->1 on [0, 0.5], falls 1->0 on [0.5, 1].
  // Applied in straight space like the SVG (posterize precedent).
  vec4 s = texture(u_tex, v_cuv);
  vec3 cs = s.a > 1e-6 ? s.rgb / s.a : vec3(0.0);
  vec3 q = clamp(1.0 - abs(cs * 2.0 - 1.0), 0.0, 1.0);
  o = vec4(q * s.a, s.a);
}
`;

export const FX_SOLARIZE_DESCRIPTOR = {
  label: 'Solarize',
  hint: 'Fold the tonal curve: mid-tones push bright, shadows and highlights stay dark. Psych-poster look.',
  pad: 0,
  animated: false,
  params: {},
};

export const FX_EDGE_FS = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform vec2 u_res;
in vec2 v_cuv;
out vec4 o;
vec3 unpre(vec4 p) { return p.a > 1e-6 ? p.rgb / p.a : vec3(0.0); }
void main() {
  // SVG: feConvolveMatrix order 3, kernel -1 -1 -1 / -1 8 -1 / -1 -1 -1,
  // preserveAlpha — alpha is copied, never convolved.
  // Straight-space convolve: neighbors are un-premultiplied first so
  // semi-transparent AA edge pixels contribute their true color.
  vec2 tx = 1.0 / u_res;
  vec4 c = texture(u_tex, v_cuv);
  vec3 acc = unpre(c) * 8.0;
  acc -= unpre(texture(u_tex, v_cuv + tx * vec2(-1.0, -1.0)));
  acc -= unpre(texture(u_tex, v_cuv + tx * vec2( 0.0, -1.0)));
  acc -= unpre(texture(u_tex, v_cuv + tx * vec2( 1.0, -1.0)));
  acc -= unpre(texture(u_tex, v_cuv + tx * vec2(-1.0,  0.0)));
  acc -= unpre(texture(u_tex, v_cuv + tx * vec2( 1.0,  0.0)));
  acc -= unpre(texture(u_tex, v_cuv + tx * vec2(-1.0,  1.0)));
  acc -= unpre(texture(u_tex, v_cuv + tx * vec2( 0.0,  1.0)));
  acc -= unpre(texture(u_tex, v_cuv + tx * vec2( 1.0,  1.0)));
  o = vec4(clamp(acc, 0.0, 1.0) * c.a, c.a);
}
`;

export const FX_EDGE_DESCRIPTOR = {
  label: 'Edge Detect',
  hint: '3×3 convolution edge detection. Alpha channel is preserved, so transparent areas stay clean.',
  pad: 0,
  animated: false,
  params: {},
};

/**
 * [kind, { fs, descriptor, file, cost }] — registration order is irrelevant.
 *
 * Cost-tier declarations (hardening 3/6) live IN each effect definition,
 * not in a separate list. One 1080p RGBA16F write target = 1920*1080*8
 * bytes of transient working set; timeMs is the author's per-frame
 * estimate at 1080p (the harness measures the truth; the build gate
 * cross-checks).
 */
export const FX_SHADER_EFFECTS = [
  // 2x fbm-3 noise lookups: the costliest template FX — a quality scaler.
  ['displace', { fs: FX_DISPLACE_FS, descriptor: FX_DISPLACE_DESCRIPTOR, file: 'fxShaders.mjs:displace',
    cost: { tier: 2, memoryBytes: 1920 * 1080 * 8, timeMs: 1.2, notes: '2x fbm-3 noise; warp cost scales with octaves' } }],
  ['tear', { fs: FX_TEAR_FS, descriptor: FX_TEAR_DESCRIPTOR, file: 'fxShaders.mjs:tear',
    cost: { tier: 3, memoryBytes: 1920 * 1080 * 8, timeMs: 0.5, notes: 'single noise lookup + shear' } }],
  ['scanlines', { fs: FX_SCANLINES_FS, descriptor: FX_SCANLINES_DESCRIPTOR, file: 'fxShaders.mjs:scanlines',
    cost: { tier: 3, memoryBytes: 1920 * 1080 * 8, timeMs: 0.3, notes: 'cheap mask multiply' } }],
  ['solarize', { fs: FX_SOLARIZE_FS, descriptor: FX_SOLARIZE_DESCRIPTOR, file: 'fxShaders.mjs:solarize',
    cost: { tier: 3, memoryBytes: 1920 * 1080 * 8, timeMs: 0.2, notes: 'pure ALU color op' } }],
  ['edge', { fs: FX_EDGE_FS, descriptor: FX_EDGE_DESCRIPTOR, file: 'fxShaders.mjs:edge',
    cost: { tier: 3, memoryBytes: 1920 * 1080 * 8, timeMs: 0.4, notes: '3x3 kernel, 9 taps' } }],
];

// The registry reads the cost declarations straight out of the definitions
// above — there is no parallel cost-only map to drift out of sync.
for (const [kind, def] of FX_SHADER_EFFECTS) {
  registerCostTier(`fx/${kind}`, def.cost);
}

export const FX_SHADER_KINDS = FX_SHADER_EFFECTS.map(([kind]) => kind);

/**
 * Register all five Phase-2 effects on a bridge. Call once per bridge
 * (the template registry throws on duplicate kinds — fail closed).
 */
export function registerFxShaders(bridge, gl) {
  for (const [kind, def] of FX_SHADER_EFFECTS) {
    registerTemplateEffect(bridge, gl, kind, def);
  }
}

/**
 * compileFxPrimitives (SVG) -> compileFxShaders (GL): the GL-side effect
 * compiler. Sanitizes the layer's effects array and maps it to bridge
 * chain steps { kind, params, aux }. Unknown kinds are dropped and
 * params are clamped/defaulted — fail closed, never throws.
 * auxFor(kind) supplies per-kind aux textures (grain LUT); null otherwise.
 *
 * Template effects sanitize against their own descriptors (single source
 * of truth, mirroring the SVG catalog ranges). The five Phase-1 builtin
 * kinds pass params through untouched — they apply their own defaults at
 * upload, exactly as before.
 */
const BUILTIN_FX_KINDS = new Set(['rgbSplit', 'grain', 'blur', 'posterize', 'invert']);

function sanitizeOne(fx) {
  if (!fx || typeof fx !== 'object' || typeof fx.kind !== 'string') return null;
  const { kind } = fx;
  const src = fx.params && typeof fx.params === 'object' ? fx.params : {};
  if (BUILTIN_FX_KINDS.has(kind)) return { kind, params: { ...src } };
  let descriptor;
  try {
    descriptor = getTemplateEffect(kind).descriptor;
  } catch {
    return null; // unknown kind: fail closed (dropped)
  }
  return { kind, params: sanitizeParams(descriptor, src) };
}

export function compileFxShaders(effects, { auxFor = () => null } = {}) {
  if (!Array.isArray(effects)) return [];
  return effects
    .map(sanitizeOne)
    .filter(Boolean)
    .map((fx) => ({ kind: fx.kind, params: fx.params, aux: auxFor(fx.kind) }));
}

/** Test helper: which shared chunks does each effect actually call? */
export function fxChunksUsed() {
  const out = {};
  for (const [kind, def] of FX_SHADER_EFFECTS) out[kind] = chunksUsedBy(def.fs);
  return out;
}
