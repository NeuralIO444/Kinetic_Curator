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
 * #309: the feedback pair runs at HALF resolution (logical size on the
 * retina/live path — bridge.layer('__accum__', { div: dprScale })). The
 * incoming frame is resampled down to the pair's size first (manual
 * bilinear, exact for any dprScale), and the returned target is upscaled
 * for presentation by the caller (renderer.presentUpscaled / the live
 * loop). Echo taps, weights, and the mix are untouched.
 *
 *   0. (pre) Resample (#309) — a backing-store-sized frame is resampled
 *      down to the pair's size first (manual bilinear, exact for any
 *      dprScale). Skipped when the frame already matches the pair
 *      (resDiv = 1: stills/export).
 *   1. Echoes (Phase B3): a ring buffer of past frames is mixed into the
 *      incoming frame — tap i holds the frame from i+1 steps ago, additive
 *      ghosts. Skipped at echoes = 0 (no ring, no mix pass).
 *   2. Feed (Phase B2): flow-advected feedback — the buffer is sampled at
 *      uv + flow(uv) * strength through a small in-shader noise field, so
 *      trails curl as they decay. Skipped at flow = 0 (exact old buffer).
 *   3. Fade/decay + feedback: accum.rgb lerps toward the palette background
 *      (keep = fade, 0..0.99) — #287 fade-to-paper: on light grounds
 *      trails fall toward the paper, not black. The background rides in
 *      the recipe params (bg, parsed from the background CSS color);
 *      black (the default) keeps the old `rgb *= keep` exactly.
 *      Sampled through the Phase A feedback transform — per-frame zoom +
 *      spin (TUNNEL, light-tunnels) and radial RGB channel separation
 *      (PRISM). All amounts 0/off by default: the transform is skipped and
 *      the sample is exactly the old one (the optics no-op precedent).
 *   3. (removed #308) — the instrument has no gaussian blur, so there is no
 *      blur-over-time: the incoming frame lands sharp. Old marks go soft
 *      through the glow system instead.
 *   4. Composite:    accum = frame OVER accum      (premultiplied source-over)
 *   5. Mip-chain bloom (#308): downsample accum to 1/8 (8x8 box) into a
 *      mipmapped glow target — the hardware builds the chain
 *      (generateMipmap), near-free. The glow pass samples a smaller mip
 *      level: accum.rgb += bloomAmount * mipGlow.
 *   6. Stipple diffusion + chromatic offset (#308): the same glow read is
 *      scattered into fading dots (pointillist, not airbrushed — Haeckel's
 *      engraving language, Davis's print logic) and shifted slightly per
 *      RGB channel at the edges. The wider warm pass (halation) reads a
 *      smaller mip with a red/warm bias:
 *      accum.rgb += halationAmount * warm * stippledGlow.
 *
 * One amount drives 5/6: `optics` 0..1 (the GLOW slider next to FADE).
 * optics = 0 reduces the recipe to fade + over — the pass is a no-op, not a
 * second engine. Everything is off by default: the module is only invoked
 * when the scene contract carries accum.enabled (contract.accum null ->
 * plain renderScene, zero new passes).
 *
 * Earn-back rule (#308): there is no blur quality setting and no hidden
 * path back to gaussian blur anywhere in this module. If Matt's eyes miss
 * it, it earns its way back through an issue — not through a flag.
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
import { registerCostTier } from './costTiers.mjs';
import { sampleFlowField } from './flowField.mjs';

export const ACCUM_VERSION = 2;

/** Bridge layer id owning the feedback ping-pong (bridge-owned textures). */
export const ACCUM_LAYER_ID = '__accum__';

/** Glow scratch resolution: 1/8 of the canvas per axis (base of the mip chain). */
export const GLOW_DIV = 8;

/** Stipple dot pitch in device px — the engraving grain of the glow. */
export const STIPPLE_PITCH = 3;

const clamp01 = (v) => Math.min(1, Math.max(0, Number(v) || 0));

/** All recipe fields derived from the optics amount — one place, so audio
 *  modulation (applyAudioEnvelope) recomputes exactly what the base params
 *  carry. o = 0 is exactly the old path (no glow). There are no blur
 *  sigmas here (#308): the glow is mip-chain bloom + stipple diffusion +
 *  chromatic offset, and nothing in this module can ask for a gaussian. */
function opticsDerived(o) {
  return {
    optics: o,
    // Mip-chain bloom (#308): which mip level of the glow target to read.
    // The target's base level is canvas/8, so lod 1 ≈ canvas/16, lod 2 ≈
    // canvas/32, lod 3 ≈ canvas/64 — sampling a smaller mip *is* the blur,
    // built by the hardware for free.
    bloomAmount: 0.22 * o,
    bloomLod: 1.0 + o, // 1.0 -> 2.0: the tight glow widens with the slider
    halationAmount: 0.16 * o,
    halationLod: 2.0 + o, // 2.0 -> 3.0: wider + warmer than bloom, per #169's role
    halationTint: [1.0, 0.6, 0.35], // red/warm bias, per #169
    // Stipple diffusion (#308): how pointillist the glow reads, 0..1. The
    // dot density still tracks local luminance (bright cores stay solid,
    // only the falloff dissolves into dots), so 1 is engraving, not noise.
    stipple: o,
    // Chromatic offset (#308): radial RGB shift at the edges, in texels of
    // the sampled mip level — reads as softness, near-zero cost.
    chromaTexels: 1.5 * o,
  };
}

/**
 * Map UI params to per-frame recipe numbers. Pure — unit-tested in Node.
 *
 * Safe ranges (#763) — the bounds live here, next to the params, and every
 * out-of-range or non-numeric input is clamped (never passed through):
 *   fade    0..0.99  feedback keep; 1.0 would recirculate forever. NaN → 0
 *                    (no feedback — the safe direction, not the loud one)
 *   optics, tunnel, prism, flow  0..1 (garbage → 0)
 *   echoes  0..4 taps (0..3 at >= 2048px wide, the memory gate)
 * The per-frame result is re-checked by assertRecipeFinite() at step().
 * @param {object} p { fade: 0..0.99, optics: 0..1, tunnel: 0..1, prism: 0..1,
 *   flow: 0..1, echoes: 0..4 taps, echoWidth: render width in px (resolution gate) }
 */
export function accumRecipeParams({ fade = 0.88, optics = 0, tunnel = 0, prism = 0, flow = 0, echoes = 0, echoWidth = 0, background = '#000000', leave = false, ribbon = false, comet = false, leaveFade = 0, tunnelFade = 0, prismFade = 0, flowFade = 0, wetStep = 0, wetGain = 0, wetAmount = 0, wetVel = null, wetMask = null } = {}) {
  // NaN slips through Math.max/min (they return NaN), which would poison the
  // feedback buffer — non-finite fade collapses to 0 (#763).
  const keep = Number.isFinite(Number(fade)) ? Math.min(0.99, Math.max(0, Number(fade))) : 0;
  const o = clamp01(optics);
  const leaveEarly = !!leave;
  const fadeOf = (v) => leaveEarly ? 1 - Math.min(1, Math.max(0, Number(v) || 0)) : 1;
  const t = clamp01(tunnel) * fadeOf(tunnelFade);
  const pr = clamp01(prism) * fadeOf(prismFade);
  const fl = clamp01(flow) * fadeOf(flowFade);
  const e = Math.min(4, Math.max(0, Math.round(Number(echoes) || 0)));
  // B3 resolution gate: a full-res 16F ring target is ~8 bytes/px, so at
  // >=2K widths the tap count is capped (see "Echoes" in docs/ACCUM.md).
  const gated = echoWidth >= 2048 ? Math.min(e, 3) : e;
  // #287 fade-to-paper: the fade target, parsed from the background CSS
  // color. Black keeps the legacy `rgb *= keep` exactly (0 * (1 - keep) = 0).
  const bg = hexToRgb01(background);
  const held = !!leave;
  return {
    leave,
    ribbon: !!ribbon,
    comet: !!comet,
    keep: held
      ? Math.min(1, Math.max(0, 1 - (Number(leaveFade) || 0)))
      : ribbon ? Math.max(keep, 0.96)
      : comet ? Math.min(keep, 0.72)
      : keep,
    bg,
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
    flowUv: ribbon ? Math.max(0.03 * fl, 0.012) : 0.03 * fl,
    // #970: integer gate. 0 keeps the dry feed/fade/glow programs. Gain is
    // exactly 0 on that path so a caller cannot leak an offset.
    wetStep: wetStep === 1 ? 1 : 0,
    wetGain: wetStep === 1 && Number.isFinite(Number(wetGain)) ? Number(wetGain) : 0,
    wetAmount: wetStep === 1 && Number.isFinite(Number(wetAmount)) ? Math.min(1, Math.max(0, Number(wetAmount))) : 0,
    wetVel: wetStep === 1 ? wetVel : null,
    wetMask: wetStep === 1 ? wetMask : null,
    // Phase B3 — echoes. echoTaps K: tap i mixes the frame from i+1 steps
    // ago (delays 1..K), additive ghosts; weights decay with age. 0 = no
    // ring, no mix pass — exactly the old composite.
    echoTaps: gated,
    echoWeights: [0.5, 0.35, 0.25, 0.18].slice(0, gated),
  };
}

/**
 * #763 — the per-frame poison guard. A NaN/Infinity anywhere in the recipe
 * would be multiplied into the feedback buffer and recirculate forever, a
 * failure that shows only as a smear found by eye. Fail closed: throw before
 * any pass runs, so the live loop's ACCUM fault path (teardown → fresh
 * buffer → cooldown) clears it and repeated faults trip the watchdog.
 */
export class AccumRecipeError extends Error {
  constructor(field) {
    super(`[accum] recipe field "${field}" is not finite — refusing to feed the buffer`);
    this.name = 'AccumRecipeError';
  }
}
export function assertRecipeFinite(p) {
  const bad = (v) => (Array.isArray(v) ? v.some(bad) : typeof v === 'number' && !Number.isFinite(v));
  for (const [k, v] of Object.entries(p)) if (bad(v)) throw new AccumRecipeError(k);
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
 *   optics += (1 - optics) * swell * (0.3*rms + 0.1*beatPulse)   (headroom-relative)
 *   tunnel / prism amounts scale x (1 + 2*rms + flux + beatPulse)
 *
 * `swell` (0..1, default 1, third arg) is the audio→glow fader: it scales
 * only the glow gesture, so a performer can tame the washout a loud
 * passage causes at high optics without touching the slider. swell = 0
 * means audio never moves the glow; the keep/tunnel/prism gestures are
 * unaffected. The headroom-relative form (#303) is untouched — audio
 * swells toward the slider's ceiling, never past it.
 */
export function applyAudioEnvelope(p, a = {}, opts = {}) {
  const { rms, flux, beatPulse } = sanitizeAudioSample(a);
  const r = rms;
  const x = flux;
  const b = beatPulse;
  // #790 PR5 (render.accum): the assignable route's output, in hundredths of
  // keep (0..40 → +0..0.40 trail persistence). Clamped finite here too — the
  // recipe guard trips the watchdog on non-finite, so never trust the caller.
  const accumAudio = Number.isFinite(opts.accumAudio) ? Math.min(40, Math.max(0, opts.accumAudio)) : 0;
  if (r <= 0 && x <= 0 && b <= 0 && accumAudio <= 0) return { ...p };
  // #306: swell scales the audio contribution to the glow only. clamp01
  // coerces garbage (NaN, non-numeric) to 0, so a bad caller mutes the glow
  // gesture rather than exploding it.
  const swell = clamp01(opts.swell ?? 1);
  const stretch = 1 + 2 * r + x + b;
  return {
    ...p,
    keep: Math.min(0.99, p.keep + 0.08 * r + 0.04 * x + accumAudio / 100),
    // #273: optics modulation is headroom-relative — audio swells the glow
    // toward the slider's ceiling instead of adding past it, so loud audio
    // can never peg GLOW at 1. The gesture keeps its full strength at
    // optics = 0 and tapers as the slider rises; the slider keeps authority.
    // #306: multiplied by swell — the performer's washout control.
    // Optics is one amount driving the glow system: recompute every
    // derived field so the glow genuinely swells with the music.
    ...opticsDerived(clamp01(p.optics + (1 - p.optics) * swell * (0.3 * r + 0.1 * b))),
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

/** #287 — CSS hex ('#rgb' / '#rrggbb') → [r, g, b] 0..1. Unparseable → black. */
function hexToRgb01(hex) {
  const m = /^#?([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.exec(String(hex || ''));
  if (!m) return [0, 0, 0];
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
}

// --- GLSL -----------------------------------------------------------------

export const FADE_FS = `#version 300 es
precision highp float;
uniform sampler2D u_src;
uniform float u_keep;
uniform vec3 u_bg;  // #287 fade-to-paper: the fade target (palette background)
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
  o = vec4(mix(u_bg, c.rgb, u_keep), c.a);
}`;

// Phase B2 — flow-advected feedback. Samples the buffer at
// uv + flow(uv) * u_flow. Default flow() is the integer hash (legacy,
// seedless). When u_flowShared is set, the displacement is the project-seed
// curl table uploaded by the loop — the same createNoise the swarm uses.
// The hash stays so a step with no field is byte-identical to before.
// Skipped on the CPU side at flow = 0 — exact old behavior.
export const FEED_FS = `#version 300 es
precision highp float;
uniform sampler2D u_src;
uniform sampler2D u_flowField;
uniform float u_flow;   // max UV displacement; 0 = off (pass skipped)
uniform float u_flowShared; // 1 = sample the project-seed curl table
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
  // RGBA8 table: xy packed from [-1,1] into [0,1]. CI's GL probe rejects RGBA16F uploads.
  vec2 advect = u_flowShared > 0.5 ? texture(u_flowField, v_cuv).xy * 2.0 - 1.0 : flowVec(v_cuv);
  vec2 tuv = v_cuv + advect * u_flow;
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

// #560 comet-head: the bright head. COMET promises "a bright head and a short
// tail" — the tail is the 0.72 keep cap, the head is this boost on the incoming
// frame in the shared OVER_FS. Same program, parameterized (not a fork), so
// #815's "no second fade law" holds. Hot-fade is deliberately NOT built.
const COMET_HEAD_BOOST = 1.15;

export const OVER_FS = `#version 300 es
precision highp float;
uniform sampler2D u_src;   // new frame
uniform sampler2D u_dst;   // faded accum
uniform float u_headBoost; // 1.0 = off (today's render, bit-identical)
in vec2 v_cuv;
out vec4 o;
void main() {
  vec4 s = texture(u_src, v_cuv);
  s.rgb *= u_headBoost;      // brighten the incoming head; the tail law is untouched
  vec4 d = texture(u_dst, v_cuv);
  o = s + d * (1.0 - s.a);   // premultiplied source-over
}`;

// 8x8 box downsample via texelFetch (filtering-independent, exact) into
// the glow target's base mip level.
export const DOWN_FS = `#version 300 es
precision highp float;
uniform sampler2D u_src;
in vec2 v_cuv;
out vec4 o;
void main() {
  ivec2 base = ivec2(gl_FragCoord.xy - vec2(0.5, 0.5)) * ${GLOW_DIV};
  vec4 acc = vec4(0.0);
  for (int j = 0; j < ${GLOW_DIV}; j++) {
    for (int i = 0; i < ${GLOW_DIV}; i++) {
      acc += texelFetch(u_src, base + ivec2(i, j), 0);
    }
  }
  o = acc / float(${GLOW_DIV * GLOW_DIV});
}`;

// The glow pass (#308): mip-chain bloom + stipple diffusion + chromatic
// offset. There is no gaussian blur in this instrument — sampling a smaller
// mip level *is* the blur (the hardware builds the chain via
// generateMipmap, near-free), and it has its own look: dreamier than
// gaussian, broken into engraving dots by the stipple, fringed at the
// edges by the chromatic offset.
export const GLOW_FS = `#version 300 es
precision highp float;
uniform sampler2D u_base;    // full-res accum
uniform sampler2D u_glow;    // mipmapped glow target (RGBA8, LINEAR_MIPMAP_LINEAR)
uniform vec2 u_glowSize;     // base mip level size in px
uniform float u_lod;         // mip level to read (1.0 = 1/16 of the canvas)
uniform float u_stipple;     // 0..1: how pointillist the glow reads
uniform float u_chromaTexels;// radial RGB shift, in texels of the sampled mip
uniform float u_amount;
uniform vec3 u_tint;
in vec2 v_cuv;
out vec4 o;
uint ihash(uvec2 p) {
  p = p * 1664525u + 1013904223u;
  uint h = p.x ^ p.y;
  h ^= h >> 16u; h *= 2246822519u; h ^= h >> 13u;
  return h;
}
void main() {
  vec4 base = texture(u_base, v_cuv);
  // Chromatic offset: radial RGB shift at the edges, sized in texels of the
  // sampled mip so the fringe is visible at any lod. Green stays centered.
  vec2 texel = exp2(u_lod) / u_glowSize;
  vec2 coff = (v_cuv - vec2(0.5)) * u_chromaTexels * texel;
  vec3 glow;
  glow.r = textureLod(u_glow, v_cuv + coff, u_lod).r;
  glow.g = textureLod(u_glow, v_cuv, u_lod).g;
  glow.b = textureLod(u_glow, v_cuv - coff, u_lod).b;
  // Stipple diffusion: a screen-space dot grid; each dot survives where the
  // local glow luminance clears a hashed threshold — bright cores read
  // solid, dim falloff dissolves into fading dots. Pointillist, not
  // airbrushed: Haeckel's engraving language, Davis's print logic.
  // The hash is quantized to 16 bits: float(uint) rounds below bit 24, so
  // the full 32-bit hash would not reproduce exactly across GPU/CPU — the
  // 16-bit threshold is bit-exact on both sides (the JS mirror uses the
  // same quantization), isolating cross-check noise to the glow value.
  vec2 grid = floor(gl_FragCoord.xy / ${STIPPLE_PITCH}.0);
  float h = float(ihash(uvec2(grid)) >> 16u) * 1.52587890625e-05;
  float lum = dot(glow, vec3(0.299, 0.587, 0.114));
  float gate = mix(1.0, step(h, clamp(lum * 2.0, 0.0, 1.0)), u_stipple);
  vec3 lit = base.rgb + u_amount * u_tint * glow * gate;
  o = vec4(min(lit, vec3(1.0)), base.a);
}`;

// #970 slice 2/3 — wet programs. Built from the dry strings so FEED_FS /
// FADE_FS / GLOW_FS stay the dry path. Not registered as cost tiers: they
// are the same passes, used only when wetStep === 1. The dry path does not
// bind u_wetVel or u_wetMask.
export const FEED_WET_FS = FEED_FS.replace(
  'uniform float u_flowShared; // 1 = sample the project-seed curl table',
  `uniform float u_flowShared; // 1 = sample the project-seed curl table
uniform sampler2D u_wetVel; // added velocity, bilinear. Not the dry program.
uniform float u_wetGain;    // UV scale of the added offset`,
).replace(
  'vec2 tuv = v_cuv + advect * u_flow;',
  `vec2 tuv = v_cuv + advect * u_flow;
  vec2 wet = texture(u_wetVel, v_cuv).xy * 2.0 - 1.0;
  tuv += wet * u_wetGain;`,
);

export const FADE_WET_FS = FADE_FS.replace(
  'out vec4 o;',
  `out vec4 o;
uniform sampler2D u_wetMask; // 64x64 wet, bilinear. Not the dry program.
uniform float u_wetAmount;
uint ihashWet(uvec2 p) {
  p = p * 1664525u + 1013904223u;
  uint h = p.x ^ p.y;
  h ^= h >> 16u; h *= 2246822519u; h ^= h >> 13u;
  return h;
}`,
).replace(
  'o = vec4(mix(u_bg, c.rgb, u_keep), c.a);',
  `float wet = texture(u_wetMask, tuv).r;
  float paper = float(ihashWet(uvec2(gl_FragCoord.xy)) >> 16u) * 1.52587890625e-05;
  float edge = wet * (1.0 - wet) * 4.0;
  vec3 rgb = c.rgb * (1.0 - 0.45 * edge * u_wetAmount);
  // Granulation is multiplicative: pigment brightness varies with the paper
  // hash. Additive grain would pump a noise floor into the feedback loop
  // (the keep-fade amplifies any per-frame addition by 1/(1-keep)).
  rgb *= 1.0 + (paper - 0.5) * 0.5 * (1.0 - wet) * u_wetAmount;
  o = vec4(mix(u_bg, rgb, u_keep), c.a);`,
);

export const GLOW_WET_FS = GLOW_FS.replace(
  'uniform vec3 u_tint;',
  `uniform vec3 u_tint;
uniform sampler2D u_wetMask;
uniform float u_wetAmount;`,
).replace(
  'vec3 lit = base.rgb + u_amount * u_tint * glow * gate;',
  `vec3 lit = base.rgb + u_amount * u_tint * glow * gate;
  float wet = texture(u_wetMask, v_cuv).r;
  float paper = float(ihash(uvec2(gl_FragCoord.xy)) >> 16u) * 1.52587890625e-05;
  float edge = wet * (1.0 - wet) * 4.0;
  lit *= 1.0 - 0.28 * edge * u_wetAmount;
  // Multiplicative granulation (see FADE_WET_FS): the glow pass writes back
  // into the feedback buffer, so additive grain would accumulate.
  lit *= 1.0 + (paper - 0.5) * 0.35 * (1.0 - wet) * u_wetAmount;`,
);

// #970 slice 5 — cheap pigment mix. Not Kubelka-Munk. Dry OVER_FS is untouched.
// While the wet mask is up, two deposits blend toward their concentration
// average instead of stacking toward white.
export const OVER_WET_FS = OVER_FS.replace(
  'uniform float u_headBoost; // 1.0 = off (today\'s render, bit-identical)',
  `uniform float u_headBoost; // 1.0 = off (today's render, bit-identical)
uniform sampler2D u_wetMask;
uniform float u_wetAmount;`,
).replace(
  'o = s + d * (1.0 - s.a);   // premultiplied source-over',
  `vec4 over = s + d * (1.0 - s.a);
  float wet = texture(u_wetMask, v_cuv).r * u_wetAmount;
  vec3 sc = clamp(s.rgb / max(s.a, 1e-4), 0.0, 1.0);
  vec3 dc = clamp(d.rgb / max(d.a, 1e-4), 0.0, 1.0);
  vec3 pigment = (sc * s.a + dc * d.a) / max(s.a + d.a, 1e-4);
  float mixT = wet * step(0.02, d.a);
  o = vec4(mix(over.rgb, pigment * over.a, mixT), over.a);`,
);


// Frame resample for #309: the feedback pair runs at logical size, but the
// incoming frame can be backing-store sized (live retina path). This pass
// brings the frame down to the write target's size with manual bilinear
// sampling (texelFetch — exact regardless of the source texture's filter
// mode, and exact for any downsample factor, including fractional
// dprScale). At an integer factor of 2 it reduces to the 2x2 box average.
// Coordinates are clamped before texelFetch (out-of-range is UB).
export const RESAMPLE_FS = `#version 300 es
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

/**
 * Every ACCUM GPU program in one table — the single source of truth for
 * what createAccum builds and what the debug harness audits (#193 second
 * pass). `uniforms` is the exact set each pass's setup callback uploads;
 * the checked audit throws if the shader declares anything outside it.
 */
/**
 * Cost-tier declarations (hardening 3/6): the cost lives IN each pass
 * definition, not in a separate list. The whole ACCUM chain is tier 1 —
 * the governor's perfTier1 shed covers the chain exactly (see
 * costTiers.tier1ShedIds()); copy/over/down are structural plumbing
 * *within* the chain, so they ride tier 1 with it rather than tier 0.
 * One 1080p RGBA16F frame = 1920*1080*8 bytes.
 *
 * The registry reads the declarations straight out of ACCUM_PROGRAMS —
 * there is no parallel cost-only map to drift out of sync.
 */
const FRAME_16F = 1920 * 1080 * 8;
export const ACCUM_PROGRAMS = {
  // Fade + tunnel/prism feedback in one pass.
  fade: { fs: FADE_FS, file: 'accum.mjs:FADE_FS', uniforms: ['u_src', 'u_keep', 'u_bg', 'u_tunnelZoom', 'u_tunnelSpin', 'u_prism'],
    cost: { tier: 1, memoryBytes: FRAME_16F, timeMs: 0.8, notes: 'fade + tunnel/prism feedback; shed with ACCUM' } },
  // Flow feedback: advects the buffer through the flow field.
  feed: { fs: FEED_FS, file: 'accum.mjs:FEED_FS', uniforms: ['u_src', 'u_flowField', 'u_flow', 'u_flowShared'],
    cost: { tier: 1, memoryBytes: FRAME_16F, timeMs: 1.0, notes: 'flow feedback advection' } },
  // Echoes: mixes up to 4 past frames; the ring is the memory-heavy one.
  echo: { fs: ECHO_FS, file: 'accum.mjs:ECHO_FS', uniforms: ['u_src', 'u_t0', 'u_t1', 'u_t2', 'u_t3', 'u_w', 'u_ntaps'],
    cost: { tier: 1, memoryBytes: 5 * FRAME_16F, timeMs: 1.2,
      notes: '4-frame ring + mix; ring dominates the working set',
      memoryGate: { minWidth: 2048, maxTaps: 3 } } },
  copy: { fs: COPY_FS, file: 'shaders.mjs:COPY_FS', uniforms: ['u_src'],
    cost: { tier: 1, memoryBytes: FRAME_16F, timeMs: 0.2, notes: 'chain plumbing: ping-pong copy, shed with the chain' } },
  over: { fs: OVER_FS, file: 'accum.mjs:OVER_FS', uniforms: ['u_src', 'u_dst', 'u_headBoost'],
    cost: { tier: 1, memoryBytes: FRAME_16F, timeMs: 0.25, notes: 'chain plumbing: source-over, shed with the chain' } },
  down: { fs: DOWN_FS, file: 'accum.mjs:DOWN_FS', uniforms: ['u_src'],
    cost: { tier: 1, memoryBytes: FRAME_16F / 64, timeMs: 0.3, notes: 'chain plumbing: 8x8 box downsample into the glow target, shed with the chain' } },
  // The glow pass (#308): mip-chain bloom + stipple diffusion + chromatic
  // offset. One pass per glow tier (bloom, halation); the mip levels are
  // built by the hardware (generateMipmap), so the per-pass cost is a
  // single textured fullscreen read with a few ALU ops. There is no blur
  // pass in this instrument anymore.
  glow: { fs: GLOW_FS, file: 'accum.mjs:GLOW_FS', uniforms: ['u_base', 'u_glow', 'u_glowSize', 'u_lod', 'u_stipple', 'u_chromaTexels', 'u_amount', 'u_tint'],
    cost: { tier: 1, memoryBytes: FRAME_16F, timeMs: 0.6, notes: 'mip-chain bloom + stipple + chroma; one pass per tier (bloom, halation); shed with ACCUM' } },
  // #309: backing-store frame -> logical-size feedback pair, one fullscreen
  // pass, only in the live retina path (resDiv > 1). Tier 0 structural
  // plumbing — shedding it alone would break the recipe (frame/pair size
  // mismatch), so it lives and dies with the chain itself.
  resample: { fs: RESAMPLE_FS, file: 'accum.mjs:RESAMPLE_FS', uniforms: ['u_src', 'u_srcSize'],
    cost: { tier: 0, memoryBytes: FRAME_16F, timeMs: 0.3, notes: 'structural ACCUM plumbing (frame resample to feedback-pair size); never shed alone' } },
};

for (const [name, def] of Object.entries(ACCUM_PROGRAMS)) {
  registerCostTier(`accum/${name}`, def.cost);
}

/**
 * Audio modulation: scalar math on the recipe params per frame (CPU, no
 * GPU pass, no textures). Effectively free — tier 0, never shed, per the
 * architecture contract. Declared at its definition site
 * (applyAudioEnvelope, just below).
 */
registerCostTier('audio/modulation', {
  tier: 0, memoryBytes: 0, timeMs: 0.01,
  notes: 'scalar per-frame recipe math (CPU); the cheapest thing in the chain, never shed',
});

// #560 LEAVE. Hold is the copy pass, not a new shader. Tier 1 with the chain:
// a shed loses the stamps and they recover when the chain comes back.
// Disclosed, not engineered around. CLEAR still wipes both pair buffers.
registerCostTier('accum/leave', {
  tier: 1, memoryBytes: FRAME_16F, timeMs: 0.2,
  notes: 'LEAVE hold: copy instead of fade. Shed loses the stamps; CLEAR wipes both buffers',
});

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

/**
 * The glow target (#308): RGBA8 with a full mip chain. The DOWN pass
 * renders the 8x8 box average into level 0, then generateMipmap builds
 * the chain — RGBA8 is always filterable, so the chain works on every
 * WebGL2 implementation with no float-filtering extension. Glow is
 * additive lift light; 8 bits per channel is plenty.
 */
function makeGlowTarget(gl, w, h) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error('[accum] glow framebuffer incomplete');
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { tex, fb, w, h };
}

// --- JS mirror (float64) of the per-frame recipe, for cross-checks ---------

// (#308: the gaussian helpers are gone — blurPassSigmas, gaussKernel and
// mirrorGaussBlur were deleted with the blur passes. The mirror below
// reproduces the new glow system: box downsample, a mip chain, trilinear
// sampling with chromatic offsets, and the stipple gate.)

/**
 * Drain any pending (sticky) GL errors. WebGL errors are sticky flags, not
 * exceptions: an error raised by earlier non-ACCUM work in the same frame
 * (content render, timer queries) stays queued until something calls
 * getError(). step()'s post-pass check must only reflect the ACCUM passes
 * themselves — without this drain, a benign upstream error is misattributed
 * to ACCUM, step() throws every frame, and the live loop (which has no other
 * fault isolation for the ACCUM branch) freezes on the last presented frame.
 * The queue is finite; the cap is pure paranoia.
 */
export function drainGlErrors(gl, maxDrain = 16) {
  for (let i = 0; i < maxDrain; i++) {
    if (gl.getError() === gl.NO_ERROR) break;
  }
}

/**
 * Box-downsample into the glow target's base mip level, then quantize to
 * 8-bit: the GPU's DOWN pass renders float light into an RGBA8 target, so
 * the mirror rounds exactly like the framebuffer write does.
 */
function boxDownsample(src, w, h, div = GLOW_DIV) {
  const bw = Math.max(1, Math.floor(w / div));
  const bh = Math.max(1, Math.floor(h / div));
  const out = new Float64Array(bw * bh * 4);
  const q = (v) => Math.round(Math.min(1, Math.max(0, v)) * 255) / 255;
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      for (let c = 0; c < 4; c++) {
        let a = 0;
        for (let j = 0; j < div; j++) {
          for (let i = 0; i < div; i++) {
            a += src[(Math.min(h - 1, y * div + j) * w + Math.min(w - 1, x * div + i)) * 4 + c];
          }
        }
        out[(y * bw + x) * 4 + c] = q(a / (div * div));
      }
    }
  }
  return { px: out, w: bw, h: bh };
}

/**
 * Mirror of the hardware mip chain (generateMipmap): each level is the 2x2
 * box average of the previous, quantized to 8-bit per level like the
 * RGBA8 chain the GPU builds. Level sizes halve (floor, min 1), matching
 * the GL spec's mip sizing.
 */
export function mirrorMipChain(base, gw, gh) {
  const levels = [{ px: base, w: gw, h: gh }];
  const q = (v) => Math.round(Math.min(1, Math.max(0, v)) * 255) / 255;
  let prev = levels[0];
  while (prev.w > 1 || prev.h > 1) {
    const w = Math.max(1, Math.floor(prev.w / 2));
    const h = Math.max(1, Math.floor(prev.h / 2));
    const px = new Float64Array(w * h * 4);
    const fetch = (x, y, c) => prev.px[(Math.min(prev.h - 1, y) * prev.w + Math.min(prev.w - 1, x)) * 4 + c];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        for (let c = 0; c < 4; c++) {
          px[(y * w + x) * 4 + c] = q(
            (fetch(2 * x, 2 * y, c) + fetch(2 * x + 1, 2 * y, c) +
             fetch(2 * x, 2 * y + 1, c) + fetch(2 * x + 1, 2 * y + 1, c)) / 4);
        }
      }
    }
    prev = { px, w, h };
    levels.push(prev);
  }
  return levels;
}

/**
 * Bilinear sample of one mip level, mirroring the hardware LINEAR filter:
 * texel centers at (i+0.5)/size, clamped edges (CLAMP_TO_EDGE).
 */
function bilinearLevel(level, u, v, c) {
  const { px, w, h } = level;
  const stx = u * w - 0.5, sty = v * h - 0.5;
  const fx = stx - Math.floor(stx), fy = sty - Math.floor(sty);
  const bx = Math.floor(stx), by = Math.floor(sty);
  const fetch = (x, y) => px[(Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))) * 4 + c];
  const s00 = fetch(bx, by), s10 = fetch(bx + 1, by);
  const s01 = fetch(bx, by + 1), s11 = fetch(bx + 1, by + 1);
  return (s00 * (1 - fx) + s10 * fx) * (1 - fy) + (s01 * (1 - fx) + s11 * fx) * fy;
}

/**
 * Trilinear sample of the mip chain at (u, v, lod) — mirrors textureLod
 * with LINEAR_MIPMAP_LINEAR: bilinear within the two bracketing levels,
 * mixed by the fractional lod. Lods past the smallest level clamp to it,
 * like the hardware.
 */
export function mirrorTrilinear(chain, u, v, lod) {
  const maxLod = chain.length - 1;
  const l = Math.min(Math.max(lod, 0), maxLod);
  const l0 = Math.floor(l), f = l - l0;
  const l1 = Math.min(l0 + 1, maxLod);
  const out = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const a = bilinearLevel(chain[l0], u, v, c);
    const b = bilinearLevel(chain[l1], u, v, c);
    out[c] = a * (1 - f) + b * f;
  }
  return out;
}

/**
 * One glow-tier sample at canvas UV (u, v), mirroring GLOW_FS: chromatic
 * offsets per channel (radial, sized in texels of the sampled mip) plus
 * the stipple gate. x/y are device px (bottom-first, like the mirror) for
 * the screen-space dot grid — gl_FragCoord.xy is (x+0.5, y+0.5).
 */
export function mirrorGlowSample(chain, gw, gh, u, v, x, y, { lod, stipple, chromaTexels }) {
  const texelX = Math.pow(2, lod) / gw, texelY = Math.pow(2, lod) / gh;
  const cox = (u - 0.5) * chromaTexels * texelX;
  const coy = (v - 0.5) * chromaTexels * texelY;
  const r = mirrorTrilinear(chain, u + cox, v + coy, lod)[0];
  const g = mirrorTrilinear(chain, u, v, lod)[1];
  const b = mirrorTrilinear(chain, u - cox, v - coy, lod)[2];
  const glow = [r, g, b];
  if (!(stipple > 0)) return glow;
  // Stipple gate: the same 16-bit-quantized integer hash as GLOW_FS on the
  // dot grid, so the mirror's dots land exactly where the GPU's do (up to
  // float rounding in the glow value itself).
  const gx = Math.floor((x + 0.5) / STIPPLE_PITCH);
  const gy = Math.floor((y + 0.5) / STIPPLE_PITCH);
  const h = Math.floor(ihash2(gx, gy) * 65536) / 65536;
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  const on = Math.min(1, lum * 2) >= h ? 1 : 0; // step(h, clamp(lum*2))
  const gate = 1 + (on - 1) * Math.min(1, Math.max(0, stipple)); // mix(1, on, stipple)
  return [r * gate, g * gate, b * gate];
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

/** Flow displacement vector for UV (u, v).
 *  No field: legacy hash, matching FEED_FS flowVec.
 *  Field: project-seed curl table, matching the shared sampler. */
export function mirrorFlowVec(u, v, field = null) {
  if (field) {
    // Late import keeps accum.mjs free of a cycle through the field builder.
    return sampleFlowField(field, u, v);
  }
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
  const wetOn = p.wetStep === 1 && p.wetVel;
  if (p.flowUv > 0 || wetOn) {
    fed = new Float64Array(n);
    const nearest = (u, v, c) => {
      const sx = Math.min(w - 1, Math.max(0, Math.floor(u * w)));
      const sy = Math.min(h - 1, Math.max(0, Math.floor(v * h)));
      return accum[(sy * w + sx) * 4 + c];
    };
    const wetVec = (u, v) => {
      if (!wetOn) return [0, 0];
      const field = p.wetVel;
      const gn = field.n;
      const gx = Math.max(0, Math.min(gn - 1.0001, u * (gn - 1)));
      const gy = Math.max(0, Math.min(gn - 1.0001, v * (gn - 1)));
      const i0 = gx | 0;
      const j0 = gy | 0;
      const tx = gx - i0;
      const ty = gy - j0;
      const i1 = Math.min(gn - 1, i0 + 1);
      const j1 = Math.min(gn - 1, j0 + 1);
      const at = (j, i, c) => field.rgba[(j * gn + i) * 4 + c] / 255;
      const s = (c) => (1 - tx) * (1 - ty) * at(j0, i0, c) + tx * (1 - ty) * at(j0, i1, c)
        + (1 - tx) * ty * at(j1, i0, c) + tx * ty * at(j1, i1, c);
      return [s(0) * 2 - 1, s(1) * 2 - 1];
    };
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const u = (x + 0.5) / w, v = (y + 0.5) / h;
        const [fx, fy] = p.flowUv > 0 ? mirrorFlowVec(u, v, p.flowField) : [0, 0];
        const [wx, wy] = wetVec(u, v);
        const tu = u + fx * p.flowUv + wx * (p.wetGain || 0);
        const tv = v + fy * p.flowUv + wy * (p.wetGain || 0);
        const o = (y * w + x) * 4;
        fed[o] = nearest(tu, tv, 0);
        fed[o + 1] = nearest(tu, tv, 1);
        fed[o + 2] = nearest(tu, tv, 2);
        fed[o + 3] = nearest(tu, tv, 3);
      }
    }
  }
  // #970 slice 3 — edge darkening + granulation, only on the wet path.
  // Paper height is the same 16-bit hash the glow stipple uses. Dry skips
  // this block, so the fade below is the old path.
  if (wetOn && p.wetMask && p.wetAmount > 0) {
    const mask = p.wetMask;
    const gn = mask.n;
    const amt = p.wetAmount;
    const at = (j, i) => mask.rgba[(j * gn + i) * 4] / 255;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const u = (x + 0.5) / w;
        const v = (y + 0.5) / h;
        const gx = Math.max(0, Math.min(gn - 1.0001, u * (gn - 1)));
        const gy = Math.max(0, Math.min(gn - 1.0001, v * (gn - 1)));
        const i0 = gx | 0;
        const j0 = gy | 0;
        const tx = gx - i0;
        const ty = gy - j0;
        const i1 = Math.min(gn - 1, i0 + 1);
        const j1 = Math.min(gn - 1, j0 + 1);
        const wet = (1 - tx) * (1 - ty) * at(j0, i0) + tx * (1 - ty) * at(j0, i1)
          + (1 - tx) * ty * at(j1, i0) + tx * ty * at(j1, i1);
        const edge = wet * (1 - wet) * 4;
        let hh = Math.imul((x * 1664525 + y) ^ 1013904223, 2246822519) >>> 16;
        const paper = (hh & 65535) / 65535;
        const o = (y * w + x) * 4;
        const dark = 1 - 0.45 * edge * amt;
        // Multiplicative granulation (mirrors FADE_WET_FS): additive grain
        // would pump a noise floor into the feedback loop.
        const grain = 1 + (paper - 0.5) * 0.5 * (1 - wet) * amt;
        fed[o] = fed[o] * dark * grain;
        fed[o + 1] = fed[o + 1] * dark * grain;
        fed[o + 2] = fed[o + 2] * dark * grain;
      }
    }
  }
  // 2. fade (+ Phase A feedback transform). The feedback textures are
  // NEAREST + CLAMP_TO_EDGE, so the mirror samples the nearest texel:
  // sx = clamp(floor(u * w), 0, w - 1). At tunnel/prism = 0 the transform
  // is skipped and this is the exact old path.
  const faded = new Float64Array(n);
  const feedback = p.tunnelZoom !== 1 || p.tunnelSpin !== 0 || p.prismUv !== 0;
  // #287 fade-to-paper: the fade lerps toward the palette background, not
  // black. With the default black bg this is exactly the old `* keep`
  // (0 * (1 - keep) = 0), so the legacy fade hashes can't move.
  const bg0 = p.bg[0], bg1 = p.bg[1], bg2 = p.bg[2];
  const fadeTo = (c, b) => b * (1 - p.keep) + c * p.keep;
  if (!feedback) {
    for (let i = 0; i < n; i += 4) {
      faded[i] = fadeTo(fed[i], bg0);
      faded[i + 1] = fadeTo(fed[i + 1], bg1);
      faded[i + 2] = fadeTo(fed[i + 2], bg2);
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
        faded[o] = fadeTo(r, bg0);
        faded[o + 1] = fadeTo(g, bg1);
        faded[o + 2] = fadeTo(b, bg2);
        faded[o + 3] = a;
      }
    }
  }
  // 3. (#308: removed) — no blur-over-time; the incoming frame lands sharp.
  const fIn = frameIn;
  // 4. over — mirrors OVER_FS exactly, including the #560 comet head-bright
  // (u_headBoost on the incoming frame's rgb; 1.0 = off, bit-identical).
  const headBoost = p.comet ? COMET_HEAD_BOOST : 1.0;
  const comp = new Float64Array(n);
  const mixWet = wetOn && p.wetMask && p.wetAmount > 0;
  for (let i = 0; i < n; i += 4) {
    const sa = fIn[i + 3];
    const sr = fIn[i] * headBoost;
    const sg = fIn[i + 1] * headBoost;
    const sb = fIn[i + 2] * headBoost;
    const dr = faded[i];
    const dg = faded[i + 1];
    const db = faded[i + 2];
    const da = faded[i + 3];
    const or = sr + dr * (1 - sa);
    const og = sg + dg * (1 - sa);
    const ob = sb + db * (1 - sa);
    const oa = sa + da * (1 - sa);
    if (!mixWet || da <= 0.02) {
      comp[i] = or; comp[i + 1] = og; comp[i + 2] = ob; comp[i + 3] = oa;
      continue;
    }
    const px = (i / 4) % w;
    const py = (i / 4 / w) | 0;
    const u = (px + 0.5) / w;
    const v = (py + 0.5) / h;
    const mask = p.wetMask;
    const gn = mask.n;
    const gx = Math.max(0, Math.min(gn - 1.0001, u * (gn - 1)));
    const gy = Math.max(0, Math.min(gn - 1.0001, v * (gn - 1)));
    const i0 = gx | 0;
    const j0 = gy | 0;
    const tx = gx - i0;
    const ty = gy - j0;
    const i1 = Math.min(gn - 1, i0 + 1);
    const j1 = Math.min(gn - 1, j0 + 1);
    const at = (j, ii) => mask.rgba[(j * gn + ii) * 4] / 255;
    const wet = ((1 - tx) * (1 - ty) * at(j0, i0) + tx * (1 - ty) * at(j0, i1)
      + (1 - tx) * ty * at(j1, i0) + tx * ty * at(j1, i1)) * p.wetAmount;
    const sc = [sr, sg, sb].map((c) => Math.min(1, c / Math.max(sa, 1e-4)));
    const dc = [dr, dg, db].map((c) => Math.min(1, c / Math.max(da, 1e-4)));
    const denom = Math.max(sa + da, 1e-4);
    const pigment = sc.map((c, k) => (c * sa + dc[k] * da) / denom);
    comp[i] = (1 - wet) * or + wet * pigment[0] * oa;
    comp[i + 1] = (1 - wet) * og + wet * pigment[1] * oa;
    comp[i + 2] = (1 - wet) * ob + wet * pigment[2] * oa;
    comp[i + 3] = oa;
  }
  if (p.optics <= 0) return comp;
  // 5/6. glow (#308): mip-chain bloom + stipple diffusion + chromatic
  // offset. One shared downsampled mip chain; two tiers read it — the
  // tight bloom and the wider warm halation.
  const { px: down, w: gw, h: gh } = boxDownsample(comp, w, h);
  const chain = mirrorMipChain(down, gw, gh);
  const out = new Float64Array(n);
  const [tr, tg, tb] = p.halationTint;
  const glowArgs = (lod) => ({ lod, stipple: p.stipple, chromaTexels: p.chromaTexels });
  const g1args = glowArgs(p.bloomLod), g2args = glowArgs(p.halationLod);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w, v = (y + 0.5) / h;
      const o = (y * w + x) * 4;
      const g1 = mirrorGlowSample(chain, gw, gh, u, v, x, y, g1args);
      const g2 = mirrorGlowSample(chain, gw, gh, u, v, x, y, g2args);
      out[o] = Math.min(1, comp[o] + p.bloomAmount * g1[0] + p.halationAmount * tr * g2[0]);
      out[o + 1] = Math.min(1, comp[o + 1] + p.bloomAmount * g1[1] + p.halationAmount * tg * g2[1]);
      out[o + 2] = Math.min(1, comp[o + 2] + p.bloomAmount * g1[2] + p.halationAmount * tb * g2[2]);
      out[o + 3] = comp[o + 3]; // the glow lifts light only; the buffer stays opaque
    }
  }
  return out;
}

// --- GPU object ------------------------------------------------------------

/**
 * @param {WebGL2RenderingContext} gl
 * @param {object} bridge the JS↔GL bridge (owns the feedback ping-pong)
 * @param {object} size { width, height } canvas px — the LOGICAL size the
 *   feedback pair runs at. opts.resDiv (default 1): the incoming frame is
 *   resDiv× larger per axis (live retina path: pass the dprScale the bridge
 *   was resized with); step() resamples the frame down to the pair's size
 *   before the recipe. Stills/export paths pass resDiv 1 (frame already
 *   logical-sized) and skip the resample.
 */
export function createAccum(gl, bridge, { width, height, resDiv = 1 }) {
  if (bridge.lost) throw new Error('[accum] context lost — recreate after restore');
  let W = Math.max(4, Math.round(width));
  let H = Math.max(4, Math.round(height));
  // Resolution divisor of the incoming frame vs the feedback pair (#309).
  const RD = Math.max(1, resDiv);

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
      for (const u of ['u_src', 'u_dst', 'u_headBoost', 'u_keep', 'u_bg', 'u_tunnelZoom', 'u_tunnelSpin', 'u_prism',
        'u_flow', 'u_flowField', 'u_flowShared',
        'u_t0', 'u_t1', 'u_t2', 'u_t3', 'u_w', 'u_ntaps',
        'u_base', 'u_glow', 'u_glowSize', 'u_lod', 'u_stipple', 'u_chromaTexels', 'u_amount', 'u_tint',
        'u_srcSize']) {
        L[u] = U(u);
      }
      locs[name] = L;
    }
  };
  build();

  // #970 wet variants. Not in ACCUM_PROGRAMS — same passes, dry path never
  // uses them, so the cost-tier list stays the 8 ACCUM ids.
  const wetProgs = {};
  const wetLocs = {};
  const buildWet = (name, fs, file, uniforms) => {
    wetProgs[name] = buildProgramChecked(gl, FULL_VS, fs, {
      name: `accum-${name}`,
      vsFile: 'accum.mjs:FULL_VS',
      fsFile: file,
    });
    auditProgramChecked(gl, wetProgs[name], uniforms, { name: `accum-${name}`, file });
    const L = {};
    for (const u of uniforms) L[u] = gl.getUniformLocation(wetProgs[name], u);
    wetLocs[name] = L;
  };
  buildWet('feedWet', FEED_WET_FS, 'accum.mjs:FEED_WET_FS', ['u_src', 'u_flowField', 'u_flow', 'u_flowShared', 'u_wetVel', 'u_wetGain']);
  buildWet('fadeWet', FADE_WET_FS, 'accum.mjs:FADE_WET_FS', ['u_src', 'u_keep', 'u_bg', 'u_tunnelZoom', 'u_tunnelSpin', 'u_prism', 'u_wetMask', 'u_wetAmount']);
  buildWet('glowWet', GLOW_WET_FS, 'accum.mjs:GLOW_WET_FS', ['u_base', 'u_glow', 'u_glowSize', 'u_lod', 'u_stipple', 'u_chromaTexels', 'u_amount', 'u_tint', 'u_wetMask', 'u_wetAmount']);
  buildWet('overWet', OVER_WET_FS, 'accum.mjs:OVER_WET_FS', ['u_src', 'u_dst', 'u_headBoost', 'u_wetMask', 'u_wetAmount']);

  // Fullscreen triangle; FULL_VS maps a_pos via v_cuv = a_pos*0.5+0.5.
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  // Bridge-owned feedback ping-pong (the ACCUM buffer itself) — runs at
  // logical size (div = RD), the trail system of #309.
  let L = bridge.layer(ACCUM_LAYER_ID, { div: RD });
  // Accum-owned scratch: frame resample + the mipmapped glow target + the
  // B3 echo mix target. (The old full-res and quarter-res blur scratch is
  // gone with the blur passes — #308.)
  let scratch = null;
  const allocScratch = () => {
    const gw = Math.max(1, Math.floor(W / GLOW_DIV));
    const gh = Math.max(1, Math.floor(H / GLOW_DIV));
    scratch = {
      rs: makeTarget(gl, W, H), // #309: frame -> pair-size resample target
      em: makeTarget(gl, W, H), // B3 echo mix target
      gm: makeGlowTarget(gl, gw, gh), // mip-chain bloom source (RGBA8)
      gw, gh,
    };
  };
  allocScratch();

  // B3 echo ring: accum-owned targets holding past frames (at the pair's
  // logical size — the echo taps, weights, and mix are untouched by #309).
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

  // Project-seed curl table. Static. Rebuilt only when the seed changes.
  // 1x1 zero keeps the sampler valid when the legacy hash path is on.
  const flowTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, flowTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([128, 128, 0, 255]));
  gl.bindTexture(gl.TEXTURE_2D, null);
  let flowKey = null;
  const ensureFlow = (field) => {
    if (!field || flowKey === field.seed) return;
    const n = field.n;
    const rgba = new Uint8Array(n * n * 4);
    const pack = (v) => Math.max(0, Math.min(255, Math.round((v * 0.5 + 0.5) * 255)));
    for (let i = 0; i < n * n; i++) {
      rgba[i * 4] = pack(field.data[i * 2]);
      rgba[i * 4 + 1] = pack(field.data[i * 2 + 1]);
      rgba[i * 4 + 3] = 255;
    }
    gl.bindTexture(gl.TEXTURE_2D, flowTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, n, n, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
    gl.bindTexture(gl.TEXTURE_2D, null);
    flowKey = field.seed;
  };

  // #970 velocity + wet mask. LINEAR so the 64×64 field bilinear-upsamples.
  // Uploaded only on a wet step; the dry path does not bind them.
  const makeLinear = () => {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([128, 128, 0, 255]));
    gl.bindTexture(gl.TEXTURE_2D, null);
    return tex;
  };
  const wetVelTex = makeLinear();
  const wetMaskTex = makeLinear();
  const uploadPacked = (tex, packed) => {
    if (!packed) return;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, packed.n, packed.n, 0, gl.RGBA, gl.UNSIGNED_BYTE, packed.rgba);
    gl.bindTexture(gl.TEXTURE_2D, null);
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

  function passWet(name, writeT, setup) {
    if (bridge.lost) throw new Error('[accum] context lost — chain paused');
    gl.bindFramebuffer(gl.FRAMEBUFFER, writeT.fb);
    gl.viewport(0, 0, writeT.w, writeT.h);
    gl.disable(gl.BLEND);
    gl.useProgram(wetProgs[name]);
    setup(wetLocs[name], bindTex);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disableVertexAttribArray(0);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  /** Build the glow target's mip chain after the DOWN pass wrote level 0. */
  function buildGlowMips() {
    // The texture is attached to scratch.gm.fb: unbind the framebuffer
    // first (sampling a texture from its own attached FBO is feedback),
    // then the hardware builds the chain.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, scratch.gm.tex);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  const hexToRgb = hexToRgb01;

  return {
    version: ACCUM_VERSION,

    /** Clear the feedback buffer to the background color (opaque). */
    begin(background = '#000000') {
      if (bridge.lost) throw new Error('[accum] context lost — chain paused');
      L = bridge.layer(ACCUM_LAYER_ID, { div: RD });
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
     * @param {WebGLTexture} frameTex 16F premultiplied frame (resDiv× the
     *   pair's size when resDiv > 1; pair-sized otherwise)
     * @param {object} params from accumRecipeParams()
     * @param {object} [frameSize] { width, height } actual frame px (only
     *   needed when resDiv > 1 and the frame isn't exactly W*RD × H*RD,
     *   e.g. fractional dprScale rounding)
     * @returns the target holding the current accum image (bridge-owned)
     */
    step(frameTex, params, frameSize) {
      const p = params;
      assertRecipeFinite(p);
      // Drain stale errors first so the post-step check below only reflects
      // this step's own passes (see drainGlErrors).
      drainGlErrors(gl);
      // #309: the feedback pair runs at logical size. A backing-store-sized
      // frame (live retina path, RD > 1) is resampled down to the pair's
      // size first — manual bilinear, exact for any dprScale. The echo ring,
      // blur, and composite all run on the pair-sized frame (echo taps,
      // weights, and the mix shader are untouched).
      let frameIn = frameTex;
      if (RD > 1) {
        const fw = frameSize?.width || W * RD;
        const fh = frameSize?.height || H * RD;
        pass('resample', scratch.rs, (u, bind) => {
          gl.uniform1i(u.u_src, bind(0, frameTex));
          gl.uniform2f(u.u_srcSize, fw, fh);
        });
        frameIn = scratch.rs.tex;
      }
      // The live frame (post-resample) pushed into the ring: taps hold
      // past FRAMES, never the echo mix.
      const ringSrc = frameIn;
      // 0. echoes (B3) — mix the live frame with the ring's past taps
      // FIRST, then push the incoming frame: K targets hold exactly K
      // past-frame taps (delays 1..K). Skipped at echoTaps = 0: the live
      // frame feeds the composite directly (exact old behavior).
      if (p.echoTaps > 0) {
        ensureEcho(p.echoTaps);
        const K = echoRing.length;
        const taps = Math.min(echoCount, p.echoTaps);
        if (taps > 0) {
          pass('echo', scratch.em, (u, bind) => {
            gl.uniform1i(u.u_src, bind(0, frameIn));
            for (let i = 0; i < 4; i++) {
              // Tap i = frame from i+1 steps ago (ring holds past frames only).
              const slot = i < taps
                ? echoRing[(echoHead - 1 - i + 2 * K) % K].tex
                : frameIn; // unused sampler: any valid texture
              gl.uniform1i(u[`u_t${i}`], bind(1 + i, slot));
            }
            const wv = p.echoWeights;
            gl.uniform4f(u.u_w, wv[0] || 0, wv[1] || 0, wv[2] || 0, wv[3] || 0);
            gl.uniform1i(u.u_ntaps, taps);
          });
          frameIn = scratch.em.tex;
        }
        pass('copy', echoRing[echoHead], (u, bind) => {
          gl.uniform1i(u.u_src, bind(0, ringSrc));
        });
        echoHead = (echoHead + 1) % K;
        echoCount = Math.min(echoCount + 1, K);
      }
      // 1. feed (B2). Skipped at flow = 0 and wetStep = 0: the buffer is
      // exactly the old one. Wet adds an offset on another program and
      // does not bind the velocity texture on the dry path.
      let write = other();
      const wetOn = p.wetStep === 1 && p.wetVel && p.wetMask;
      if (p.flowUv > 0 || wetOn) {
        if (p.flowUv > 0) ensureFlow(p.flowField);
        if (wetOn) {
          uploadPacked(wetVelTex, p.wetVel);
          uploadPacked(wetMaskTex, p.wetMask);
          passWet('feedWet', write, (u, bind) => {
            gl.uniform1i(u.u_src, bind(0, cur.tex));
            gl.uniform1i(u.u_flowField, bind(1, flowTex));
            gl.uniform1f(u.u_flow, p.flowUv);
            gl.uniform1f(u.u_flowShared, p.flowField ? 1 : 0);
            gl.uniform1i(u.u_wetVel, bind(2, wetVelTex));
            gl.uniform1f(u.u_wetGain, p.wetGain);
          });
        } else {
          pass('feed', write, (u, bind) => {
            gl.uniform1i(u.u_src, bind(0, cur.tex));
            gl.uniform1i(u.u_flowField, bind(1, flowTex));
            gl.uniform1f(u.u_flow, p.flowUv);
            gl.uniform1f(u.u_flowShared, p.flowField ? 1 : 0);
          });
        }
        cur = write;
        write = other();
      }
      // 2. fade, or Leave: copy the held stamps. Clear is the only erase.
      // Wet fade is a different program: edge darkening + paper granulation.
      if (p.leave && p.keep >= 1) {
        pass('copy', write, (u, bind) => {
          gl.uniform1i(u.u_src, bind(0, cur.tex));
        });
      } else if (wetOn) {
        passWet('fadeWet', write, (u, bind) => {
          gl.uniform1i(u.u_src, bind(0, cur.tex));
          gl.uniform1f(u.u_keep, p.keep);
          gl.uniform3f(u.u_bg, p.bg[0], p.bg[1], p.bg[2]);
          gl.uniform1f(u.u_tunnelZoom, p.tunnelZoom);
          gl.uniform1f(u.u_tunnelSpin, p.tunnelSpin);
          gl.uniform1f(u.u_prism, p.prismUv);
          gl.uniform1i(u.u_wetMask, bind(2, wetMaskTex));
          gl.uniform1f(u.u_wetAmount, p.wetAmount);
        });
      } else {
        pass('fade', write, (u, bind) => {
          gl.uniform1i(u.u_src, bind(0, cur.tex));
          gl.uniform1f(u.u_keep, p.keep);
          gl.uniform3f(u.u_bg, p.bg[0], p.bg[1], p.bg[2]);
          gl.uniform1f(u.u_tunnelZoom, p.tunnelZoom);
          gl.uniform1f(u.u_tunnelSpin, p.tunnelSpin);
          gl.uniform1f(u.u_prism, p.prismUv);
        });
      }
      cur = write;
      // 3. (#308: removed) — no blur-over-time; the frame lands sharp.
      // 4. over. Wet uses a different program so two pigments mix instead
      // of stacking. Dry is the old source-over, texture unbound.
      write = other();
      if (wetOn) {
        passWet('overWet', write, (u, bind) => {
          gl.uniform1i(u.u_src, bind(0, frameIn));
          gl.uniform1i(u.u_dst, bind(1, cur.tex));
          gl.uniform1f(u.u_headBoost, p.comet ? COMET_HEAD_BOOST : 1.0);
          gl.uniform1i(u.u_wetMask, bind(2, wetMaskTex));
          gl.uniform1f(u.u_wetAmount, p.wetAmount);
        });
      } else {
        pass('over', write, (u, bind) => {
          gl.uniform1i(u.u_src, bind(0, frameIn));
          gl.uniform1i(u.u_dst, bind(1, cur.tex));
          gl.uniform1f(u.u_headBoost, p.comet ? COMET_HEAD_BOOST : 1.0);
        });
      }
      cur = write;
      // 5/6. glow (#308): mip-chain bloom + stipple diffusion + chromatic
      // offset. No gaussian anywhere. One shared downsampled mip chain;
      // two tiers read it — the tight bloom and the wider warm halation.
      if (p.optics > 0) {
        pass('down', scratch.gm, (u, bind) => {
          gl.uniform1i(u.u_src, bind(0, cur.tex));
        });
        buildGlowMips();
        const addGlow = (lod, amount, tint) => {
          write = other();
          const glowPass = wetOn ? passWet : pass;
          const glowName = wetOn ? 'glowWet' : 'glow';
          glowPass(glowName, write, (u, bind) => {
            gl.uniform1i(u.u_base, bind(0, cur.tex));
            gl.uniform1i(u.u_glow, bind(1, scratch.gm.tex));
            gl.uniform2f(u.u_glowSize, scratch.gw, scratch.gh);
            gl.uniform1f(u.u_lod, lod);
            gl.uniform1f(u.u_stipple, p.stipple);
            gl.uniform1f(u.u_chromaTexels, p.chromaTexels);
            gl.uniform1f(u.u_amount, amount);
            gl.uniform3f(u.u_tint, tint[0], tint[1], tint[2]);
            if (wetOn) {
              gl.uniform1i(u.u_wetMask, bind(2, wetMaskTex));
              gl.uniform1f(u.u_wetAmount, p.wetAmount);
            }
          });
          cur = write;
        };
        addGlow(p.bloomLod, p.bloomAmount, [1, 1, 1]);
        addGlow(p.halationLod, p.halationAmount, p.halationTint);
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
      for (const t of [scratch.rs, scratch.em, scratch.gm]) deleteTarget(gl, t);
      allocScratch();
      freeEcho(); // B3: ring targets are sized to the canvas
      // Bridge-owned feedback targets resize via bridge.resize (caller-owned).
      L = bridge.layer(ACCUM_LAYER_ID, { div: RD });
      cur = L.t0;
    },

    dispose() {
      for (const t of [scratch.rs, scratch.em, scratch.gm]) deleteTarget(gl, t);
      scratch = null;
      freeEcho();
      for (const p of Object.values(progs)) gl.deleteProgram(p);
      for (const prog of Object.values(wetProgs)) gl.deleteProgram(prog);
      gl.deleteTexture(wetVelTex);
      gl.deleteTexture(wetMaskTex);
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
  glow: GLOW_FS,
  resample: RESAMPLE_FS,
});
