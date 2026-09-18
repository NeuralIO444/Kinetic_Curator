/**
 * Shared GLSL sources — Phase 1 (#187). Browser-safe (pure strings, no imports).
 *
 * Conventions (match the SVG reference path):
 * - All color is premultiplied-alpha sRGB bytes, exactly like resvg output.
 * - Canvas UV is y-down: (0,0) = top-left of the 1000x700 canvas.
 * - Texture sampling of FBOs flips v (GL textures are y-up).
 */

export const BLEND_IDS = Object.freeze({
  normal: 0, multiply: 1, screen: 2, overlay: 3, darken: 4, lighten: 5,
  'color-dodge': 6, 'color-burn': 7, 'hard-light': 8, 'soft-light': 9,
  difference: 10, exclusion: 11, hue: 12, saturation: 13, color: 14, luminosity: 15,
});

/**
 * GL blend id for a contract blend name (#189).
 *
 * resvg has no `plus-lighter`, so the SVG reference path falls back to
 * `screen` (studio/blendFallback.mjs, #96) — and the contract records the
 * authored mode (docs/GL_CONTRACT.md). The GL backend applies the same
 * substitution so live and export agree; anything else unknown falls
 * back to `normal` (never null — callers must not throw on data).
 */
export function blendIdFor(mode) {
  if (mode === 'plus-lighter') return BLEND_IDS.screen;
  return BLEND_IDS[mode] ?? BLEND_IDS.normal;
}

export const EFFECT_IDS = Object.freeze({
  invert: 0, rgbSplit: 1, grain: 2, blurH: 3, blurV: 4, posterize: 5,
});

/** Instanced textured quads. Per-instance: (x,y,sx,sy) (rot,opacity,u0,v0) (u1,v1,0,0). */
export const QUAD_VS = `#version 300 es
layout(location=0) in vec2 a_corner;
layout(location=1) in vec4 a_inst0;
layout(location=2) in vec4 a_inst1;
layout(location=3) in vec4 a_inst2;
uniform vec2 u_canvas;
out vec2 v_uv;
out float v_opacity;
void main() {
  // Cell is 400px for 200 units (2px/unit). Sample at texel centers:
  // the quad spans asset units [-49.75, 149.75] so that corner (0,0)
  // maps to the center of the first texel, aligning geometry with
  // the CLAMP_TO_EDGE-clamped UVs. (Half-texel offset.)
  vec2 au = a_corner * 199.5 - 49.75;
  vec2 c = (au - 50.0) * a_inst0.zw;      // center on the 100x100 box, scale
  float th = radians(a_inst1.x);
  float co = cos(th), si = sin(th);
  vec2 rr = vec2(c.x * co - c.y * si, c.x * si + c.y * co);  // SVG rotate(), y-down
  vec2 world = a_inst0.xy + rr;
  gl_Position = vec4(world.x / u_canvas.x * 2.0 - 1.0, 1.0 - world.y / u_canvas.y * 2.0, 0.0, 1.0);
  v_uv = vec2(mix(a_inst1.z, a_inst2.x, a_corner.x), mix(a_inst1.w, a_inst2.y, a_corner.y));
  v_opacity = a_inst1.y;
}`;

export const QUAD_FS = `#version 300 es
precision highp float;
uniform sampler2D u_atlas;
in vec2 v_uv;
in float v_opacity;
out vec4 o;
void main() {
  vec4 t = texture(u_atlas, v_uv);   // premultiplied
  o = vec4(t.rgb * v_opacity, t.a * v_opacity);
}`;

