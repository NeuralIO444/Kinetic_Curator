/**
 * Shared GLSL sources — Phase 1 (#187). Browser-safe (pure strings; the one
 * import is chunks.mjs, itself browser-safe with no Node imports).
 *
 * Conventions (match the SVG reference path):
 * - All color is premultiplied-alpha sRGB bytes, exactly like resvg output.
 * - Canvas UV is y-down: (0,0) = top-left of the 1000x700 canvas.
 * - Texture sampling of FBOs flips v (GL textures are y-up).
 */

import { injectCommon } from './effects/chunks.mjs';
import { GLASS_BEVEL } from './glassBevel.mjs';
import { GLASS_CAUSTIC } from './glassCaustic.mjs';

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
  invert: 0, rgbSplit: 1, grain: 2, posterize: 5,
});
// NOTE (#308): the instrument has no gaussian blur — the blurH/blurV ids
// are gone, not reserved. posterize keeps id 5 (ids are explicit, nothing
// renumbers).

/** Instanced textured quads. Per-instance: (x,y,sx,sy) (rot,opacity,u0,v0) (u1,v1,0,0).
 *  Wrapped with the shared chunk library (#196) so hands can use kc_hash12
 *  instead of an inline sin-hash (the chunk selfcheck bans duplicates). */
const QUAD_VS_SRC = `#version 300 es
layout(location=0) in vec2 a_corner;
layout(location=1) in vec4 a_inst0;
layout(location=2) in vec4 a_inst1;
layout(location=3) in vec4 a_inst2;
layout(location=4) in vec4 a_inst3;
layout(location=5) in vec4 a_inst4;
layout(location=6) in float a_glass;   // #1129 PR2: 1 = glass voice instance, 0 = enamel path
uniform vec2 u_canvas;
uniform vec3 u_smear;   // #309 velocity smear: x = stretch per scene-unit of
                        // per-frame velocity, y = max stretch factor,
                        // z = #594 PR3 squash (0 = stretch only, 1 = area held)
// #594 the CHIAROSCURO sun. ONE sun, never three-point: a rim or fill light
// breaks the rule — propose it on #594 before adding a second uniform set.
uniform vec4 u_sun;       // x, y (scene units), height above the plane, w = on (0/1)
uniform vec4 u_sunLight;  // rgb = palette-slot colour, a = intensity
uniform float u_ambient;  // light that reaches a mark facing away from the sun
// #781 KINEME: whole-mark motion. Slot i = (kind, period s, amp); kinds
// 1 spin (amp < 0: reversed), 2 osc (± deg), 3 pulse (± scale), 4 blink (duty), 5 bob (± units).
// Per instance a_inst4.z = slot + 1 (0 = still), a_inst4.w = phase [0,1).
uniform vec3 u_kineme[16];
uniform float u_kinemeTime;
uniform vec2 u_hands;     // x crooked, y open. 0 is today's quad and today's ink.
out float v_seed;
out vec2 v_uv;
out float v_opacity;
out vec3 v_ink;
out vec3 v_accent;
out vec3 v_light;
out vec2 v_world;   // #594 PR2: fragment position (scene units) for per-texel light
out vec4 v_rot;     // cos, sin of the instance rotation; x/y mirror signs
out vec4 v_cell;    // the instance's atlas cell (u0, v0, u1, v1): bevel taps never leave it
out float v_glass;    // #1129 PR2: per-instance glass flag — selects the soft-bevel variant
void main() {
  // Cell is 400px for 200 units (2px/unit). Sample at texel centers:
  // the quad spans asset units [-49.75, 149.75] so that corner (0,0)
  // maps to the center of the first texel, aligning geometry with
  // the CLAMP_TO_EDGE-clamped UVs. (Half-texel offset.)
  vec2 au = a_corner * 199.5 - 49.75;
  vec2 c = (au - 50.0) * a_inst0.zw;      // center on the 100x100 box, scale
  float seed = kc_hash12(a_inst0.xy);
  v_seed = seed;
  // Crooked Hand. Amount 0 never enters, so the quad stays the pre-hand path.
  if (u_hands.x > 0.0) {
    float shear = (seed * 2.0 - 1.0) * u_hands.x * 0.45;
    float pinch = (fract(seed * 7.13) * 2.0 - 1.0) * u_hands.x * 0.35;
    c.x += c.y * shear;
    c.x *= 1.0 - pinch * clamp(c.y / 50.0, -1.0, 1.0);
    float sstr = fract(seed * 3.7);
    float sm = fract(sstr * 2.0) * 2.0 - 1.0;
    c.x *= 1.0 + u_hands.x * 0.30 * (sstr < 0.5 ? sm : sm * 0.25);
    c.y *= 1.0 + u_hands.x * 0.30 * (sstr < 0.5 ? sm * 0.25 : sm);
    float nstr = fract(seed * 9.31);
    float npick = floor(nstr * 4.0);
    vec2 ncorner = vec2(mod(npick, 2.0), floor(npick / 2.0));
    if (distance(a_corner, ncorner) < 0.5) {
      c *= 1.0 - u_hands.x * 0.35;
    }
    float fstr = fract(seed * 5.77);
    if (fstr > 0.5) {
      c.x = -c.x;
    }
  }
  float kDeg = 0.0;   // #781 KINEME extra rotation (degrees)
  float kVis = 1.0;   // blink visibility
  vec2 kOff = vec2(0.0); // bob offset (scene units)
  // Gated on the slot: a still instance (0) never enters, so it is bit-for-bit
  // the pre-KINEME path.
  if (a_inst4.z > 0.5) {
    vec3 km = u_kineme[int(a_inst4.z + 0.5) - 1];
    float per = max(km.y, 1e-3);
    float ph = fract(u_kinemeTime / per + a_inst4.w);
    float wav = sin(ph * 6.28318530718);
    int kind = int(km.x + 0.5);
    if (kind == 1) kDeg = (km.z < 0.0 ? -ph : ph) * 360.0; // #1127: a negative amp turns the other way
    else if (kind == 2) kDeg = km.z * wav;
    else if (kind == 3) c *= 1.0 + km.z * wav;
    else if (kind == 4) kVis = ph < km.z ? 1.0 : 0.0;
    else if (kind == 5) kOff = vec2(0.0, km.z * wav);
  }
  float th = radians(a_inst1.x + kDeg);
  float co = cos(th), si = sin(th);
  vec2 rr = vec2(c.x * co - c.y * si, c.x * si + c.y * co);  // SVG rotate(), y-down
  // #309 velocity smear: per-frame displacement (scene units) rides in
  // a_inst2.zw. The quad stretches along its own motion direction — the
  // trail system lives on the objects, zero fullscreen passes. At rest
  // (v = 0) this is exactly the old path.
  vec2 smv = a_inst2.zw;
  float sms = length(smv);
  if (sms > 1e-4) {
    vec2 smd = smv / sms;
    float smk = min(sms * u_smear.x, u_smear.y);
    rr += smd * (dot(rr, smd) * smk);
    // #594 PR3 squash-and-stretch: thin the mark across its motion so it
    // keeps its mass instead of growing. Gated so squash 0 is bit-for-bit
    // the plain smear (the recombine below is not exact in float).
    if (u_smear.z > 0.0) {
      vec2 along = smd * dot(rr, smd);
      rr = along + (rr - along) * mix(1.0, 1.0 / (1.0 + smk), u_smear.z);
    }
  }
  vec2 world = a_inst0.xy + rr + kOff;
  gl_Position = vec4(world.x / u_canvas.x * 2.0 - 1.0, 1.0 - world.y / u_canvas.y * 2.0, 0.0, 1.0);
  v_uv = vec2(mix(a_inst1.z, a_inst2.x, a_corner.x), mix(a_inst1.w, a_inst2.y, a_corner.y));
  v_opacity = a_inst1.y * kVis;
  v_ink = a_inst3.xyz;
  v_accent = vec3(a_inst3.w, a_inst4.xy);
  v_world = world;
  // Mirror = scale sign × atlas uv direction, so a sprite-space normal maps to
  // scene space however the instance was flipped or the cell was stored.
  float mx = (a_inst0.z < 0.0 ? -1.0 : 1.0) * (a_inst2.x < a_inst1.z ? -1.0 : 1.0);
  float my = (a_inst0.w < 0.0 ? -1.0 : 1.0) * (a_inst2.y < a_inst1.w ? -1.0 : 1.0);
  v_rot = vec4(co, si, mx, my);
  v_cell = vec4(a_inst1.zw, a_inst2.xy);
  v_glass = a_glass;   // #1129 PR2: constant across the instance — no interpolation error
  // #594 PR1: per-instance diffuse from the one sun, flat normal (0,0,1), at the
  // instance centre. Off → exactly vec3(1.0), so the unlit path is byte-identical.
  if (u_sun.w > 0.5) {
    vec3 L = normalize(vec3(u_sun.xy - a_inst0.xy, u_sun.z));
    v_light = vec3(u_ambient) + u_sunLight.rgb * (u_sunLight.a * L.z);
  } else {
    v_light = vec3(1.0);
  }
}`;

