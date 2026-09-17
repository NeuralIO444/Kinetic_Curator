/**
 * ACCUM on GPU — Phase 4 (#190, absorbs #169's re-planned spec).
 * Browser-safe (pure ESM, no Node imports; only imports inside src/gl/).
 *
 * THE SHARED RECIPE. This module is the single source of truth for the
 * accumulation feedback loop. The future live loop and
 * `studio.py render --accum` both run this exact code — per #169's rule
 * the two paths share the recipe or the export refuses. There is no
 * 2D-canvas implementation (#190 rescinds #169's "no WebGL" rule, which was
 * written for the SVG era; the old useAccumulationBuffer path stays for the
 * SVG live canvas until the live loop migrates, but it is not the recipe).
 *
 * Recipe — per frame, on premultiplied 16F textures, opaque buffer:
 *
 *   0. Echoes (Phase B3): a ring buffer of past frames is mixed into the
 *      incoming frame — tap i holds the frame from i+1 steps ago, additive
 *      ghosts. Skipped at echoes = 0 (no ring, no mix pass).
 *   1. Feed (Phase B2): flow-advected feedback — the buffer is sampled at
 *      uv + flow(uv) * strength through a small in-shader noise field, so
 *      trails curl as they decay. Skipped at flow = 0 (exact old buffer).
 *   2. Fade/decay + feedback: accum.rgb *= keep (keep = fade, 0..0.99),
 *      sampled through the Phase A feedback transform — per-frame zoom +
 *      spin (TUNNEL, light-tunnels) and radial RGB channel separation
 *      (PRISM). All amounts 0/off by default: the transform is skipped and
 *      the sample is exactly the old one (the optics no-op precedent).
 *   3. Blur-over-time (#169): the incoming frame is blurred with a small
 *      separable gaussian (sigma = 5px * optics) BEFORE compositing, so old
 *      marks go soft instead of merely transparent.
 *   4. Composite:    accum = frame OVER accum      (premultiplied source-over)
 *   5. Bloom (#169): downsample accum to 1/4 (4x4 box) -> separable gaussian
 *      blur -> add back: accum.rgb += bloomAmount * blurred.
 *   6. Halation (#169): the same downsampled buffer blurred wider, added
 *      back with a warm/red bias: accum.rgb += halationAmount * warm * blurred.
 *
 * One amount drives 2/4/5: `optics` 0..1 (the GLOW slider next to FADE).
 * optics = 0 reduces the recipe to fade + over — the pass is a no-op, not a
 * second engine. Everything is off by default: the module is only invoked
 * when the scene contract carries accum.enabled (contract.accum null ->
 * plain renderScene, zero new passes).
 *
 * Era note: the 2D-canvas era faded ALPHA (destination-in *= keep) over the
 * page background. The GPU recipe fades LIGHT toward black (rgb *= keep) on
 * an opaque buffer — that is what #169 means by "ACCUM fade is already
 * faking" halation, and it is the documented light-feel: trails decay like
 * phosphor, new ink lands over, bloom lifts the bright cores warm.
 *
 * Precision: working buffers are RGBA16F (same as the renderer); the JS
 * mirror below is float64, so cross-checks use an epsilon, not exactness.
 */

import { FULL_VS, COPY_FS } from './shaders.mjs';
import { buildProgramChecked, auditProgramChecked } from './debug/diagnostics.mjs';

export const ACCUM_VERSION = 1;

/** Bridge layer id owning the feedback ping-pong (bridge-owned textures). */
export const ACCUM_LAYER_ID = '__accum__';

/** Bloom scratch resolution: 1/4 of the canvas per axis. */
export const BLOOM_DIV = 4;

const clamp01 = (v) => Math.min(1, Math.max(0, Number(v) || 0));

/** All recipe fields derived from the optics amount — one place, so audio
 *  modulation (applyAudioEnvelope) recomputes exactly what the base params
 *  carry. o = 0 is exactly the old path (no blur, no bloom, no halation). */
function opticsDerived(o) {
  return {
    optics: o,
    frameBlurSigma: 5.0 * o, // device px at full res (#169 blur-over-time)
    bloomAmount: 0.55 * o,
    bloomSigma: 9.0 * (0.5 + o), // device px at quarter res
    halationAmount: 0.45 * o,
    halationSigma: 22.0 * (0.5 + o), // wider than bloom, per #169
    halationTint: [1.0, 0.6, 0.35], // red/warm bias, per #169
  };
}

/**
 * Map UI params to per-frame recipe numbers. Pure — unit-tested in Node.
 * @param {object} p { fade: 0..0.99, optics: 0..1, tunnel: 0..1, prism: 0..1,
 *   flow: 0..1, echoes: 0..4 taps, echoWidth: render width in px (resolution gate) }
 */