/** Fullscreen pass: v_cuv is y-down canvas UV. */
export const FULL_VS = `#version 300 es
layout(location=0) in vec2 a_pos;
out vec2 v_cuv;
void main() {
  v_cuv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

/**
 * Layer/wrap compositing: CSS blend modes + group opacity, straight-sRGB
 * math per compositing-1, premultiplied in/out. Optional bbox clip
 * (SVG filter region). Optional layer matte (#189): a mask texture sampled
 * at the same UV; the source's alpha is multiplied by the mask value
 * (mask alpha for mode 0, sRGB luminance for mode 1), optionally inverted.
 */
export const COMPOSITE_FS = `#version 300 es
precision highp float;
uniform sampler2D u_src;
uniform sampler2D u_dst;
uniform int u_blend;
uniform float u_opacity;
uniform vec4 u_clip;    // x0,y0,x1,y1 canvas units, y-down
uniform float u_clipOn;
uniform sampler2D u_mask;   // matte source group texture (#189)
uniform float u_maskOn;
uniform int u_maskMode;     // 0 = alpha, 1 = luma
uniform float u_maskInvert;
uniform float u_hueOn;      // 1 when layer.layout.hueRotate is nonzero (#262)
uniform mat3 u_hueMat;      // SVG feColorMatrix type="hueRotate" matrix (#262)
in vec2 v_cuv;
out vec4 o;

vec3 unpre(vec3 c, float a) { return a > 1e-6 ? c / a : vec3(0.0); }

// sRGB relative luminance — the "luma" of a layer matte (#154 re-plan).
float sLum(vec3 c) { return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; }

float lum(vec3 c) { return 0.3 * c.r + 0.59 * c.g + 0.11 * c.b; }
vec3 clipColor(vec3 c) {
  float l = lum(c);
  float n = min(min(c.r, c.g), c.b);
  float x = max(max(c.r, c.g), c.b);
  if (n < 0.0) c = l + ((c - l) * l) / (l - n);
  if (x > 1.0) c = l + ((c - l) * (1.0 - l)) / (x - l);
  return c;
}
vec3 setLum(vec3 c, float l) {
  float d = l - lum(c);
  return clipColor(vec3(c.r + d, c.g + d, c.b + d));
}
float sat(vec3 c) { return max(max(c.r, c.g), c.b) - min(min(c.r, c.g), c.b); }
vec3 setSat(vec3 c, float s) {
  float cur = sat(c);
  if (cur > 1e-6) {
    float mx = max(max(c.r, c.g), c.b);
    float mn = min(min(c.r, c.g), c.b);
    c = (c - mn) * s / cur;
  } else { c = vec3(0.0); }
  return c;
}

vec3 blendF(vec3 cb, vec3 cs, int m) {
  if (m == 1) return cb * cs;                                            // multiply
  if (m == 2) return vec3(1.0) - (vec3(1.0) - cb) * (vec3(1.0) - cs);    // screen
  if (m == 3) {                                                         // overlay
    vec3 r;
    r.r = cb.r <= 0.5 ? 2.0*cb.r*cs.r : 1.0-2.0*(1.0-cb.r)*(1.0-cs.r);
    r.g = cb.g <= 0.5 ? 2.0*cb.g*cs.g : 1.0-2.0*(1.0-cb.g)*(1.0-cs.g);
    r.b = cb.b <= 0.5 ? 2.0*cb.b*cs.b : 1.0-2.0*(1.0-cb.b)*(1.0-cs.b);
    return r;
  }
  if (m == 4) return min(cb, cs);                                        // darken
  if (m == 5) return max(cb, cs);                                        // lighten
  if (m == 6) {                                                         // color-dodge
    vec3 r;
    r.r = cb.r == 0.0 ? 0.0 : (cs.r == 1.0 ? 1.0 : min(1.0, cb.r / (1.0 - cs.r)));
    r.g = cb.g == 0.0 ? 0.0 : (cs.g == 1.0 ? 1.0 : min(1.0, cb.g / (1.0 - cs.g)));
    r.b = cb.b == 0.0 ? 0.0 : (cs.b == 1.0 ? 1.0 : min(1.0, cb.b / (1.0 - cs.b)));
    return r;
  }
  if (m == 7) {                                                         // color-burn
    vec3 r;
    r.r = cb.r == 1.0 ? 1.0 : (cs.r == 0.0 ? 0.0 : 1.0 - min(1.0, (1.0 - cb.r) / cs.r));
    r.g = cb.g == 1.0 ? 1.0 : (cs.g == 0.0 ? 0.0 : 1.0 - min(1.0, (1.0 - cb.g) / cs.g));
    r.b = cb.b == 1.0 ? 1.0 : (cs.b == 0.0 ? 0.0 : 1.0 - min(1.0, (1.0 - cb.b) / cs.b));
    return r;
  }
  if (m == 8) {                                                         // hard-light = overlay(cs, cb)
    vec3 r;
    r.r = cs.r <= 0.5 ? 2.0*cs.r*cb.r : 1.0-2.0*(1.0-cs.r)*(1.0-cb.r);
    r.g = cs.g <= 0.5 ? 2.0*cs.g*cb.g : 1.0-2.0*(1.0-cs.g)*(1.0-cb.g);
    r.b = cs.b <= 0.5 ? 2.0*cs.b*cb.b : 1.0-2.0*(1.0-cs.b)*(1.0-cb.b);
    return r;
  }
  if (m == 9) {                                                         // soft-light
    vec3 r;
    r.r = cs.r <= 0.5 ? cb.r - (1.0-2.0*cs.r)*cb.r*(1.0-cb.r)
                      : cb.r + (2.0*cs.r-1.0)*(sqrt(max(cb.r,0.0))-cb.r);
    r.g = cs.g <= 0.5 ? cb.g - (1.0-2.0*cs.g)*cb.g*(1.0-cb.g)
                      : cb.g + (2.0*cs.g-1.0)*(sqrt(max(cb.g,0.0))-cb.g);
    r.b = cs.b <= 0.5 ? cb.b - (1.0-2.0*cs.b)*cb.b*(1.0-cb.b)
                      : cb.b + (2.0*cs.b-1.0)*(sqrt(max(cb.b,0.0))-cb.b);
    return r;
  }
  if (m == 10) return abs(cb - cs);                                      // difference
  if (m == 11) return cb + cs - 2.0 * cb * cs;                           // exclusion
  if (m == 12) return setLum(setSat(cs, sat(cb)), lum(cb));              // hue
  if (m == 13) return setLum(setSat(cb, sat(cs)), lum(cb));              // saturation
  if (m == 14) return setLum(cs, lum(cb));                              // color
  if (m == 15) return setLum(cb, lum(cs));                              // luminosity
  return cs;                                                            // normal
}

