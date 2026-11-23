// fluidSim.mjs — K1 (#2186) stage 1: the dish fluid's Gray-Scott step as a GPU ping-pong. NOT wired to the live
// resolver (the JS kernel in engine/dishFluid.mjs stays the reference backend — K0 R4); this is the kernel and its
// proof harness. State is one RG32F texture (R = U ground, G = V dark phase), cols x rows, double-buffered.
//
// Law transcribed from stepFluid: 8-neighbour laplacian (edge 0.2, corner 0.05, centre -1), missing rim neighbours
// read as ground (U 1, V 0 — the dish wall), feed/kill biased by the magnet field (per-magnet-weighted Gaussian sum)
// and the culture level (nearest-sampled), results clamped to [0, 1]. Floats are float32 on the GPU as in the JS
// Float32Arrays; Tier S per K0 — same-device reproducible, not bit-exact against the JS record, and judged on
// character + stability.
import {
  GS_DU,
  GS_DV,
  FERRO_FEED,
  FERRO_KILL,
  FERRO_KILL_MIN,
  MAGNET_FEED_GAIN,
  MAGNET_KILL_DROP,
  CULTURE_FEED_GAIN,
  CULTURE_KILL_DROP,
  MAGNET_RADIUS,
  MAX_MAGNETS,
  FLOW_FEED_MIN,
  FLOW_FEED_MAX,
  clampFluidDial,
  sanitizeMagnets,
} from '../engine/dishFluid.mjs';

export const FLUID_STEP_FS = `#version 300 es
precision highp float;
uniform sampler2D u_state;      // RG32F: R = U, G = V
uniform sampler2D u_culture;    // R32F culture level (cw x ch), nearest
uniform vec2 u_grid;            // cols, rows
uniform vec2 u_cultureGrid;     // cw, ch (0 = no culture)
uniform float u_feedBase;
uniform float u_pull;
uniform float u_couple;
uniform float u_aspect;
uniform int u_nMagnets;
uniform vec2 u_magnets[${MAX_MAGNETS}];
uniform float u_magnetW[${MAX_MAGNETS}]; // per-magnet weight (1 = a weightless stage magnet)
in vec2 v_cuv;
out vec4 o;
vec2 at(ivec2 p) {
  if (p.x < 0 || p.y < 0 || p.x >= int(u_grid.x) || p.y >= int(u_grid.y)) return vec2(1.0, 0.0); // the dish wall
  return texelFetch(u_state, p, 0).rg;
}
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec2 c = at(p);
  vec2 lap = -c;
  lap += 0.2 * (at(p + ivec2(-1, 0)) + at(p + ivec2(1, 0)) + at(p + ivec2(0, -1)) + at(p + ivec2(0, 1)));
  lap += 0.05 * (at(p + ivec2(-1, -1)) + at(p + ivec2(1, -1)) + at(p + ivec2(-1, 1)) + at(p + ivec2(1, 1)));
  float feed = u_feedBase;
  float kill = ${FERRO_KILL.toFixed(6)};
  if (u_nMagnets > 0 && u_pull > 0.0) {
    vec2 n = (vec2(p) + 0.5) / u_grid;
    float mf = 0.0;
    for (int i = 0; i < ${MAX_MAGNETS}; i++) {
      if (i >= u_nMagnets) break;
      float dx = n.x - u_magnets[i].x;
      float dy = (n.y - u_magnets[i].y) * u_aspect;
      mf += u_magnetW[i] * exp(-(dx * dx + dy * dy) / ${(MAGNET_RADIUS * MAGNET_RADIUS).toFixed(8)});
    }
    if (mf > 0.001) {
      feed += ${MAGNET_FEED_GAIN.toFixed(6)} * u_pull * mf;
      kill = max(${FERRO_KILL_MIN.toFixed(6)}, kill - ${MAGNET_KILL_DROP.toFixed(6)} * u_pull * mf);
    }
  }
  if (u_cultureGrid.x > 0.5 && u_couple > 0.0) {
    vec2 n = (vec2(p) + 0.5) / u_grid;
    ivec2 cp = ivec2(min(u_cultureGrid - 1.0, floor(n * u_cultureGrid)));
    float cl = texelFetch(u_culture, cp, 0).r;
    if (cl > 0.0) {
      feed += ${CULTURE_FEED_GAIN.toFixed(6)} * u_couple * cl;
      kill = max(${FERRO_KILL_MIN.toFixed(6)}, kill - ${CULTURE_KILL_DROP.toFixed(6)} * u_couple * cl);
    }
  }
  float uvv = c.x * c.y * c.y;
  float nu = c.x + (${GS_DU.toFixed(6)} * lap.x - uvv + feed * (1.0 - c.x));
  float nv = c.y + (${GS_DV.toFixed(6)} * lap.y + uvv - (feed + kill) * c.y);
  o = vec4(clamp(nu, 0.0, 1.0), clamp(nv, 0.0, 1.0), 0.0, 1.0);
}`;

