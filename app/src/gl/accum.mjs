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
 *   1. Fade/decay:  accum.rgb *= keep            (keep = fade, 0..0.99)
 *   2. Blur-over-time (#169): the incoming frame is blurred with a small
 *      separable gaussian (sigma = 5px * optics) BEFORE compositing, so old
 *      marks go soft instead of merely transparent.
 *   3. Composite:    accum = frame OVER accum      (premultiplied source-over)
 *   4. Bloom (#169): downsample accum to 1/4 (4x4 box) -> separable gaussian
 *      blur -> add back: accum.rgb += bloomAmount * blurred.
 *   5. Halation (#169): the same downsampled buffer blurred wider, added
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

import { FULL_VS } from './shaders.mjs';
import { buildProgramChecked } from './debug/diagnostics.mjs';

export const ACCUM_VERSION = 1;

/** Bridge layer id owning the feedback ping-pong (bridge-owned textures). */
export const ACCUM_LAYER_ID = '__accum__';

/** Bloom scratch resolution: 1/4 of the canvas per axis. */
export const BLOOM_DIV = 4;

const clamp01 = (v) => Math.min(1, Math.max(0, Number(v) || 0));

/**
 * Map UI params to per-frame recipe numbers. Pure — unit-tested in Node.
 * @param {object} p { fade: 0..0.99, optics: 0..1 }
 */
export function accumRecipeParams({ fade = 0.88, optics = 0 } = {}) {
  const keep = Math.min(0.99, Math.max(0, Number(fade)));
  const o = clamp01(optics);
  return {
    keep,
    optics: o,
    frameBlurSigma: 5.0 * o, // device px at full res (#169 blur-over-time)
    bloomAmount: 0.55 * o,
    bloomSigma: 9.0 * (0.5 + o), // device px at quarter res
    halationAmount: 0.45 * o,
    halationSigma: 22.0 * (0.5 + o), // wider than bloom, per #169
    halationTint: [1.0, 0.6, 0.35], // red/warm bias, per #169
  };
}

/** Sanitize the optics amount for the scene contract (additive field). */
export function sanitizeAccumOptics(v) {
  return clamp01(v);
}

// --- GLSL -----------------------------------------------------------------

const FADE_FS = `#version 300 es
precision highp float;
uniform sampler2D u_src;
uniform float u_keep;
in vec2 v_cuv;
out vec4 o;
void main() {
  vec4 c = texture(u_src, v_cuv);
  o = vec4(c.rgb * u_keep, c.a);
}`;

const OVER_FS = `#version 300 es
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
const DOWN_FS = `#version 300 es
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
const BLUR_FS = `#version 300 es
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

const ADD_FS = `#version 300 es
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
 * Float64 mirror of one recipe step. accum/frame are Float64Array(w*h*4),
 * premultiplied, bottom-first. Returns a new Float64Array.
 */
export function mirrorAccumStep({ accum, frame, w, h, params }) {
  const p = params;
  const n = w * h * 4;
  // 1. fade
  const faded = new Float64Array(n);
  for (let i = 0; i < n; i += 4) {
    faded[i] = accum[i] * p.keep;
    faded[i + 1] = accum[i + 1] * p.keep;
    faded[i + 2] = accum[i + 2] * p.keep;
    faded[i + 3] = accum[i + 3];
  }
  // 2. blur-over-time on the incoming frame
  const fIn = gaussBlur(frame, w, h, p.frameBlurSigma);
  // 3. over
  const comp = new Float64Array(n);
  for (let i = 0; i < n; i += 4) {
    const sa = fIn[i + 3];
    comp[i] = fIn[i] + faded[i] * (1 - sa);
    comp[i + 1] = fIn[i + 1] + faded[i + 1] * (1 - sa);
    comp[i + 2] = fIn[i + 2] + faded[i + 2] * (1 - sa);
    comp[i + 3] = sa + faded[i + 3] * (1 - sa);
  }
  if (p.optics <= 0) return comp;
  // 4/5. bloom + halation from the same downsampled buffer
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
    const defs = {
      fade: FADE_FS, over: OVER_FS, down: DOWN_FS, blur: BLUR_FS, add: ADD_FS,
    };
    for (const [name, fs] of Object.entries(defs)) {
      progs[name] = buildProgramChecked(gl, FULL_VS, fs, {
        name: `accum-${name}`,
        vsFile: 'accum.mjs:FULL_VS',
        fsFile: `accum.mjs:${name.toUpperCase()}_FS`,
      });
      const L = {};
      const U = (n) => gl.getUniformLocation(progs[name], n);
      for (const u of ['u_src', 'u_dst', 'u_keep', 'u_texel', 'u_sigma', 'u_vertical',
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
      bd: makeTarget(gl, bw, bh), bs0: makeTarget(gl, bw, bh), bs1: makeTarget(gl, bw, bh),
      bw, bh,
    };
  };
  allocScratch();

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
      // 1. fade
      let write = other();
      pass('fade', write, (u, bind) => {
        gl.uniform1i(u.u_src, bind(0, cur.tex));
        gl.uniform1f(u.u_keep, p.keep);
      });
      cur = write;
      // 2. blur-over-time on the incoming frame
      let frameIn = frameTex;
      if (p.optics > 0 && p.frameBlurSigma > 1e-3) {
        const blurred = blurInto(frameTex, scratch.fs0, p.frameBlurSigma, scratch.fs1);
        frameIn = blurred.tex;
      }
      // 3. over
      write = other();
      pass('over', write, (u, bind) => {
        gl.uniform1i(u.u_src, bind(0, frameIn));
        gl.uniform1i(u.u_dst, bind(1, cur.tex));
      });
      cur = write;
      // 4/5. bloom + halation (no-ops when optics = 0)
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
      for (const t of [scratch.fs0, scratch.fs1, scratch.bd, scratch.bs0, scratch.bs1]) deleteTarget(gl, t);
      allocScratch();
      // Bridge-owned feedback targets resize via bridge.resize (caller-owned).
      L = bridge.layer(ACCUM_LAYER_ID);
      cur = L.t0;
    },

    dispose() {
      for (const t of [scratch.fs0, scratch.fs1, scratch.bd, scratch.bs0, scratch.bs1]) deleteTarget(gl, t);
      scratch = null;
      for (const p of Object.values(progs)) gl.deleteProgram(p);
      gl.deleteBuffer(vbo);
      // Bridge-owned feedback targets die with bridge.dispose().
    },
  };
}