void main() {
  vec2 tuv = v_cuv;   // FBO textures share the renderer's y-up memory layout
  vec4 S = texture(u_src, tuv);
  if (u_maskOn > 0.5) {
    vec4 M = texture(u_mask, tuv);   // premultiplied mask group texture
    float m = u_maskMode == 1 ? sLum(unpre(M.rgb, M.a)) : M.a;
    if (u_maskInvert > 0.5) m = 1.0 - m;
    S.rgb *= m; S.a *= m;
  }
  vec4 D = texture(u_dst, tuv);
  if (u_clipOn > 0.5) {
    vec2 cp = v_cuv * vec2(1000.0, 700.0);
    if (cp.x < u_clip.x || cp.y < u_clip.y || cp.x > u_clip.z || cp.y > u_clip.w) {
      o = D; return;   // outside the filter region: backdrop shows through
    }
  }
  S.rgb *= u_opacity; S.a *= u_opacity;      // group opacity
  vec3 cs = unpre(S.rgb, S.a);
  // hueRotate (#262): rotation about the sRGB gray axis, applied to the
  // straight source color before blending — matches the SVG reference's
  // feColorMatrix type="hueRotate". Branched so hueRotate=0 keeps the
  // pre-#262 code path pixel-identical.
  if (u_hueOn > 0.5) cs = u_hueMat * cs;
  vec3 cb = unpre(D.rgb, D.a);
  float as_ = S.a, ab = D.a;
  vec3 b = blendF(cb, cs, u_blend);
  float ao = as_ + ab - as_ * ab;
  vec3 co = ao > 1e-6
    ? (as_ * (1.0 - ab) * cs + as_ * ab * b + (1.0 - as_) * ab * cb) / ao
    : vec3(0.0);
  o = vec4(co * ao, ao);
}`;

/**
 * Single-effect fullscreen pass. u_effect selects the effect; u_p carries
 * params. u_aux is the grain noise LUT (NEAREST, y-down sampling).
 * Premultiplied in/out; effects that need straight values unpremultiply
 * internally (invert/posterize math verified against resvg probes).
 */
export const EFFECT_FS = `#version 300 es
precision highp float;
uniform sampler2D u_src;
uniform sampler2D u_aux;
uniform int u_effect;
uniform vec4 u_p;
uniform vec2 u_texel;   // 1/w, 1/h of the source in device px
uniform vec4 u_clip;
uniform float u_clipOn;
in vec2 v_cuv;
out vec4 o;

