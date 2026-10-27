// contactShadow.mjs — #1183 effect 2: the soft contact shadow (design: docs/design/contact-shadow.md).
//
// Each mark casts a soft shadow onto what lies beneath it, so the marks read as RESTING on the ground. Matt's
// decisions (2026-10-12):
//   1. direction  — away from the CHIAROSCURO sun (#594) when it is on; straight under the mark when it is off
//   2. control    — one SHADOW knob per content layer (layoutParams.groundShadow, 0..1, default 0)
//   3. falls on   — everything below the layer in the stack (it is laid over the running composite)
//   4. needs ground — only when a visible PATTERN layer sits below (sceneContract decides; key absent otherwise)
//   5. colour     — the active palette's darkest swatch, laid over what is beneath at the knob's strength
//   6. governor   — cost tier 2: shed after the tier-1 extras, as one piece (sceneContract omits it then)
//
// Passes, per shadowed layer (all inside the renderer's existing per-layer composite step):
//   1. SILHOUETTE (half size): the layer's alpha, box-filtered 2x2, sampled where the light came from, times its matte.
//   2. BLUR X     (half size): 9 linear taps.
//   3. BLUR Y     (half size): 9 linear taps.
//   4. LAY DOWN   (full size): the blurred silhouette, upscaled by the hardware, laid over the running composite
//                              in the shadow colour (premultiplied OVER). The marks are composited on top after.
// Off (no `shadow` key on the layer) runs none of it: the frame is pixel-identical to before.
//
// Pure helpers (no GL) are exported for the selfcheck and for anyone mirroring the maths on the CPU.

/** How high a mark sits above the ground, in scene units: sets how far a low sun throws the shadow. */
export const SHADOW_LIFT = 12;
/** The longest throw, in scene units, however low the sun. */
export const SHADOW_MAX_OFFSET = 40;
/** Softness: the blur's sigma in scene units. Tuned by eye at review (decision 2). */
export const SHADOW_SOFT = 7;
/** Knob 1 lays the shadow at this opacity (a full-strength silhouette never paints a solid block). */
export const SHADOW_MAX_OPACITY = 0.8;

const clamp01 = (v) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/** sRGB relative luminance of a #rrggbb hex (0..1), or NaN when it is not a hex colour. */
export function hexLuminance(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? '').trim());
  if (!m) return NaN;
  const n = parseInt(m[1], 16);
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}

/** The palette's darkest swatch (lowest luminance; first wins a tie), lower-cased; '#000000' when there is none. */
export function darkestSwatch(palette) {
  const sw = palette && Array.isArray(palette.swatches) ? palette.swatches : [];
  let best = null;
  let bestL = Infinity;
  for (const c of sw) {
    const L = hexLuminance(c);
    if (Number.isFinite(L) && L < bestL) {
      bestL = L;
      best = String(c).trim().toLowerCase();
    }
  }
  if (!best) return '#000000';
  return best.startsWith('#') ? best : `#${best}`;
}

/**
 * Where the light throws the shadow of a mark at scene point (x, y): the offset in scene units. A point sun at
 * (sun.x, sun.y, sun.height) pushes the shadow away from itself, further as the mark is further away or the sun is
 * lower, capped at SHADOW_MAX_OFFSET. No sun: (0, 0), the shadow sits straight under the mark.
 */
export function shadowOffset(x, y, sun) {
  if (!sun || !(Number(sun.height) > 0)) return { dx: 0, dy: 0 };
  const k = SHADOW_LIFT / Number(sun.height);
  let dx = (x - Number(sun.x)) * k;
  let dy = (y - Number(sun.y)) * k;
  const len = Math.hypot(dx, dy);
  if (len > SHADOW_MAX_OFFSET) {
    dx *= SHADOW_MAX_OFFSET / len;
    dy *= SHADOW_MAX_OFFSET / len;
  }
  return { dx, dy };
}

/** The 9 blur weights (taps at -4..4 steps of sigma/2, so the kernel spans ±2 sigma), summing to 1. */
export function blurWeights() {
  const w = [];
  let sum = 0;
  for (let i = -4; i <= 4; i++) {
    const v = Math.exp(-((i / 2) ** 2) / 2);
    w.push(v);
    sum += v;
  }
  return w.map((v) => v / sum);
}

/** The opacity the lay-down pass uses for a knob value and a layer opacity. */
export function shadowStrength(amount, layerOpacity = 1) {
  return clamp01(amount) * clamp01(layerOpacity) * SHADOW_MAX_OPACITY;
}

const WEIGHTS = blurWeights();
const W_GLSL = `float[9](${WEIGHTS.map((v) => v.toFixed(8)).join(', ')})`;

// The renderer's FULL_VS (shaders.mjs) gives v_cuv in [0, 1]; texture y runs bottom-up, scene y top-down.

