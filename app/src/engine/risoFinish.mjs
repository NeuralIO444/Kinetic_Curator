// risoFinish.mjs — RISO OVERPRINT finish (#2008): a print pass over the finished frame.
//
// Matt's ruling (2026-11-07): the overprint is a STAGE-WIDE FINISH over the whole
// finished frame — two ink passes, a small ruled misregistration, overlap
// multiplying like ink on paper. This module is the finish's law, in two mirrors
// kept equal by the selfcheck (the engraveBody pattern):
//   - applyRisoFinish: the CPU reference over straight RGBA bytes (post-resolve
//     display bytes), the determinism contract's home.
//   - RISO_GLSL: the GPU pass the FX chain runs (gl/effects/fxShaders.mjs registers
//     it as the template effect 'riso'), premultiplied-chain discipline like grain
//     and dither: un-premultiply, print, re-premultiply, alpha untouched.
//
// PLACEMENT (the spec's flagged question (b), settled by survey — see
// STAGING-REPORT-2008.md): the finish is an FX-stratum kind in the GRAIN FAMILY
// (fx/fxFilters.js), exactly where grain and dither already live. The renderer
// splits grain-family kinds out of the FX chain and runs them POST-COMPOSITE over
// the finished frame (renderer.mjs applyFinishChains; #520 Phase 2) — so the pass
// speaks for no stratum, reorders nothing, and joins nothing: it prints over the
// composite the strata already made. That is the #2038 strata law honoured, not
// negotiated with — no Look-level state and no new chip were needed.
//
// THE MATH: pass 1 is the frame itself. Pass 2 is the frame sampled at the
// misregistration offset (edge-clamped), and where the two passes overlap the ink
// MULTIPLIES: out = mix(c, c * c2, amount) per channel in straight space. At
// amount 0 the mix factor is exactly 1 per channel and the output is the input,
// BYTE-IDENTICAL — the standing byte-identity-at-zero discipline. The finish is a
// pure function of (frame, amount, shift): same inputs, same bytes, at any detent.

/** Misregistration detents, in pixels at the write target's resolution. The dial
 *  steps through these and nothing between them (the DISH LIFE detent tradition). */
export const RISO_SHIFT_DETENTS = Object.freeze([0, 1, 2, 3, 4]);
/** Misregistration direction, unit sign per axis: down-right, the press drift. */
export const RISO_SHIFT_DIR = Object.freeze({ x: 1, y: 1 });
/** Amount detent step (the FX param's step — the dial's honest grain). */
export const RISO_AMOUNT_STEP = 0.05;
/** Defaults: the finish ships OFF (amount 0); shift rests at the middle detent so
 *  raising the amount alone shows the ruled misregistration. */
export const RISO_AMOUNT_DEFAULT = 0;
export const RISO_SHIFT_DEFAULT = 2;

/** Sanitize finish params: amount clamped 0..1, shift snapped to a detent. Junk → defaults. */
export function sanitizeRisoParams(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const amount = Number.isFinite(Number(src.amount))
    ? Math.min(1, Math.max(0, Number(src.amount)))
    : RISO_AMOUNT_DEFAULT;
  let shift = RISO_SHIFT_DEFAULT;
  if (Number.isFinite(Number(src.shift))) {
    const v = Number(src.shift);
    shift = RISO_SHIFT_DETENTS.reduce(
      (best, d) => (Math.abs(d - v) < Math.abs(best - v) ? d : best),
      RISO_SHIFT_DETENTS[0],
    );
  }
  return { amount, shift };
}

/**
 * The CPU reference: print `pixels` (straight RGBA bytes, row-major, top-first —
 * the resolve/readback layout) with the riso finish and return a NEW Uint8Array.
 * Amount 0 returns a byte-identical copy and never samples the second pass.
 */
export function applyRisoFinish(pixels, w, h, rawParams) {
  const { amount, shift } = sanitizeRisoParams(rawParams);
  const out = new Uint8Array(pixels);
  if (!(amount > 0) || !(w > 0) || !(h > 0)) return out;
  const dx = RISO_SHIFT_DIR.x * shift;
  const dy = RISO_SHIFT_DIR.y * shift;
  for (let y = 0; y < h; y++) {
    const sy = Math.min(h - 1, Math.max(0, y + dy));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(w - 1, Math.max(0, x + dx));
      const o = (y * w + x) * 4;
      const so = (sy * w + sx) * 4;
      const a2 = pixels[so + 3];
      // Straight-space multiply (the input is display bytes: rgb is the colour,
      // a is the coverage); a transparent second pass carries no ink (factor 1).
      for (let ch = 0; ch < 3; ch++) {
        const c = pixels[o + ch] / 255;
        const c2 = a2 > 0 ? pixels[so + ch] / 255 : 1;
        const printed = c * (1 - amount + amount * c2);
        out[o + ch] = Math.round(Math.min(1, Math.max(0, printed)) * 255);
      }
      out[o + 3] = pixels[o + 3];
    }
  }
  return out;
}

/**
 * The GPU mirror. Uniforms follow the template contract (u_tex, u_res, u_amount,
 * u_shift). Premultiplied in/out: the second pass is sampled from the same chain
 * texture at the misregistered uv (texture edge clamp is the frame's own wrap).
 * At u_amount 0 the branch returns the source untouched — byte-identical, not
 * merely close (the dither/shaders discipline).
 */
export const RISO_GLSL = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform float u_amount;
uniform float u_shift;
in vec2 v_cuv;
out vec4 o;
void main() {
  vec4 s = texture(u_tex, v_cuv);
  float amt = clamp(u_amount, 0.0, 1.0);
  if (amt <= 0.0) {
    o = s;
    return;
  }
  vec2 off = vec2(${RISO_SHIFT_DIR.x.toFixed(1)}, ${RISO_SHIFT_DIR.y.toFixed(1)}) * u_shift / max(u_res, vec2(1.0));
  vec4 s2 = texture(u_tex, v_cuv + off);
  vec3 c = s.a > 1e-6 ? s.rgb / s.a : vec3(0.0);
  vec3 c2 = s2.a > 1e-6 ? s2.rgb / s2.a : vec3(1.0);
  vec3 printed = c * mix(vec3(1.0), c2, amt);
  o = vec4(clamp(printed, 0.0, 1.0) * s.a, s.a);
}
`;