export function accumRecipeParams({ fade = 0.88, optics = 0, tunnel = 0, prism = 0, flow = 0, echoes = 0, echoWidth = 0 } = {}) {
  const keep = Math.min(0.99, Math.max(0, Number(fade)));
  const o = clamp01(optics);
  const t = clamp01(tunnel);
  const pr = clamp01(prism);
  const fl = clamp01(flow);
  const e = Math.min(4, Math.max(0, Math.round(Number(echoes) || 0)));
  // B3 resolution gate: a full-res 16F ring target is ~8 bytes/px, so at
  // >=2K widths the tap count is capped (see "Echoes" in docs/ACCUM.md).
  const gated = echoWidth >= 2048 ? Math.min(e, 3) : e;
  return {
    keep,
    ...opticsDerived(o),
    // Phase A — feedback (tunnels + chromatic drift). All 0/off by default;
    // each is derived so that amount 0 is exactly the identity transform.
    // Ranges are tuned for stills (~24 frames): tunnel = 1 is a strong
    // spiral (27% zoom + 14 deg over the sequence); prism = 1 is a bold
    // rainbow at long fades (fringe width ~ p/(1-keep)), tasteful below ~0.4.
    tunnelZoom: 1 + 0.01 * t, // per-frame magnification; >1 recedes content toward center
    tunnelSpin: 0.01 * t, // radians per frame
    prismUv: 0.001 * pr, // radial UV offset per channel at prism = 1 (constant across canvas)
    // Phase B2 — flow-advected feedback. Max UV displacement per frame at
    // flow = 1 (30px on a 1000px canvas); 0 skips the FEED pass entirely.
    flowUv: 0.03 * fl,
    // Phase B3 — echoes. echoTaps K: tap i mixes the frame from i+1 steps
    // ago (delays 1..K), additive ghosts; weights decay with age. 0 = no
    // ring, no mix pass — exactly the old composite.
    echoTaps: gated,
    echoWeights: [0.5, 0.35, 0.25, 0.18].slice(0, gated),
  };
}

/**
 * Phase B1 — audio-reactive dynamics. Pure: takes recipe params and one
 * envelope sample { rms, flux, beatPulse } and returns modulated params.
 * The three gestures are deliberately distinct (per the audio research):
 *   rms       — loudness: swells keep and optics (the "swell")
 *   flux      — transient novelty: punches keep and stretches motion
 *   beatPulse — where-in-the-beat: fires 1.0 at each beat, decays over one
 *               beat interval (the "on the one" hit)
 * Silence (all zeros) returns the input values exactly — the no-audio path
 * is untouched. Note the optics modulation is deliberately gentle: bloom
 * is an additive per-frame feedback (accum.rgb += bloomAmount * blurred),
 * so large optics swings ratchet bright content toward white over a long
 * sequence. Audio swells the glow; it doesn't shove it.
 *
 * Modulation (documented in docs/ACCUM.md):
 *   keep   += 0.08*rms + 0.04*flux            (clamped <= 0.99)
 *   optics += 0.3*rms + 0.1*beatPulse         (clamped <= 1)
 *   tunnel / prism amounts scale x (1 + 2*rms + flux + beatPulse)
 */
export function applyAudioEnvelope(p, a = {}) {
  const { rms, flux, beatPulse } = sanitizeAudioSample(a);
  const r = rms;
  const x = flux;
  const b = beatPulse;
  if (r <= 0 && x <= 0 && b <= 0) return { ...p };
  const stretch = 1 + 2 * r + x + b;
  return {
    ...p,
    keep: Math.min(0.99, p.keep + 0.08 * r + 0.04 * x),
    // Optics is one amount driving blur + bloom + halation: recompute every
    // derived field so the glow genuinely swells with the music.
    ...opticsDerived(Math.min(1, p.optics + 0.3 * r + 0.1 * b)),
    tunnelZoom: 1 + (p.tunnelZoom - 1) * stretch,
    tunnelSpin: p.tunnelSpin * stretch,
    prismUv: p.prismUv * stretch,
  };
}

/** Sanitize one audio envelope sample for the recipe (rms/flux/beatPulse 0..1). */
export function sanitizeAudioSample({ rms = 0, flux = 0, beatPulse = 0 } = {}) {
  return { rms: clamp01(rms), flux: clamp01(flux), beatPulse: clamp01(beatPulse) };
}

/** Sanitize the optics amount for the scene contract (additive field). */
export function sanitizeAccumOptics(v) {
  return clamp01(v);
}

/** Sanitize the tunnel amount for the scene contract (additive field). */
export function sanitizeAccumTunnel(v) {
  return clamp01(v);
}

/** Sanitize the prism amount for the scene contract (additive field). */
export function sanitizeAccumPrism(v) {
  return clamp01(v);
}

/** Sanitize the flow amount for the scene contract (additive field). */
export function sanitizeAccumFlow(v) {
  return clamp01(v);
}

/** Sanitize the echo tap count for the scene contract (additive field). */
export function sanitizeAccumEchoes(v) {
  return Math.min(4, Math.max(0, Math.round(Number(v) || 0)));
}

// --- GLSL -----------------------------------------------------------------

export const FADE_FS = `#version 300 es
precision highp float;
uniform sampler2D u_src;
uniform float u_keep;
uniform float u_tunnelZoom;  // 1.0 = off
uniform float u_tunnelSpin;  // 0.0 = off (radians per frame)
uniform float u_prism;       // 0.0 = off (radial UV offset per channel)
in vec2 v_cuv;
out vec4 o;
void main() {
  // Phase A feedback: the transform branch is skipped unless a feedback
  // amount is live, so tunnel = 0 / prism = 0 is exactly the old sample
  // (no float drift through the affine math — the optics no-op precedent).
  vec2 tuv = v_cuv;
  if (u_tunnelZoom != 1.0 || u_tunnelSpin != 0.0) {
    vec2 off = v_cuv - vec2(0.5);
    float ca = cos(u_tunnelSpin);
    float sa = sin(u_tunnelSpin);
    vec2 rot = vec2(ca * off.x - sa * off.y, sa * off.x + ca * off.y);
    tuv = vec2(0.5) + rot * u_tunnelZoom;
  }
  vec4 c;
  if (u_prism > 0.0) {
    vec2 poff = tuv - vec2(0.5);
    vec2 pr = (poff / max(length(poff), 1e-4)) * u_prism;
    c = vec4(
      texture(u_src, tuv + pr).r,
      texture(u_src, tuv).g,
      texture(u_src, tuv - pr).b,
      texture(u_src, tuv).a);
  } else {
    c = texture(u_src, tuv);
  }
  o = vec4(c.rgb * u_keep, c.a);
}`;

