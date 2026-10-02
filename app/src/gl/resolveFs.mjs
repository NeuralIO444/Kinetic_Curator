/** Final resolve: 16F premultiplied -> RGBA8 premultiplied bytes.
 *  Flips v so readPixels returns top-first rows (resvg's convention).
 *  #532 PR1: ACES + exposure + Bayer compiled in, bypassed when
 *  u_aces=0 and u_dither=0 so goldens stay pixel-identical. PR2 flips the flags.
 */
export const RESOLVE_FS = `#version 300 es
precision highp float;
uniform sampler2D u_src;
uniform float u_aces;      // 0 = clamp-only bypass (PR1)
uniform float u_exposure;  // default 1.0
uniform float u_dither;    // 0 = off; PR2 ~0.5/255
uniform float u_shape;     // #706 cell size in px. 0 = off
uniform float u_fxaa;      // #740 PR1 probe: 0 = bypass (pixel-identical), >=0.5 = FXAA
uniform vec2 u_weave;      // #741 gate weave: sample-position offset in output px; (0,0) = byte-identical
uniform vec4 u_fake;       // x contact, y wrap, z shoulder. 0 = off
uniform vec2 u_light;      // sun direction in UV
in vec2 v_cuv;
out vec4 o;

vec3 unpre(vec3 c, float a) { return a > 1e-6 ? c / a : vec3(0.0); }

// Narkowicz ACES fit. Not identity at exposure 1 — that is why PR1 bypasses.
vec3 acesNarkowicz(vec3 x) {
  const float a = 2.51;
  const float b = 0.03;
  const float c = 2.43;
  const float d = 0.59;
  const float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

float bayer4(vec2 frag) {
  ivec2 i = ivec2(mod(floor(frag), 4.0));
  int idx = i.x + i.y * 4;
  const int[16] m = int[16](
    0, 8, 2, 10,
    12, 4, 14, 6,
    3, 11, 1, 9,
    15, 7, 13, 5
  );
  return (float(m[idx]) + 0.5) / 16.0;
}

// Display-referred (exposure + ACES), premultiplied tap: FXAA must see the
// luma the viewer sees, so it runs after tonemap, not on linear 16F.
vec4 dispTap(vec2 uv) {
  vec4 t = texture(u_src, uv);
  vec3 c = unpre(t.rgb, t.a) * max(u_exposure, 0.0);
  if (u_aces >= 0.5) c = acesNarkowicz(c);
  return vec4(clamp(c, 0.0, 1.0) * t.a, t.a);
}

// Luma plus a slice of alpha: node silhouettes are texture alpha, so an edge
// against transparent must register even when the shape is dark.
float fxaaLuma(vec4 p) { return dot(p.rgb, vec3(0.299, 0.587, 0.114)) + p.a * 0.25; }

// FXAA 3.11 console path (4 corner taps + 2/4-tap blend). Returns premultiplied.
vec4 fxaa(vec2 uv, vec2 px) {
  const float REDUCE_MIN = 1.0 / 128.0;
  const float REDUCE_MUL = 1.0 / 8.0;
  const float SPAN_MAX = 8.0;
  vec4 mM = dispTap(uv);
  vec4 nw = dispTap(uv + vec2(-1.0, -1.0) * px);
  vec4 ne = dispTap(uv + vec2( 1.0, -1.0) * px);
  vec4 sw = dispTap(uv + vec2(-1.0,  1.0) * px);
  vec4 se = dispTap(uv + vec2( 1.0,  1.0) * px);
  float lM = fxaaLuma(mM), lNW = fxaaLuma(nw), lNE = fxaaLuma(ne), lSW = fxaaLuma(sw), lSE = fxaaLuma(se);
  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
  float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
  float dirReduce = max((lNW + lNE + lSW + lSE) * (0.25 * REDUCE_MUL), REDUCE_MIN);
  float rcpDirMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
  dir = min(vec2(SPAN_MAX), max(vec2(-SPAN_MAX), dir * rcpDirMin)) * px;
  vec4 rgbA = 0.5 * (dispTap(uv + dir * (1.0 / 3.0 - 0.5)) + dispTap(uv + dir * (2.0 / 3.0 - 0.5)));
  vec4 rgbB = rgbA * 0.5 + 0.25 * (dispTap(uv + dir * -0.5) + dispTap(uv + dir * 0.5));
  float lB = fxaaLuma(rgbB);
  return (lB < lMin || lB > lMax) ? rgbA : rgbB;
}

void main() {
  // #741: whole-frame sub-pixel drift. x + 0.0 == x, so (0,0) changes nothing.
  vec2 suv = vec2(v_cuv.x, 1.0 - v_cuv.y) + u_weave / vec2(textureSize(u_src, 0));
  vec4 s = texture(u_src, suv);
  if (u_aces < 0.5 && u_dither < 1e-8 && u_fxaa < 0.5 && u_shape < 0.5) {
    o = clamp(s, 0.0, 1.0);
    return;
  }
  vec3 c = unpre(s.rgb, s.a) * max(u_exposure, 0.0);
  if (u_fake.x > 0.0 || u_fake.y > 0.0 || u_fake.z > 0.0) {
    vec2 px = 1.0 / vec2(textureSize(u_src, 0));
    vec2 dir = length(u_light) > 1e-4 ? normalize(u_light) : vec2(0.4, 0.7);
    if (u_fake.x > 0.0) {
      float occ = texture(u_src, suv - dir * 6.0 * px).a;
      c *= 1.0 - u_fake.x * occ * 0.45;
    }
    if (u_fake.y > 0.0) {
      float luma = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(c, mix(vec3(0.16, 0.08, 0.05), c, clamp(luma, 0.0, 1.0)), u_fake.y);
    }
    if (u_fake.z > 0.0) {
      float luma = dot(c, vec3(0.299, 0.587, 0.114));
      c += u_fake.z * pow(clamp(luma, 0.0, 1.0), 8.0) * vec3(1.0, 0.92, 0.8);
    }
  }
  if (u_aces >= 0.5) c = acesNarkowicz(c);
  float a = s.a;
  // #740: between tonemap and dither — dither stays the last thing to touch pixels.
  if (u_fxaa >= 0.5) {
    vec4 f = fxaa(suv, 1.0 / vec2(textureSize(u_src, 0)));
    c = unpre(f.rgb, f.a);
    a = f.a;
  }
  if (u_shape >= 0.5) {
    vec2 px = vec2(textureSize(u_src, 0));
    vec2 cell = floor(gl_FragCoord.xy / u_shape);
    vec2 center = (cell + 0.5) * u_shape;
    vec2 sampleUv = vec2(center.x / px.x, 1.0 - center.y / px.y);
    vec4 tap = texture(u_src, sampleUv);
    float luma = dot(tap.rgb, vec3(0.299, 0.587, 0.114));
    float radius = (1.0 - clamp(luma, 0.0, 1.0)) * u_shape * 0.5;
    float d = length(gl_FragCoord.xy - center);
    if (d < radius) c = mix(c, vec3(0.08, 0.05, 0.03), 0.85);
  }
  if (u_dither > 1e-8) {
    float b = bayer4(gl_FragCoord.xy) - 0.5;
    c += vec3(b * u_dither);
  }
  c = clamp(c, 0.0, 1.0);
  o = vec4(c * a, clamp(a, 0.0, 1.0));
}`;