export const SHADOW_SILHOUETTE_FS = `#version 300 es
precision highp float;
uniform sampler2D u_src;      // the layer's composited marks (premultiplied), full size, NEAREST
uniform sampler2D u_mask;     // the layer's matte, full size (bound even when off)
uniform float u_maskOn;
uniform int u_maskMode;       // 0 = alpha, 1 = luma
uniform float u_maskInvert;
uniform vec2 u_scene;         // scene units (W, H)
uniform vec4 u_sun;           // x, y, height (scene units), w = on
uniform vec3 u_throw;         // x = lift, y = max offset, z unused
in vec2 v_cuv;
out vec4 o;
// the matte exactly as COMPOSITE_FS reads it (shaders.mjs: sLum of the un-premultiplied colour, or alpha)
float sLum(vec3 c) { return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; }
float matte(ivec2 p) {
  if (u_maskOn < 0.5) return 1.0;
  vec4 M = texelFetch(u_mask, p, 0);
  float v = u_maskMode == 1 ? (M.a > 1e-6 ? sLum(M.rgb / M.a) : 0.0) : M.a;
  return u_maskInvert > 0.5 ? 1.0 - v : v;
}
void main() {
  vec2 world = vec2(v_cuv.x * u_scene.x, (1.0 - v_cuv.y) * u_scene.y);
  vec2 off = vec2(0.0);
  if (u_sun.w > 0.5 && u_sun.z > 0.0) {
    off = (world - u_sun.xy) * (u_throw.x / u_sun.z);
    float len = length(off);
    if (len > u_throw.y) off *= u_throw.y / len;
  }
  vec2 srcWorld = world - off;
  vec2 uv = vec2(srcWorld.x / u_scene.x, 1.0 - srcWorld.y / u_scene.y);
  ivec2 size = textureSize(u_src, 0);
  ivec2 p = ivec2(floor(uv * vec2(size) - 0.5));
  float a = 0.0;
  for (int j = 0; j < 2; j++) for (int i = 0; i < 2; i++) {
    ivec2 q = p + ivec2(i, j);
    if (q.x < 0 || q.y < 0 || q.x >= size.x || q.y >= size.y) continue;
    a += clamp(texelFetch(u_src, q, 0).a, 0.0, 1.0) * clamp(matte(q), 0.0, 1.0);
  }
  o = vec4(a * 0.25, 0.0, 0.0, 1.0);
}`;

export const SHADOW_BLUR_FS = `#version 300 es
precision highp float;
uniform sampler2D u_src;      // half size, LINEAR; the silhouette lives in .r
uniform vec2 u_step;          // one tap step, in uv
in vec2 v_cuv;
out vec4 o;
const float W[9] = ${W_GLSL};
void main() {
  float s = 0.0;
  for (int i = 0; i < 9; i++) s += W[i] * texture(u_src, v_cuv + u_step * float(i - 4)).r;
  o = vec4(clamp(s, 0.0, 1.0), 0.0, 0.0, 1.0);
}`;

export const SHADOW_LAY_FS = `#version 300 es
precision highp float;
uniform sampler2D u_shadow;   // half size, LINEAR: the blurred silhouette in .r
uniform sampler2D u_dst;      // the running composite (premultiplied)
uniform vec3 u_color;         // the palette's darkest swatch, sRGB 0..1 (straight)
uniform float u_strength;     // knob x layer opacity x max opacity
in vec2 v_cuv;
out vec4 o;
void main() {
  vec4 d = texture(u_dst, v_cuv);
  float s = clamp(texture(u_shadow, v_cuv).r * u_strength, 0.0, 1.0);
  o = vec4(u_color * s, s) + d * (1.0 - s);
}`;

/** The three programs (the silhouette, the blur used twice, the lay-down), with the exact uniforms each uploads. */
export const CONTACT_SHADOW_PROGRAMS = [
  {
    key: 'silhouette',
    name: 'contact-shadow/silhouette',
    fs: SHADOW_SILHOUETTE_FS,
    fsFile: 'contactShadow.mjs:SHADOW_SILHOUETTE_FS',
    uniforms: ['u_src', 'u_mask', 'u_maskOn', 'u_maskMode', 'u_maskInvert', 'u_scene', 'u_sun', 'u_throw'],
  },
  {
    key: 'blur',
    name: 'contact-shadow/blur',
    fs: SHADOW_BLUR_FS,
    fsFile: 'contactShadow.mjs:SHADOW_BLUR_FS',
    uniforms: ['u_src', 'u_step'],
  },
  {
    key: 'lay',
    name: 'contact-shadow/lay',
    fs: SHADOW_LAY_FS,
    fsFile: 'contactShadow.mjs:SHADOW_LAY_FS',
    uniforms: ['u_shadow', 'u_dst', 'u_color', 'u_strength'],
  },
];

/** The cost declaration (decision 6). The measured number lives in effects/measuredCosts.mjs. */
export const CONTACT_SHADOW_COST = {
  tier: 2,
  // two half-size RGBA16F buffers at 1080p: 2 x 960 x 540 x 8 B
  memoryBytes: 2 * 960 * 540 * 8,
  timeMs: 0.3,
  notes:
    '#1183 contact shadow: 3 half-size passes (silhouette, blur x, blur y) + 1 full-size lay-down, per shadowed layer only; shed after tier 1 (quality PERF + perfTier1)',
};