// Phase B2 — flow-advected feedback. Samples the buffer at
// uv + flow(uv) * u_flow, where flow() is a small in-shader value-noise
// field (no textures). The hash is integer-based so the JS mirror can
// reproduce it exactly (float sin-hashes diverge between GPU float32 and
// JS float64). Skipped on the CPU side at flow = 0 — exact old behavior.
export const FEED_FS = `#version 300 es
precision highp float;
uniform sampler2D u_src;
uniform float u_flow;   // max UV displacement; 0 = off (pass skipped)
in vec2 v_cuv;
out vec4 o;
uint ihash(uvec2 p) {
  p = p * 1664525u + 1013904223u;
  uint h = p.x ^ p.y;
  h ^= h >> 16u; h *= 2246822519u; h ^= h >> 13u;
  return h;
}
float hash2(vec2 p) { return float(ihash(uvec2(p))) * 2.3283064365386963e-10; }
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash2(i);
  float b = hash2(i + vec2(1.0, 0.0));
  float c = hash2(i + vec2(0.0, 1.0));
  float d = hash2(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
vec2 flowVec(vec2 uv) {
  // Static curl-ish field: two coarse octaves minus their means, plus a
  // fine octave for braid detail. Static per frame, but the buffer is
  // re-advected every frame, so trails curl as they decay.
  vec2 p = uv * 6.0;
  float n1 = vnoise(p);
  float n2 = vnoise(p + vec2(7.3, 2.9));
  float n3 = vnoise(p * 2.0 + vec2(3.1, 9.7));
  return vec2(n1 - 0.5 + 0.5 * (n3 - 0.5), n2 - 0.5 - 0.5 * (n3 - 0.5));
}
void main() {
  vec2 tuv = v_cuv + flowVec(v_cuv) * u_flow;
  o = texture(u_src, tuv);
}`;

// Phase B3 — echoes. Mixes the live frame with ring-buffer taps:
// tap i holds the frame from i+1 steps ago (delays 1..K). Additive
// ghosts — the live frame stays at weight 1.0.
export const ECHO_FS = `#version 300 es
precision highp float;
uniform sampler2D u_src;   // live frame
uniform sampler2D u_t0;
uniform sampler2D u_t1;
uniform sampler2D u_t2;
uniform sampler2D u_t3;
uniform vec4 u_w;          // per-tap weights
uniform int u_ntaps;
in vec2 v_cuv;
out vec4 o;
void main() {
  vec4 acc = texture(u_src, v_cuv);
  if (u_ntaps > 0) acc += texture(u_t0, v_cuv) * u_w.x;
  if (u_ntaps > 1) acc += texture(u_t1, v_cuv) * u_w.y;
  if (u_ntaps > 2) acc += texture(u_t2, v_cuv) * u_w.z;
  if (u_ntaps > 3) acc += texture(u_t3, v_cuv) * u_w.w;
  // Additive RGB, but the result feeds source-over: clamp alpha to <= 1.
  o = vec4(acc.rgb, min(acc.a, 1.0));
}`;

export const OVER_FS = `#version 300 es
precision highp float;
uniform sampler2D u_src;   // new frame
uniform sampler2D u_dst;   // faded accum
in vec2 v_cuv;
out vec4 o;
void main() {
  vec4 s = texture(u_src, v_cuv);
  vec4 d = texture(u_dst, v_cuv);
  o = s + d * (1.0 - s.a);   // premultiplied source-over
}`;

// 4x4 box downsample via texelFetch (filtering-independent, exact).
export const DOWN_FS = `#version 300 es
precision highp float;
uniform sampler2D u_src;
in vec2 v_cuv;
out vec4 o;
void main() {
  ivec2 base = ivec2(gl_FragCoord.xy - vec2(0.5, 0.5)) * ${BLOOM_DIV};
  vec4 acc = vec4(0.0);
  for (int j = 0; j < ${BLOOM_DIV}; j++) {
    for (int i = 0; i < ${BLOOM_DIV}; i++) {
      acc += texelFetch(u_src, base + ivec2(i, j), 0);
    }
  }
  o = acc / float(${BLOOM_DIV * BLOOM_DIV});
}`;

// Separable gaussian, same kernel convention as the builtin blur effect
// (EFFECT_FS): w0 = 1/sqrt(2pi)/sigma, R = ceil(3*sigma), normalized.
export const BLUR_FS = `#version 300 es
precision highp float;
uniform sampler2D u_src;
uniform vec2 u_texel;    // 1/w, 1/h of the write target in device px
uniform float u_sigma;   // device px of the write target
uniform float u_vertical;
in vec2 v_cuv;
out vec4 o;
void main() {
  float sigma = max(u_sigma, 1e-3);
  vec2 stepv = u_vertical > 0.5 ? vec2(0.0, u_texel.y) : vec2(u_texel.x, 0.0);
  vec2 tuv = v_cuv;
  int R = int(ceil(sigma * 3.0));
  float w0 = 0.3989422804014327 / sigma;
  vec4 acc = texture(u_src, tuv) * w0;
  float wsum = w0;
  for (int i = 1; i <= 64; i++) {
    if (i > R) break;
    float w = w0 * exp(-float(i * i) / (2.0 * sigma * sigma));
    vec2 off = stepv * float(i);
    acc += (texture(u_src, tuv + off) + texture(u_src, tuv - off)) * w;
    wsum += 2.0 * w;
  }
  o = acc / wsum;
}`;