const FULL_VS = `#version 300 es
out vec2 v_cuv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  v_cuv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/** The uniform inputs of one step, from the same opts stepFluid takes (sanitized the same way). Pure. */
export function fluidStepUniforms(opts = {}) {
  const magnets = sanitizeMagnets(opts.magnets);
  const pull = clampFluidDial(opts.pull === undefined ? 0.7 : opts.pull);
  const flow = opts.flow === undefined ? 0.5 : clampFluidDial(opts.flow);
  const couple = clampFluidDial(opts.couple === undefined ? 0.5 : opts.couple);
  const aspect = Number.isFinite(Number(opts.aspectHW)) && Number(opts.aspectHW) > 0 ? Number(opts.aspectHW) : 0.7;
  const feedBase = FERRO_FEED * (FLOW_FEED_MIN + (FLOW_FEED_MAX - FLOW_FEED_MIN) * flow);
  // Per-magnet weights, parallel to `magnets`: sanitizeMagnets has already clamped a carried
  // w to zero or more; an entry without one weighs 1, the JS magnetFieldAt reading exactly.
  const magnetWeights = magnets.map((m) => (m.w === undefined ? 1 : m.w));
  return { magnets, magnetWeights, pull, couple, aspect, feedBase };
}

/**
 * The GPU fluid on an existing WebGL2 context (EXT_color_buffer_float required — the renderer already demands it).
 * seed(u, v) uploads a JS fluid's phases; step(n, opts) runs n passes; read() returns { u, v } Float32Arrays.
 */
export function createGpuFluid(gl, cols, rows) {
  if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('[fluidSim] EXT_color_buffer_float required');
  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`[fluidSim] ${gl.getShaderInfoLog(s)}`);
    return s;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, FULL_VS));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FLUID_STEP_FS));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(`[fluidSim] ${gl.getProgramInfoLog(prog)}`);
  const U = (n) => gl.getUniformLocation(prog, n);
  const mkTex = (w, h, fmt, type, data) => {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      fmt === 'rg' ? gl.RG32F : gl.R32F,
      w,
      h,
      0,
      fmt === 'rg' ? gl.RG : gl.RED,
      type,
      data,
    );
    return t;
  };
  const tex = [mkTex(cols, rows, 'rg', gl.FLOAT, null), mkTex(cols, rows, 'rg', gl.FLOAT, null)];
  const fbo = tex.map((t) => {
    const f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
      throw new Error('[fluidSim] RG32F target incomplete');
    return f;
  });
  let cultureTex = mkTex(1, 1, 'r', gl.FLOAT, new Float32Array([0]));
  let cultureDims = [0, 0];
  let cur = 0;
  const vao = gl.createVertexArray();
  const mags = new Float32Array(MAX_MAGNETS * 2);
  const magW = new Float32Array(MAX_MAGNETS).fill(1);
  return {
    cols,
    rows,
    seed(u, v) {
      const d = new Float32Array(cols * rows * 2);
      for (let i = 0; i < cols * rows; i++) {
        d[i * 2] = u[i];
        d[i * 2 + 1] = v[i];
      }
      gl.bindTexture(gl.TEXTURE_2D, tex[cur]);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, cols, rows, gl.RG, gl.FLOAT, d);
    },
    setCulture(level, cw, ch) {
      gl.deleteTexture(cultureTex);
      if (level && cw > 0 && ch > 0) {
        cultureTex = mkTex(cw, ch, 'r', gl.FLOAT, level);
        cultureDims = [cw, ch];
      } else {
        cultureTex = mkTex(1, 1, 'r', gl.FLOAT, new Float32Array([0]));
        cultureDims = [0, 0];
      }
    },
    step(n, opts = {}) {
      const s = fluidStepUniforms(opts);
      gl.useProgram(prog);
      gl.bindVertexArray(vao);
      gl.disable(gl.BLEND);
      gl.viewport(0, 0, cols, rows);
      gl.uniform2f(U('u_grid'), cols, rows);
      gl.uniform2f(U('u_cultureGrid'), cultureDims[0], cultureDims[1]);
      gl.uniform1f(U('u_feedBase'), s.feedBase);
      gl.uniform1f(U('u_pull'), s.pull);
      gl.uniform1f(U('u_couple'), s.couple);
      gl.uniform1f(U('u_aspect'), s.aspect);
      gl.uniform1i(U('u_nMagnets'), s.magnets.length);
      mags.fill(0);
      magW.fill(1);
      s.magnets.forEach((m, i) => {
        mags[i * 2] = m.x;
        mags[i * 2 + 1] = m.y;
        magW[i] = s.magnetWeights[i];
      });
      gl.uniform2fv(U('u_magnets[0]'), mags);
      gl.uniform1fv(U('u_magnetW[0]'), magW);
      gl.uniform1i(U('u_state'), 0);
      gl.uniform1i(U('u_culture'), 1);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, cultureTex);
      for (let i = 0; i < n; i++) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tex[cur]);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo[1 - cur]);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        cur = 1 - cur;
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    },
    /** The current field texture (RG32F, u in R, v in G) — for a shader-space reader on the same context (K2 slice 2b). */
    texture() {
      return tex[cur];
    },
    /** Queue an async readback of the current field (RGBA32F, u in R, v in G) into a PIXEL_PACK_BUFFER — no stall. */
    readInto(pbo) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo[cur]);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo);
      gl.readPixels(0, 0, cols, rows, gl.RGBA, gl.FLOAT, 0);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    },
    read() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo[cur]);
      const d = new Float32Array(cols * rows * 4);
      gl.readPixels(0, 0, cols, rows, gl.RGBA, gl.FLOAT, d);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      const u = new Float32Array(cols * rows);
      const v = new Float32Array(cols * rows);
      for (let i = 0; i < cols * rows; i++) {
        u[i] = d[i * 4];
        v[i] = d[i * 4 + 1];
      }
      return { u, v };
    },
  };
}