vec3 unpre(vec3 c, float a) { return a > 1e-6 ? c / a : vec3(0.0); }

void main() {
  if (u_clipOn > 0.5) {
    vec2 cp = v_cuv * vec2(1000.0, 700.0);
    if (cp.x < u_clip.x || cp.y < u_clip.y || cp.x > u_clip.z || cp.y > u_clip.w) {
      o = vec4(0.0); return;
    }
  }
  vec2 tuv = v_cuv;
  vec4 s = texture(u_src, tuv);

  if (u_effect == 0) {                        // invert: out = a - rgb (premultiplied)
    o = vec4(vec3(s.a) - s.rgb, s.a);
  } else if (u_effect == 1) {                 // rgbSplit: R +dx, B -dx, screen alpha
    float dx = u_p.x;                         // canvas-uv units
    vec4 r = texture(u_src, tuv - vec2(dx, 0.0));
    vec4 b = texture(u_src, tuv + vec2(dx, 0.0));
    float a = 1.0 - (1.0 - r.a) * (1.0 - s.a) * (1.0 - b.a);
    o = vec4(r.r, s.g, b.b, a);
  } else if (u_effect == 2) {                 // grain: LUT noise, masked by src alpha
    vec4 nz = texture(u_aux, vec2(v_cuv.x, 1.0 - v_cuv.y));  // LUT bake is top-first, NEAREST
    float gA = u_p.x * nz.a * s.a;
    o = vec4(s.rgb * (1.0 - gA), gA + s.a * (1.0 - gA));
  } else if (u_effect == 3 || u_effect == 4) { // separable gaussian blur
    float sigma = u_p.x;                      // device px
    if (sigma <= 0.0) {
      o = s; // radius 0 is identity (matches SVG stdDeviation=0); sigma=0
             // would divide by zero in the kernel weights below.
    } else {
    // vertical pass moves in texture-v (y-up): negate for canvas y-down
    vec2 stepv = u_effect == 3 ? vec2(u_texel.x, 0.0) : vec2(0.0, -u_texel.y);
    int R = int(ceil(sigma * 3.0));
    float w0 = 0.3989422804014327 / sigma;    // 1/sqrt(2pi)/sigma
    vec4 acc = s * w0;
    float wsum = w0;
    for (int i = 1; i <= 64; i++) {
      if (i > R) break;
      float w = w0 * exp(-float(i * i) / (2.0 * sigma * sigma));
      vec2 off = stepv * float(i);
      acc += (texture(u_src, tuv + off) + texture(u_src, tuv - off)) * w;
      wsum += 2.0 * w;
    }
    o = acc / wsum;
    }
  } else if (u_effect == 5) {                 // posterize: discrete table in straight space
    float levels = u_p.x;
    vec3 cs = unpre(s.rgb, s.a);
    vec3 q;
    q.r = min(floor(cs.r * levels), levels - 1.0) / (levels - 1.0);
    q.g = min(floor(cs.g * levels), levels - 1.0) / (levels - 1.0);
    q.b = min(floor(cs.b * levels), levels - 1.0) / (levels - 1.0);
    q = floor(q * 255.0 + 1e-4) / 255.0;     // resvg truncates the table value
    o = vec4(q * s.a, s.a);
  } else {
    o = s;
  }
}`;

/** Final resolve: 16F premultiplied -> RGBA8 premultiplied bytes.
 *  Flips v so readPixels returns top-first rows (resvg's convention). */
export const RESOLVE_FS = `#version 300 es
precision highp float;
uniform sampler2D u_src;
in vec2 v_cuv;
out vec4 o;
void main() {
  o = clamp(texture(u_src, vec2(v_cuv.x, 1.0 - v_cuv.y)), 0.0, 1.0);
}`;

/** Plain texture copy, no flip (FBO-to-FBO). */
export const COPY_FS = `#version 300 es
precision highp float;
uniform sampler2D u_src;
in vec2 v_cuv;
out vec4 o;
void main() {
  o = texture(u_src, v_cuv);
}`;
