/**
 * Wet-look display pass (#1813) — the perceptual half of wetness.
 *
 * The wet spine's physics (#1809 field, #1810 grid, #1811 pigment,
 * #1812 edge darkening) makes the stage *behave* wet; none of it makes
 * the presented frame *look* wet. What makes a surface read as wet to
 * a viewer is perceptual, and it is cheap (Sawayama, Adelson & Nishida,
 * J. Vision 2017, isolated the cues):
 *
 *   1. Saturation rises in wet regions — wet materials deepen in colour.
 *   2. Luminance remaps through an accelerating curve — darks get
 *      darker, brights hold: the darker-and-glossier histogram skew.
 *   3. A sheen on the brightest wet pixels — a soft specular-ish lift
 *      gated by the pixel's OWN luminance (thin-film reflection,
 *      Jensen et al. 1999), never an added light source or direction.
 *
 * Placement (the issue's contract): one fullscreen pass over the
 * upscaled ACCUM presentation, in LINEAR, BEFORE the final resolve
 * (ACES + dither, #532) — the remap changes the light the tonemapper
 * sees instead of grading its output. The renderer runs it inside
 * presentUpscaled (renderer.mjs) only while the wet-frame service
 * serves a field; the pass is a pure function of (frame, field sample,
 * ground) — no time, no state — so warm-up stills (#1815) can present
 * the same field state through the same math and match live exactly.
 *
 * Inputs, honestly named:
 *   · The field sample is the service's packed wet mask, bilinear at
 *     presentation, read through the service's REGIME thresholds
 *     (WET_REGIMES in wetFrame.mjs): the effect ramps from the damp
 *     threshold to full at soaked; below damp the frame is untouched.
 *     The mask is multiplied by the frame's wetAmount first, exactly
 *     as ACCUM's own wet shaders consume it.
 *   · The ground is the same background the ACCUM fade uses — the
 *     frame's bgCss parsed by the fade target's own rule (#287's
 *     hexToRgb01) — because ground class steers the skew: on light
 *     (paper) grounds wet darkens MORE and brightens NEVER (no sheen;
 *     paper does not gloss), on dark grounds the skew is the glossy
 *     signature (darks deepen, brights hold) and the sheen may lift.
 *   · The frame the pass reads already carries #1812's edge-darkened
 *     pigment pack (the darkening lives in packPigmentDeposited's
 *     reflectance). This pass applies NO rim or edge term of its own —
 *     the two darkenings are different physics (reflectance vs
 *     presentation) and must never double up.
 *
 * No new controls: the pass follows the field. The performer's control
 * remains WETNESS and the looks that stamp; the strengths below are
 * recipe constants (the velocity-smear precedent), bound as uniforms
 * from this one table so the selfcheck pins the shipped values.
 *
 * Byte-identity law (the spine's standing rule): field not served →
 * the pass does not run at all. Field served but a pixel sits below
 * the damp threshold → the shader writes the sampled texel straight
 * through (no unpremultiply round-trip), so dry pixels are bit-exact
 * and every existing golden holds.
 *
 * Cost: one fullscreen pass at presentation size — one frame tap plus
 * one mask tap — declared in the cost registry as renderer/wetlook,
 * the same class as the upscale it follows.
 *
 * The JS mirror (shadeWetPixel) is the shader's formula transcribed
 * 1:1; wetLook.selfcheck asserts the perceptual behaviour on it
 * (region statistics per ground class) and pins the GLSL to the same
 * shape, so the two cannot drift silently.
 */

/** House luma weights — the same Rec.601 triple the resolve and the
 *  ACCUM shaders use, so "luminance" means one thing across the frame. */
export const WET_LOOK_LUMA = Object.freeze([0.299, 0.587, 0.114]);

/**
 * The recipe constants. Bound as uniforms by the renderer; the GLSL
 * holds no literals for them.
 *   saturation — chroma multiplier at full wet: 1 + saturation.
 *   skew       — dark-ground luminance bend (darks darker, brights hold).
 *   paperSkew  — light-ground bend. Larger than skew (wet paper darkens
 *                more) and shaped to reach the bright ground itself.
 *   sheen      — highlight lift at full wet, dark grounds only.
 *   sheenPow   — the highlight gate: only the brightest wet pixels lift.
 *   groundSplit— luma(u_bg) at/above which the ground counts as paper.
 */
export const WET_LOOK = Object.freeze({
  saturation: 0.35,
  skew: 0.45,
  paperSkew: 0.6,
  sheen: 0.3,
  sheenPow: 6,
  groundSplit: 0.5,
});

export function wetLookLuma([r, g, b]) {
  return WET_LOOK_LUMA[0] * r + WET_LOOK_LUMA[1] * g + WET_LOOK_LUMA[2] * b;
}

/**
 * The regime ramp: 0 at/below the damp threshold, 1 at the soaked
 * threshold, smoothstep between — the pass consumes named regimes,
 * never the raw mask float interpreted ad hoc.
 */
export function wetLookFactor(w, damp, full) {
  const t = Math.min(1, Math.max(0, (w - damp) / Math.max(1e-6, full - damp)));
  return t * t * (3 - 2 * t);
}

/**
 * The fade target's parse (#287 hexToRgb01's rule, transcribed so this
 * module stands alone): '#rgb' / '#rrggbb' → [r, g, b] 0..1; anything
 * unparseable → black. The ground the pass steers by is therefore the
 * same background the fade uses, value for value.
 */
