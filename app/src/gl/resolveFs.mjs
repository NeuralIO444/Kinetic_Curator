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

void main() {
  vec4 s = texture(u_src, vec2(v_cuv.x, 1.0 - v_cuv.y));
  if (u_aces < 0.5 && u_dither < 1e-8) {
    o = clamp(s, 0.0, 1.0);
    return;
  }
  vec3 c = unpre(s.rgb, s.a) * max(u_exposure, 0.0);
  if (u_aces >= 0.5) c = acesNarkowicz(c);
  if (u_dither > 1e-8) {
    float b = bayer4(gl_FragCoord.xy) - 0.5;
    c += vec3(b * u_dither);
  }
  c = clamp(c, 0.0, 1.0);
  o = vec4(c * s.a, clamp(s.a, 0.0, 1.0));
}`;