export const ADD_FS = `#version 300 es
precision highp float;
uniform sampler2D u_base;    // full-res accum
uniform sampler2D u_bloom;   // quarter-res blurred light (NEAREST)
uniform vec2 u_bloomSize;    // quarter-res size in px
uniform float u_amount;
uniform vec3 u_tint;
in vec2 v_cuv;
out vec4 o;
// Manual bilinear: exact regardless of the bloom texture's filtering.
// Coordinates are clamped before texelFetch (edges would otherwise be UB).
vec3 sampleBloom(vec2 uv) {
  vec2 st = uv * u_bloomSize - vec2(0.5);
  vec2 f = fract(st);
  ivec2 b = ivec2(floor(st));
  ivec2 lo = ivec2(0);
  ivec2 hi = ivec2(u_bloomSize) - ivec2(1);
  vec3 s00 = texelFetch(u_bloom, clamp(b, lo, hi), 0).rgb;
  vec3 s10 = texelFetch(u_bloom, clamp(b + ivec2(1, 0), lo, hi), 0).rgb;
  vec3 s01 = texelFetch(u_bloom, clamp(b + ivec2(0, 1), lo, hi), 0).rgb;
  vec3 s11 = texelFetch(u_bloom, clamp(b + ivec2(1, 1), lo, hi), 0).rgb;
  return mix(mix(s00, s10, f.x), mix(s01, s11, f.x), f.y);
}
void main() {
  vec4 base = texture(u_base, v_cuv);
  vec3 glow = sampleBloom(v_cuv);
  o = vec4(base.rgb + u_amount * u_tint * glow, base.a);
}`;

/**
 * Every ACCUM GPU program in one table — the single source of truth for
 * what createAccum builds and what the debug harness audits (#193 second
 * pass). `uniforms` is the exact set each pass's setup callback uploads;
 * the checked audit throws if the shader declares anything outside it.
 */
export const ACCUM_PROGRAMS = {
  fade: { fs: FADE_FS, file: 'accum.mjs:FADE_FS', uniforms: ['u_src', 'u_keep', 'u_tunnelZoom', 'u_tunnelSpin', 'u_prism'] },
  feed: { fs: FEED_FS, file: 'accum.mjs:FEED_FS', uniforms: ['u_src', 'u_flow'] },
  echo: { fs: ECHO_FS, file: 'accum.mjs:ECHO_FS', uniforms: ['u_src', 'u_t0', 'u_t1', 'u_t2', 'u_t3', 'u_w', 'u_ntaps'] },
  copy: { fs: COPY_FS, file: 'shaders.mjs:COPY_FS', uniforms: ['u_src'] },
  over: { fs: OVER_FS, file: 'accum.mjs:OVER_FS', uniforms: ['u_src', 'u_dst'] },
  down: { fs: DOWN_FS, file: 'accum.mjs:DOWN_FS', uniforms: ['u_src'] },
  blur: { fs: BLUR_FS, file: 'accum.mjs:BLUR_FS', uniforms: ['u_src', 'u_texel', 'u_sigma', 'u_vertical'] },
  add: { fs: ADD_FS, file: 'accum.mjs:ADD_FS', uniforms: ['u_base', 'u_bloom', 'u_bloomSize', 'u_amount', 'u_tint'] },
};

// --- targets ---------------------------------------------------------------

function makeTarget(gl, w, h) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error('[accum] framebuffer incomplete');
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { tex, fb, w, h };
}

function deleteTarget(gl, t) {
  gl.deleteTexture(t.tex);
  gl.deleteFramebuffer(t.fb);
}

// --- JS mirror (float64) of the per-frame recipe, for cross-checks ---------

function gaussKernel(sigma) {
  const R = Math.ceil(sigma * 3);
  const w0 = 0.3989422804014327 / sigma;
  const w = [w0];
  let sum = w0;
  for (let i = 1; i <= R; i++) {
    const wi = w0 * Math.exp(-(i * i) / (2 * sigma * sigma));
    w.push(wi);
    sum += 2 * wi;
  }
  return { R, w, sum };
}

function gaussBlur(src, w, h, sigma) {
  if (!(sigma > 1e-3)) return src.slice();
  const { R, w: kw, sum } = gaussKernel(sigma);
  const tmp = new Float64Array(src.length);
  const out = new Float64Array(src.length);
  const at = (buf, x, y, c) => buf[(Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))) * 4 + c];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < 4; c++) {
        let a = at(src, x, y, c) * kw[0];
        for (let i = 1; i <= R; i++) a += (at(src, x - i, y, c) + at(src, x + i, y, c)) * kw[i];
        tmp[(y * w + x) * 4 + c] = a / sum;
      }
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < 4; c++) {
        let a = at(tmp, x, y, c) * kw[0];
        for (let i = 1; i <= R; i++) a += (at(tmp, x, y - i, c) + at(tmp, x, y + i, c)) * kw[i];
        out[(y * w + x) * 4 + c] = a / sum;
      }
    }
  }
  return out;
}