export const QUAD_VS = injectCommon(QUAD_VS_SRC);

const QUAD_FS_SRC = `#version 300 es
precision highp float;
uniform sampler2D u_atlas;
uniform float u_liveTint;
uniform vec4 u_sun;        // #594: shared with the vertex stage (w = on)
uniform vec4 u_sunLight;   // #594: shared, rgb colour + intensity
uniform float u_ambient;   // #594: shared
uniform vec2 u_sunMat;     // #594 PR2: x = bevel strength (0 = flat per-instance light), y = specular
uniform float u_pool;      // #594: 0 = today's sun. Ink in the shadow, paper on the highlight.
uniform vec2 u_hands;      // y = Open Hand. 0 returns the current sample.
in float v_seed;
in vec2 v_world;
in vec4 v_rot;
in vec4 v_cell;
in vec2 v_uv;
in float v_opacity;
in vec3 v_ink;
in vec3 v_accent;
in vec3 v_light;
in float v_glass;     // #1129 PR2: 1 = soft-bevel (glass), 0 = exact existing enamel path
out vec4 o;
void main() {
  vec4 t = texture(u_atlas, v_uv);   // premultiplied
  // Open Hand. Amount 0 never enters. The seed picks the ink: stroke, hollow, double, crop.
  if (u_hands.y > 0.0) {
    vec2 span = max(v_cell.zw - v_cell.xy, vec2(1e-4));
    vec2 local = (v_uv - v_cell.xy) / span;
    float d = length(local - 0.5);
    float istr = fract(v_seed * 3.3);
    float ipick = floor(istr * 4.0);
    if (ipick < 0.5) {
      float edge = smoothstep(0.05, 0.22, d) * (1.0 - smoothstep(0.34, 0.48, d));
      t.a *= mix(1.0, edge, u_hands.y);
      t.rgb *= mix(1.0, edge, u_hands.y);
    } else if (ipick < 1.5) {
      float hole = 1.0 - smoothstep(0.12, 0.22, d);
      float keep = 1.0 - u_hands.y * hole * (0.45 + 0.4 * v_seed);
      t.a *= keep;
      t.rgb *= keep;
    } else if (ipick < 2.5) {
      // double: second strike of the same cell, offset a few texels along a
      // seeded direction, mixed in faint. Clamped to the cell.
      float dstr = fract(v_seed * 4.9);
      float dang = dstr * 6.28318530718;
      vec2 ddir = vec2(cos(dang), sin(dang));
      vec2 uv2 = clamp(v_cell.xy + (local + ddir * u_hands.y * 0.015) * span, v_cell.xy, v_cell.zw);
      vec4 t2 = texture(u_atlas, uv2);
      t = mix(t, t2, u_hands.y * 0.35);
    } else {
      // crop: seeded window holds part of the mark back. Edge sits at
      // 0.4..0.6 so the window never keeps less than 40% of the cell.
      float cstr = fract(v_seed * 6.1);
      float cfg = floor(cstr * 4.0);
      float cedge = 0.4 + fract(cstr * 7.0) * 0.2;
      float coord = cfg < 0.5 ? local.x : cfg < 1.5 ? 1.0 - local.x : cfg < 2.5 ? local.y : 1.0 - local.y;
      float keep = 1.0 - smoothstep(cedge, cedge + 0.08, coord);
      float cmix = mix(1.0, keep, u_hands.y);
      t.a *= cmix;
      t.rgb *= cmix;
    }
  }
  if (u_liveTint > 0.5) {
    // Spine D: t.r is premultiplied ink mask, t.g is premultiplied accent mask,
    // t.b is the base grayscale mask (for hardcoded whites/blacks).
    // The asset SVG was baked using pure red (#ff0000) for ink, green (#00ff00) for accent.
    float inkA = max(0.0, t.r - t.b);
    float accA = max(0.0, t.g - t.b);
    vec3 color = inkA * v_ink + accA * v_accent + vec3(t.b);
    o = vec4(color * v_opacity, t.a * v_opacity);
  } else {
    o = vec4(t.rgb * v_opacity, t.a * v_opacity);
  }
  // #594: light the premultiplied colour; alpha untouched, rgb capped at alpha.
  // Gated on the uniform, not on v_light: the unlit path must not even clamp
  // (live-tint rgb can legitimately sit a hair above a), so off stays byte-identical.
  if (u_sun.w > 0.5) {
    if (u_sunMat.x > 0.0) {
      // #594 PR2 bevel-from-alpha (the Sprite Lamp trick): the mark's own alpha
      // is its height field, so edges slope and interiors face the camera — no
      // asset changes. Four taps, clamped inside this instance's atlas cell so a
      // neighbouring cell can never leak into the slope.
      vec2 tx = 1.0 / vec2(textureSize(u_atlas, 0));
      vec2 lo = min(v_cell.xy, v_cell.zw) + 0.5 * tx;
      vec2 hi = max(v_cell.xy, v_cell.zw) - 0.5 * tx;
      // Taps 2 texels out: a 1-texel slope turns 8-bit alpha steps into banding.
      // #1129 PR2: the glass variant spreads the taps (GLASS_BEVEL.tapTexels),
      // gentles the slope (bevelScale) and broadens the specular (specPow) —
      // frosted volume, not enamel edge. Non-glass keeps the exact existing
      // values: mix(x, y, 0.0) is bit-identical to x, so the enamel path below
      // is untouched.
      vec2 st = mix(2.0, ${GLASS_BEVEL.tapTexels.toFixed(1)}, v_glass) * tx;
      float aL = texture(u_atlas, clamp(v_uv - vec2(st.x, 0.0), lo, hi)).a;
      float aR = texture(u_atlas, clamp(v_uv + vec2(st.x, 0.0), lo, hi)).a;
      float aU = texture(u_atlas, clamp(v_uv - vec2(0.0, st.y), lo, hi)).a;
      float aD = texture(u_atlas, clamp(v_uv + vec2(0.0, st.y), lo, hi)).a;
      // Dead zone: slopes under ~2 alpha steps are quantization noise on a flat
      // face, not an edge — they read as flat instead of as fine stripes.
      // #1129 PR2: preserved exactly in the wide-tap variant. On a flat face
      // the gradient is ~0 at any tap distance, so the same threshold still
      // kills banding; on an edge the wider taps only ever make |g| larger.
      vec2 g = vec2(aL - aR, aU - aD);
      g = sign(g) * max(abs(g) - 2.0 / 255.0, 0.0);
      float k = u_sunMat.x * 6.0 * mix(1.0, ${GLASS_BEVEL.bevelScale.toFixed(2)}, v_glass);
      vec3 n = normalize(vec3(g * k, 1.0));
      n.xy *= v_rot.zw;                                               // mirror
      n.xy = vec2(n.x * v_rot.x - n.y * v_rot.y, n.x * v_rot.y + n.y * v_rot.x); // rotate
      vec3 L = normalize(vec3(u_sun.xy - v_world, u_sun.z));
      float diff = max(dot(n, L), 0.0);
      vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));                   // viewer straight on
      float spec = u_sunMat.y * pow(max(dot(n, H), 0.0), mix(48.0, ${GLASS_BEVEL.specPow.toFixed(1)}, v_glass)); // tight, enamel-like; broad for glass
      // #1129 PR3: caustic shimmer — one octave of the shared kc_vnoise chunk
      // (#196, procedural: no texture, no upload, per the #1079 lesson) breaks
      // the broad glass specular into luminous micro-variation. Per-instance
      // offset via v_seed so bodies don't share a noise pattern; the sun sweep
      // provides the motion (no time uniform). Glass-gated: mix(1.0, c, 0.0)
      // is bit-identical to 1.0 (c is finite, so c * 0.0 is +0.0), so the
      // enamel specular below is untouched.
      float causticN = kc_vnoise(v_uv * ${GLASS_CAUSTIC.freq.toFixed(1)} + v_seed * 17.0);
      spec *= mix(1.0, ${GLASS_CAUSTIC.base.toFixed(2)} + ${GLASS_CAUSTIC.amp.toFixed(2)} * causticN, v_glass);
      float wrap = max(diff * 0.65 + 0.35, 0.0);
      vec3 lit = vec3(u_ambient) + u_sunLight.rgb * (u_sunLight.a * wrap);
      o.rgb = min(o.rgb * lit + u_sunLight.rgb * (spec * u_sunLight.a) * o.a, vec3(o.a));
      if (u_pool > 0.0) {
        vec3 ink = vec3(0.07, 0.04, 0.03);
        vec3 paper = vec3(0.94, 0.86, 0.72);
        float night = 1.0 - wrap;
        o.rgb = mix(o.rgb, ink * o.a, u_pool * night * 0.7);
        o.rgb = min(mix(o.rgb, paper * o.a, u_pool * wrap * spec), vec3(o.a));
      }
    } else {
      o.rgb = min(o.rgb * v_light, vec3(o.a));
    }
  }
}`;