export function wetGroundFromCss(css) {
  const m = /^#?([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.exec(String(css || ''));
  if (!m) return [0, 0, 0];
  const h =
    m[1].length === 3
      ? m[1]
          .split('')
          .map((c) => c + c)
          .join('')
      : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
}

/**
 * The pass, per pixel, in JS — the exact transcription of WET_LOOK_FS.
 * @param {[number, number, number]} rgb linear unpremultiplied colour
 * @param {number} maskR the field sample (packed mask R, 0..1)
 * @param {{amount: number, damp: number, full: number,
 *          bg: [number, number, number], recipe?: object}} u
 *        amount — the frame's wetAmount (the mask is consumed × amount,
 *        as in ACCUM's wet shaders); damp/full — WET_REGIMES thresholds;
 *        bg — the ground triple (wetGroundFromCss); recipe — defaults
 *        to WET_LOOK (tests may zero single terms to pin each cue).
 * @returns {[number, number, number]} the remapped colour
 */
export function shadeWetPixel(rgb, maskR, u) {
  const k = u.recipe || WET_LOOK;
  const f = wetLookFactor(maskR * u.amount, u.damp, u.full);
  if (f <= 0) return [rgb[0], rgb[1], rgb[2]];
  let [r, g, b] = rgb;
  const L = wetLookLuma([r, g, b]);
  const Lc = Math.min(L, 1);
  const light = wetLookLuma(u.bg) >= k.groundSplit;
  if (light) {
    // Paper: darken more, across the whole range including the bright
    // ground itself — and never brighten (the factor is ≤ 1 by shape).
    const m = 1 - k.paperSkew * f * (0.5 + 0.5 * Lc);
    r *= m;
    g *= m;
    b *= m;
  } else {
    // Glossy skew: the multiplier leans on min(L, 1), so darks deepen
    // most, brights (L ≥ 1) hold exactly.
    const m = 1 + (Lc - 1) * (k.skew * f);
    r *= m;
    g *= m;
    b *= m;
  }
  // Saturation rise: chroma scales about the post-skew luma.
  const L2 = wetLookLuma([r, g, b]);
  const s = 1 + k.saturation * f;
  r = L2 + (r - L2) * s;
  g = L2 + (g - L2) * s;
  b = L2 + (b - L2) * s;
  if (light) {
    // Paper brightens NEVER — a hard per-channel cap at the input, not
    // a hope: the saturation extrapolation can otherwise lift a dark
    // saturated pixel's dominant channel by a fraction of a percent.
    r = Math.min(r, rgb[0]);
    g = Math.min(g, rgb[1]);
    b = Math.min(b, rgb[2]);
  }
  // Sheen: dark grounds only (paper brightens never), gated by the
  // pixel's own luminance — the frame's own highlights, no light added.
  if (!light && k.sheen > 0) {
    const lift = k.sheen * f * Math.pow(Math.min(L2, 1), k.sheenPow);
    r += lift;
    g += lift;
    b += lift;
  }
  return [r, g, b];
}

/**
 * The pass as GLSL — a transcription of shadeWetPixel, line for line in
 * the same order. Uniform-fed strengths (u_sat / u_skew / u_paperSkew /
 * u_sheen / u_sheenPow / u_groundSplit) come from WET_LOOK via the
 * renderer; the regime thresholds (u_damp / u_full) come from
 * WET_REGIMES via the loop. Declared uniforms are exactly the program
 * definition's upload list in renderer.mjs (the checked audit throws
 * on any drift).
 */
export const WET_LOOK_FS = `#version 300 es
precision highp float;
uniform sampler2D u_src;
uniform sampler2D u_wetMask;
uniform float u_wetAmt;
uniform float u_damp;
uniform float u_full;
uniform vec3 u_bg;
uniform float u_groundSplit;
uniform float u_sat;
uniform float u_skew;
uniform float u_paperSkew;
uniform float u_sheen;
uniform float u_sheenPow;
in vec2 v_cuv;
out vec4 o;

vec3 unpre(vec3 c, float a) { return a > 1e-6 ? c / a : vec3(0.0); }
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

void main() {
  vec4 s = texture(u_src, v_cuv);
  float w = texture(u_wetMask, v_cuv).r * u_wetAmt;
  float t = clamp((w - u_damp) / max(u_full - u_damp, 1e-6), 0.0, 1.0);
  float f = t * t * (3.0 - 2.0 * t);
  // Below damp the frame is untouched — the sampled texel writes
  // straight through, so dry pixels stay bit-exact (no unpre round-trip).
  if (f <= 0.0) { o = s; return; }
  vec3 c = unpre(s.rgb, s.a);
  vec3 cIn = c;
  float L = luma(c);
  float Lc = min(L, 1.0);
  bool light = luma(u_bg) >= u_groundSplit;
  if (light) {
    float m = 1.0 - u_paperSkew * f * (0.5 + 0.5 * Lc);
    c *= m;
  } else {
    float m = 1.0 + (Lc - 1.0) * (u_skew * f);
    c *= m;
  }
  float L2 = luma(c);
  c = mix(vec3(L2), c, 1.0 + u_sat * f);
  // Paper brightens never: hard per-channel cap at the input.
  if (light) c = min(c, cIn);
  if (!light && u_sheen > 0.0) {
    float lift = u_sheen * f * pow(min(L2, 1.0), u_sheenPow);
    c += vec3(lift);
  }
  o = vec4(c * s.a, s.a);
}`;