function boxDownsample(src, w, h) {
  const bw = Math.max(1, Math.floor(w / BLOOM_DIV));
  const bh = Math.max(1, Math.floor(h / BLOOM_DIV));
  const out = new Float64Array(bw * bh * 4);
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      for (let c = 0; c < 4; c++) {
        let a = 0;
        for (let j = 0; j < BLOOM_DIV; j++) {
          for (let i = 0; i < BLOOM_DIV; i++) {
            a += src[(Math.min(h - 1, y * BLOOM_DIV + j) * w + Math.min(w - 1, x * BLOOM_DIV + i)) * 4 + c];
          }
        }
        out[(y * bw + x) * 4 + c] = a / (BLOOM_DIV * BLOOM_DIV);
      }
    }
  }
  return { px: out, w: bw, h: bh };
}

function bilinearUpsample(src, bw, bh, w, h) {
  // Mirrors ADD_FS sampleBloom: st = uv*size - 0.5, fract/floor, texelFetch clamp.
  const out = new Float64Array(w * h * 4);
  const fetch = (x, y, c) => src[(Math.min(bh - 1, Math.max(0, y)) * bw + Math.min(bw - 1, Math.max(0, x))) * 4 + c];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w, v = (y + 0.5) / h;
      const stx = u * bw - 0.5, sty = v * bh - 0.5;
      const fx = stx - Math.floor(stx), fy = sty - Math.floor(sty);
      const bx = Math.floor(stx), by = Math.floor(sty);
      for (let c = 0; c < 4; c++) {
        const s00 = fetch(bx, by, c), s10 = fetch(bx + 1, by, c);
        const s01 = fetch(bx, by + 1, c), s11 = fetch(bx + 1, by + 1, c);
        out[(y * w + x) * 4 + c] = (s00 * (1 - fx) + s10 * fx) * (1 - fy) + (s01 * (1 - fx) + s11 * fx) * fy;
      }
    }
  }
  return out;
}

/**
 * Phase B2 mirror of the FEED pass noise field. Integer hash — identical
 * algorithm to FEED_FS (GLSL uint wraps mod 2^32; JS uses Math.imul + >>>0),
 * so the mirror reproduces the GPU field up to float32/float64 rounding.
 * All lattice coords are non-negative (uv in [0,1], positive offsets), so
 * float->uint truncation matches uvec2() on both sides.
 */
function ihash2(px, py) {
  const x = (Math.imul(px, 1664525) + 1013904223) >>> 0;
  const y = (Math.imul(py, 1664525) + 1013904223) >>> 0;
  let h = (x ^ y) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  h = Math.imul(h, 2246822519) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  return h / 4294967296;
}

function vnoise2(px, py) {
  const ix = Math.floor(px), iy = Math.floor(py);
  const fx = px - ix, fy = py - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = ihash2(ix, iy);
  const b = ihash2(ix + 1, iy);
  const c = ihash2(ix, iy + 1);
  const d = ihash2(ix + 1, iy + 1);
  return (a + (b - a) * ux) * (1 - uy) + (c + (d - c) * ux) * uy;
}

/** Flow displacement vector for UV (u, v), matching FEED_FS flowVec. */
export function mirrorFlowVec(u, v) {
  const px = u * 6, py = v * 6;
  const n1 = vnoise2(px, py);
  const n2 = vnoise2(px + 7.3, py + 2.9);
  const n3 = vnoise2(px * 2 + 3.1, py * 2 + 9.7);
  return [n1 - 0.5 + 0.5 * (n3 - 0.5), n2 - 0.5 - 0.5 * (n3 - 0.5)];
}

/** Phase B3 echo ring state for the mirror (persists across steps). */
export function createEchoState() {
  return { frames: [] };
}

/**
 * Float64 mirror of one recipe step. accum/frame are Float64Array(w*h*4),
 * premultiplied, bottom-first. Returns a new Float64Array.
 * @param {object} [args.echo] — createEchoState() ring; required when
 *   params.echoTaps > 0, ignored otherwise.
 */