// #1129 PR3: the fragment stage joins the shared chunk library (#196) so the
// caustic term can use kc_vnoise instead of an inline noise duplicate (the
// chunk selfcheck bans those). Unused chunks compile out; the unlit path is
// unaffected — see glassCaustic.selfcheck.mjs.
export const QUAD_FS = injectCommon(QUAD_FS_SRC);

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
 * params. Grain is procedural hash speckle (#744) — no noise texture.
 * Premultiplied in/out; effects that need straight values unpremultiply
 * internally (invert/posterize math verified against resvg probes).
 */
export const EFFECT_FS = `#version 300 es
precision highp float;
uniform sampler2D u_src;
uniform int u_effect;
uniform vec4 u_p;
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
  } else if (u_effect == 1) {                 // rgbSplit: original screen-OR alpha
    float dx = u_p.x;                         // canvas-uv units
    vec4 r = texture(u_src, tuv - vec2(dx, 0.0));
    vec4 b = texture(u_src, tuv + vec2(dx, 0.0));
    float ao = 1.0 - (1.0 - r.a) * (1.0 - s.a) * (1.0 - b.a);
    o = vec4(r.r, s.g, b.b, ao);
  } else if (u_effect == 2) {                 // grain: #744 speckle, premul-safe so it survives RGB
    vec2 p = gl_FragCoord.xy;
    vec3 h = fract(vec3(p.xyx) * 0.1031);
    h += dot(h, h.yzx + 33.33);
    float n = fract((h.x + h.y) * h.z);
    float amt = clamp(u_p.y, 0.0, 1.0);
    float k = (n - 0.5) * amt * 0.55 * s.a;  // premul: no speckle where s.a == 0
    o = vec4(clamp(s.rgb + vec3(k), 0.0, s.a), s.a);
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

/** Final resolve lives in resolveFs.mjs (#532). Re-export so existing imports keep working. */
export { RESOLVE_FS } from './resolveFs.mjs';

/** Plain texture copy, no flip (FBO-to-FBO). */
export const COPY_FS = `#version 300 es
precision highp float;
uniform sampler2D u_src;
in vec2 v_cuv;
out vec4 o;
void main() {
  o = texture(u_src, v_cuv);
}`;

/**
 * Upscale a smaller source into the write target (#309: the half-res ACCUM
 * feedback pair is presented at backing size through this). Manual bilinear
 * via texelFetch — exact regardless of the source texture's filter mode
 * (the ACCUM targets are NEAREST). At an integer factor of 2 this is the
 * standard smooth upscale; the pair's softness is the point, not a bug.
 */
export const UPSCALE_FS = `#version 300 es
precision highp float;
uniform sampler2D u_src;
uniform vec2 u_srcSize;   // source size in px
in vec2 v_cuv;
out vec4 o;
void main() {
  vec2 st = v_cuv * u_srcSize - vec2(0.5);
  vec2 f = fract(st);
  ivec2 b = ivec2(floor(st));
  ivec2 lo = ivec2(0);
  ivec2 hi = ivec2(u_srcSize) - ivec2(1);
  vec4 s00 = texelFetch(u_src, clamp(b, lo, hi), 0);
  vec4 s10 = texelFetch(u_src, clamp(b + ivec2(1, 0), lo, hi), 0);
  vec4 s01 = texelFetch(u_src, clamp(b + ivec2(0, 1), lo, hi), 0);
  vec4 s11 = texelFetch(u_src, clamp(b + ivec2(1, 1), lo, hi), 0);
  o = mix(mix(s00, s10, f.x), mix(s01, s11, f.x), f.y);
}`;