/** '#rrggbb' -> [r, g, b] in 0..1 (sRGB, straight). */
export function hexRgb01(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? '').trim());
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/**
 * The GPU half. `buildProgram(def)` compiles + audits one CONTACT_SHADOW_PROGRAMS entry (the renderer passes its
 * checked builder); `drawFullscreen(program)` draws the renderer's fullscreen quad; `bindTex(unit, tex)` binds.
 * The two half-size buffers are allocated on first use and resized with the frame, so a scene that never casts a
 * shadow never allocates them.
 */
export function createContactShadow(gl, { buildProgram, drawFullscreen, bindTex }) {
  const progs = {};
  for (const def of CONTACT_SHADOW_PROGRAMS) progs[def.key] = buildProgram(def);
  const U = {};
  for (const def of CONTACT_SHADOW_PROGRAMS) {
    U[def.key] = {};
    for (const n of def.uniforms) U[def.key][n] = gl.getUniformLocation(progs[def.key], n);
  }
  let half = null; // { a, b, w, h }

  function halfTarget(w, h) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
      throw new Error('[gl] contact-shadow framebuffer incomplete');
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fb, w, h };
  }
  function free(t) {
    if (t) {
      gl.deleteTexture(t.tex);
      gl.deleteFramebuffer(t.fb);
    }
  }
  function ensureHalf(w, h) {
    const hw = Math.max(1, w >> 1);
    const hh = Math.max(1, h >> 1);
    if (half && half.w === hw && half.h === hh) return half;
    if (half) {
      free(half.a);
      free(half.b);
    }
    half = { a: halfTarget(hw, hh), b: halfTarget(hw, hh), w: hw, h: hh };
    return half;
  }
  function pass(prog, target) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb);
    gl.viewport(0, 0, target.w, target.h);
    gl.disable(gl.BLEND);
    gl.useProgram(prog);
  }

  /**
   * Lay one layer's shadow over the running composite: reads dstRead, writes dstWrite (the caller swaps).
   * srcTex: the layer's marks (full size). mask: the layer's matte or null. shadow: the contract's
   * { amount, color }. sun: the contract's light or null. opacity: the layer's group opacity.
   */
  function apply({ srcTex, mask, dstRead, dstWrite, shadow, sun, opacity, sceneW, sceneH, w, h }) {
    const H = ensureHalf(w, h);
    // 1. silhouette
    pass(progs.silhouette, H.a);
    const s = U.silhouette;
    gl.uniform1i(s.u_src, bindTex(0, srcTex));
    gl.uniform1i(s.u_mask, bindTex(1, mask ? mask.tex : srcTex));
    gl.uniform1f(s.u_maskOn, mask ? 1 : 0);
    gl.uniform1i(s.u_maskMode, mask && mask.mode === 'luma' ? 1 : 0);
    gl.uniform1f(s.u_maskInvert, mask && mask.invert ? 1 : 0);
    gl.uniform2f(s.u_scene, sceneW, sceneH);
    const on = sun && Number(sun.height) > 0;
    gl.uniform4f(s.u_sun, on ? Number(sun.x) : 0, on ? Number(sun.y) : 0, on ? Number(sun.height) : 1, on ? 1 : 0);
    gl.uniform3f(s.u_throw, SHADOW_LIFT, SHADOW_MAX_OFFSET, 0);
    drawFullscreen(progs.silhouette);
    // 2–3. blur x, then y (one tap step = sigma/2, in half-size uv)
    const stepX = SHADOW_SOFT / sceneW / 2; // sigma / 2, in uv (the same at any buffer size)
    const stepY = SHADOW_SOFT / sceneH / 2;
    pass(progs.blur, H.b);
    gl.uniform1i(U.blur.u_src, bindTex(0, H.a.tex));
    gl.uniform2f(U.blur.u_step, stepX, 0);
    drawFullscreen(progs.blur);
    pass(progs.blur, H.a);
    gl.uniform1i(U.blur.u_src, bindTex(0, H.b.tex));
    gl.uniform2f(U.blur.u_step, 0, stepY);
    drawFullscreen(progs.blur);
    // 4. lay down over the running composite
    pass(progs.lay, dstWrite);
    const c = hexRgb01(shadow.color);
    gl.uniform1i(U.lay.u_shadow, bindTex(0, H.a.tex));
    gl.uniform1i(U.lay.u_dst, bindTex(1, dstRead.tex));
    gl.uniform3f(U.lay.u_color, c[0], c[1], c[2]);
    gl.uniform1f(U.lay.u_strength, shadowStrength(shadow.amount, opacity));
    drawFullscreen(progs.lay);
  }

  function dispose() {
    if (half) {
      free(half.a);
      free(half.b);
      half = null;
    }
    for (const p of Object.values(progs)) gl.deleteProgram(p);
  }

  return { apply, dispose };
}