export function mirrorAccumStep({ accum, frame, w, h, params, echo = null }) {
  const p = params;
  const n = w * h * 4;
  // 0. echoes — ring buffer of past frames, multi-tap mix. Tap i mixes the
  // frame from i+1 steps ago. Skipped at echoTaps = 0 (no ring, no mix).
  // Mix from the historical frames FIRST, then push the current frame:
  // K targets hold exactly K past-frame taps (delays 1..K).
  let frameIn = frame;
  if (p.echoTaps > 0) {
    if (!echo) throw new Error('[accum] mirrorAccumStep: echoTaps > 0 requires an echo state (createEchoState())');
    const taps = Math.min(echo.frames.length, p.echoTaps);
    if (taps > 0) {
      frameIn = frame.slice();
      for (let t = 0; t < taps; t++) {
        const past = echo.frames[echo.frames.length - 1 - t];
        const wt = p.echoWeights[t] || 0;
        for (let i = 0; i < n; i++) frameIn[i] += past[i] * wt;
      }
      // Additive RGB, but the result must stay a valid source-over alpha.
      for (let i = 3; i < n; i += 4) frameIn[i] = Math.min(1, frameIn[i]);
    }
    echo.frames.push(frame.slice());
    while (echo.frames.length > p.echoTaps) echo.frames.shift();
  }
  // 1. feed — Phase B2 flow advection of the buffer. The buffer texture is
  // NEAREST + CLAMP_TO_EDGE, so the mirror samples the nearest texel. At
  // flow = 0 the pass is skipped and the buffer is exactly the old one.
  let fed = accum;
  if (p.flowUv > 0) {
    fed = new Float64Array(n);
    const nearest = (u, v, c) => {
      const sx = Math.min(w - 1, Math.max(0, Math.floor(u * w)));
      const sy = Math.min(h - 1, Math.max(0, Math.floor(v * h)));
      return accum[(sy * w + sx) * 4 + c];
    };
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const u = (x + 0.5) / w, v = (y + 0.5) / h;
        const [fx, fy] = mirrorFlowVec(u, v);
        const tu = u + fx * p.flowUv, tv = v + fy * p.flowUv;
        const o = (y * w + x) * 4;
        fed[o] = nearest(tu, tv, 0);
        fed[o + 1] = nearest(tu, tv, 1);
        fed[o + 2] = nearest(tu, tv, 2);
        fed[o + 3] = nearest(tu, tv, 3);
      }
    }
  }
  // 2. fade (+ Phase A feedback transform). The feedback textures are
  // NEAREST + CLAMP_TO_EDGE, so the mirror samples the nearest texel:
  // sx = clamp(floor(u * w), 0, w - 1). At tunnel/prism = 0 the transform
  // is skipped and this is the exact old path.
  const faded = new Float64Array(n);
  const feedback = p.tunnelZoom !== 1 || p.tunnelSpin !== 0 || p.prismUv !== 0;
  if (!feedback) {
    for (let i = 0; i < n; i += 4) {
      faded[i] = fed[i] * p.keep;
      faded[i + 1] = fed[i + 1] * p.keep;
      faded[i + 2] = fed[i + 2] * p.keep;
      faded[i + 3] = fed[i + 3];
    }
  } else {
    const nearest = (u, v, c) => {
      const sx = Math.min(w - 1, Math.max(0, Math.floor(u * w)));
      const sy = Math.min(h - 1, Math.max(0, Math.floor(v * h)));
      return fed[(sy * w + sx) * 4 + c];
    };
    const ca = Math.cos(p.tunnelSpin), sa = Math.sin(p.tunnelSpin);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const u = (x + 0.5) / w, v = (y + 0.5) / h;
        const ox = u - 0.5, oy = v - 0.5;
        const tu = 0.5 + (ca * ox - sa * oy) * p.tunnelZoom;
        const tv = 0.5 + (sa * ox + ca * oy) * p.tunnelZoom;
        let r, g, b, a;
        if (p.prismUv > 0) {
          const pox = tu - 0.5, poy = tv - 0.5;
          const len = Math.max(Math.hypot(pox, poy), 1e-4);
          const prx = (pox / len) * p.prismUv, pry = (poy / len) * p.prismUv;
          r = nearest(tu + prx, tv + pry, 0);
          g = nearest(tu, tv, 1);
          b = nearest(tu - prx, tv - pry, 2);
          a = nearest(tu, tv, 3);
        } else {
          r = nearest(tu, tv, 0);
          g = nearest(tu, tv, 1);
          b = nearest(tu, tv, 2);
          a = nearest(tu, tv, 3);
        }
        const o = (y * w + x) * 4;
        faded[o] = r * p.keep;
        faded[o + 1] = g * p.keep;
        faded[o + 2] = b * p.keep;
        faded[o + 3] = a;
      }
    }
  }
  // 3. blur-over-time on the incoming frame (post-echo mix)
  const fIn = gaussBlur(frameIn, w, h, p.frameBlurSigma);
  // 4. over
  const comp = new Float64Array(n);
  for (let i = 0; i < n; i += 4) {
    const sa = fIn[i + 3];
    comp[i] = fIn[i] + faded[i] * (1 - sa);
    comp[i + 1] = fIn[i + 1] + faded[i + 1] * (1 - sa);
    comp[i + 2] = fIn[i + 2] + faded[i + 2] * (1 - sa);
    comp[i + 3] = sa + faded[i + 3] * (1 - sa);
  }
  if (p.optics <= 0) return comp;
  // 5/6. bloom + halation from the same downsampled buffer
  const { px: down, w: bw, h: bh } = boxDownsample(comp, w, h);
  const bloomBlur = gaussBlur(down, bw, bh, p.bloomSigma);
  const halBlur = gaussBlur(down, bw, bh, p.halationSigma);
  const bloomUp = bilinearUpsample(bloomBlur, bw, bh, w, h);
  const halUp = bilinearUpsample(halBlur, bw, bh, w, h);
  const out = new Float64Array(n);
  const [tr, tg, tb] = p.halationTint;
  for (let i = 0; i < n; i += 4) {
    out[i] = comp[i] + p.bloomAmount * bloomUp[i] + p.halationAmount * tr * halUp[i];
    out[i + 1] = comp[i + 1] + p.bloomAmount * bloomUp[i + 1] + p.halationAmount * tg * halUp[i + 1];
    out[i + 2] = comp[i + 2] + p.bloomAmount * bloomUp[i + 2] + p.halationAmount * tb * halUp[i + 2];
    out[i + 3] = comp[i + 3]; // adds lift light only; the buffer stays opaque
  }
  return out;
}

// --- GPU object ------------------------------------------------------------

/**
 * @param {WebGL2RenderingContext} gl
 * @param {object} bridge the JS↔GL bridge (owns the feedback ping-pong)
 * @param {object} size { width, height } canvas px
 */
export function createAccum(gl, bridge, { width, height }) {
  if (bridge.lost) throw new Error('[accum] context lost — recreate after restore');
  let W = Math.max(4, Math.round(width));
  let H = Math.max(4, Math.round(height));

  const progs = {};
  const locs = {};
  const build = () => {
    for (const [name, def] of Object.entries(ACCUM_PROGRAMS)) {
      progs[name] = buildProgramChecked(gl, FULL_VS, def.fs, {
        name: `accum-${name}`,
        vsFile: 'accum.mjs:FULL_VS',
        fsFile: def.file,
      });
      // Uniform gate (#193 second pass): the shader may only declare
      // uniforms its pass uploads. A mismatch throws here — naming the
      // pass and file — instead of failing silently mid-render.
      auditProgramChecked(gl, progs[name], def.uniforms, {
        name: `accum-${name}`,
        file: def.file,
      });
      const L = {};
      const U = (n) => gl.getUniformLocation(progs[name], n);
      for (const u of ['u_src', 'u_dst', 'u_keep', 'u_tunnelZoom', 'u_tunnelSpin', 'u_prism',
        'u_flow',
        'u_t0', 'u_t1', 'u_t2', 'u_t3', 'u_w', 'u_ntaps',
        'u_texel', 'u_sigma', 'u_vertical',
        'u_base', 'u_bloom', 'u_bloomSize', 'u_amount', 'u_tint']) {
        L[u] = U(u);
      }
      locs[name] = L;
    }
  };
  build();

  // Fullscreen triangle; FULL_VS maps a_pos via v_cuv = a_pos*0.5+0.5.
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  // Bridge-owned feedback ping-pong (the ACCUM buffer itself).
  let L = bridge.layer(ACCUM_LAYER_ID);
  // Accum-owned scratch: full-res blur pair + quarter-res downsample/blur set.
  let scratch = null;
  const allocScratch = () => {
    const bw = Math.max(1, Math.floor(W / BLOOM_DIV));
    const bh = Math.max(1, Math.floor(H / BLOOM_DIV));
    scratch = {
      fs0: makeTarget(gl, W, H), fs1: makeTarget(gl, W, H),
      em: makeTarget(gl, W, H), // B3 echo mix target (full-res)
      bd: makeTarget(gl, bw, bh), bs0: makeTarget(gl, bw, bh), bs1: makeTarget(gl, bw, bh),
      bw, bh,
    };
  };
  allocScratch();

  // B3 echo ring: accum-owned full-res 16F targets holding past frames.
  // Tap i = frame from i+1 steps ago (delays 1..K).
  let echoRing = [];
  let echoHead = 0; // next slot to write
  let echoCount = 0; // valid frames in the ring
  const ensureEcho = (taps) => {
    if (echoRing.length !== taps) {
      for (const t of echoRing) deleteTarget(gl, t);
      echoRing = [];
      for (let i = 0; i < taps; i++) echoRing.push(makeTarget(gl, W, H));
      echoHead = 0;
      echoCount = 0;
    }
  };
  const freeEcho = () => {
    for (const t of echoRing) deleteTarget(gl, t);
    echoRing = [];
    echoHead = 0;
    echoCount = 0;
  };

  let cur = L.t0; // target holding the current accum image
  const other = () => (cur === L.t0 ? L.t1 : L.t0);

  const bindTex = (unit, tex) => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    return unit;
  };

  function pass(name, writeT, setup) {
    if (bridge.lost) throw new Error('[accum] context lost — chain paused');
    gl.bindFramebuffer(gl.FRAMEBUFFER, writeT.fb);
    gl.viewport(0, 0, writeT.w, writeT.h);
    gl.disable(gl.BLEND);
    gl.useProgram(progs[name]);
    setup(locs[name], bindTex);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disableVertexAttribArray(0);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  function blurInto(srcTex, wTarget, sigma, swapT) {
    // Two separable passes: srcTex -> wTarget(H) -> swapT(V). Returns the target holding the result.
    pass('blur', wTarget, (u, bind) => {
      gl.uniform1i(u.u_src, bind(0, srcTex));
      gl.uniform2f(u.u_texel, 1 / wTarget.w, 1 / wTarget.h);
      gl.uniform1f(u.u_sigma, sigma);
      gl.uniform1f(u.u_vertical, 0);
    });
    pass('blur', swapT, (u, bind) => {
      gl.uniform1i(u.u_src, bind(0, wTarget.tex));
      gl.uniform2f(u.u_texel, 1 / swapT.w, 1 / swapT.h);
      gl.uniform1f(u.u_sigma, sigma);
      gl.uniform1f(u.u_vertical, 1);
    });
    return swapT;
  }

  const hexToRgb = (hex) => {
    const m = /^#?([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.exec(String(hex || ''));
    if (!m) return [0, 0, 0];
    const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  };

  return {
    version: ACCUM_VERSION,

    /** Clear the feedback buffer to the background color (opaque). */
    begin(background = '#000000') {
      if (bridge.lost) throw new Error('[accum] context lost — chain paused');
      L = bridge.layer(ACCUM_LAYER_ID);
      cur = L.t0;
      echoHead = 0;
      echoCount = 0; // B3: the ring holds no valid frames after CLEAR
      const [r, g, b] = hexToRgb(background);
      for (const t of [L.t0, L.t1]) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
        gl.viewport(0, 0, t.w, t.h);
        gl.clearColor(r, g, b, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    },

    /**
     * Run one frame of the recipe.
     * @param {WebGLTexture} frameTex full-res 16F premultiplied frame
     * @param {object} params from accumRecipeParams()
     * @returns the target holding the current accum image (bridge-owned)
     */
    step(frameTex, params) {
      const p = params;
      // 0. echoes (B3) — mix the live frame with the ring's past taps
      // FIRST, then push the incoming frame: K targets hold exactly K
      // past-frame taps (delays 1..K). Skipped at echoTaps = 0: the live
      // frame feeds the composite directly (exact old behavior).
      let frameIn = frameTex;
      if (p.echoTaps > 0) {
        ensureEcho(p.echoTaps);
        const K = echoRing.length;
        const taps = Math.min(echoCount, p.echoTaps);
        if (taps > 0) {
          pass('echo', scratch.em, (u, bind) => {
            gl.uniform1i(u.u_src, bind(0, frameTex));
            for (let i = 0; i < 4; i++) {
              // Tap i = frame from i+1 steps ago (ring holds past frames only).
              const slot = i < taps
                ? echoRing[(echoHead - 1 - i + 2 * K) % K].tex
                : frameTex; // unused sampler: any valid texture
              gl.uniform1i(u[`u_t${i}`], bind(1 + i, slot));
            }
            const wv = p.echoWeights;
            gl.uniform4f(u.u_w, wv[0] || 0, wv[1] || 0, wv[2] || 0, wv[3] || 0);
            gl.uniform1i(u.u_ntaps, taps);
          });
          frameIn = scratch.em.tex;
        }
        pass('copy', echoRing[echoHead], (u, bind) => {
          gl.uniform1i(u.u_src, bind(0, frameTex));
        });
        echoHead = (echoHead + 1) % K;
        echoCount = Math.min(echoCount + 1, K);
      }
      // 1. feed (B2) — flow-advected feedback. Skipped at flow = 0: the
      // buffer is exactly the old one (the optics no-op precedent).
      let write = other();
      if (p.flowUv > 0) {
        pass('feed', write, (u, bind) => {
          gl.uniform1i(u.u_src, bind(0, cur.tex));
          gl.uniform1f(u.u_flow, p.flowUv);
        });
        cur = write;
        write = other();
      }
      // 2. fade (+ Phase A feedback: tunnel zoom/spin, prism drift)
      pass('fade', write, (u, bind) => {
        gl.uniform1i(u.u_src, bind(0, cur.tex));
        gl.uniform1f(u.u_keep, p.keep);
        gl.uniform1f(u.u_tunnelZoom, p.tunnelZoom);
        gl.uniform1f(u.u_tunnelSpin, p.tunnelSpin);
        gl.uniform1f(u.u_prism, p.prismUv);
      });
      cur = write;
      // 3. blur-over-time on the incoming frame (post-echo mix)
      if (p.optics > 0 && p.frameBlurSigma > 1e-3) {
        const blurred = blurInto(frameIn, scratch.fs0, p.frameBlurSigma, scratch.fs1);
        frameIn = blurred.tex;
      }
      // 4. over
      write = other();
      pass('over', write, (u, bind) => {
        gl.uniform1i(u.u_src, bind(0, frameIn));
        gl.uniform1i(u.u_dst, bind(1, cur.tex));
      });
      cur = write;
      // 5/6. bloom + halation (no-ops when optics = 0)
      if (p.optics > 0) {
        pass('down', scratch.bd, (u, bind) => {
          gl.uniform1i(u.u_src, bind(0, cur.tex));
        });
        const addGlow = (sigma, amount, tint) => {
          const blurred = blurInto(scratch.bd.tex, scratch.bs0, sigma, scratch.bs1);
          write = other();
          pass('add', write, (u, bind) => {
            gl.uniform1i(u.u_base, bind(0, cur.tex));
            gl.uniform1i(u.u_bloom, bind(1, blurred.tex));
            gl.uniform2f(u.u_bloomSize, scratch.bw, scratch.bh);
            gl.uniform1f(u.u_amount, amount);
            gl.uniform3f(u.u_tint, tint[0], tint[1], tint[2]);
          });
          cur = write;
        };
        addGlow(p.bloomSigma, p.bloomAmount, [1, 1, 1]);
        addGlow(p.halationSigma, p.halationAmount, p.halationTint);
      }
      const err = gl.getError();
      if (err !== gl.NO_ERROR) throw new Error(`[accum] GL error after step: 0x${err.toString(16)}`);
      return cur;
    },

    /** Current accum image (bridge-owned target). */
    texture() {
      return cur;
    },

    resize(width, height) {
      W = Math.max(4, Math.round(width));
      H = Math.max(4, Math.round(height));
      for (const t of [scratch.fs0, scratch.fs1, scratch.em, scratch.bd, scratch.bs0, scratch.bs1]) deleteTarget(gl, t);
      allocScratch();
      freeEcho(); // B3: ring targets are sized to the canvas
      // Bridge-owned feedback targets resize via bridge.resize (caller-owned).
      L = bridge.layer(ACCUM_LAYER_ID);
      cur = L.t0;
    },

    dispose() {
      for (const t of [scratch.fs0, scratch.fs1, scratch.em, scratch.bd, scratch.bs0, scratch.bs1]) deleteTarget(gl, t);
      scratch = null;
      freeEcho();
      for (const p of Object.values(progs)) gl.deleteProgram(p);
      gl.deleteBuffer(vbo);
      // Bridge-owned feedback targets die with bridge.dispose().
    },
  };
}

/**
 * Additive export for the MLX harness intelligence work (backend hardening 6/6).
 * Maps accum pass name -> its fragment shader source, for static feature
 * extraction (app/src/gl/mlx/). Nothing above changed; this only exposes what
 * was already there.
 */
export const ACCUM_PASS_SOURCES = Object.freeze({
  fade: FADE_FS,
  feed: FEED_FS,
  echo: ECHO_FS,
  copy: COPY_FS,
  over: OVER_FS,
  down: DOWN_FS,
  blur: BLUR_FS,
  add: ADD_FS,
});
