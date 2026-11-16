// cultureSim.mjs — K2 slice 1 (#2187): the DISH LIFE culture kernel on the GPU. Standalone: wired to nothing (K1 stage 1's
// pattern). The culture is INTEGER state (0 dead, 1 alive, 2..states-1 decaying), so unlike the fluid the GPU result is not
// "close to" the JS one — it is the same bytes. K0 tier: the culture stays Tier D; this kernel is judged on exact equality
// with engine/dishLife.mjs stepCulture, every generation, mask and bedrock included.
import { normalizeRule } from '../engine/dishLife.mjs';
import { hashBase } from '../engine/kernel/rng.js';
import { FLUID_BIRTH_FLOOR, FLUID_BIRTH_CHANNEL } from '../engine/dishFluidCouple.mjs';

/** Pure: the rule as the shader reads it — birth/survive as 9-bit masks (bit k = "k live neighbours"), and the state count. */
export function cultureRuleMasks(rule) {
  const r = normalizeRule(rule);
  const mask = (counts) => {
    let m = 0;
    for (const n of counts) if (Number.isInteger(n) && n >= 0 && n <= 8) m |= 1 << n;
    return m;
  };
  return { birth: mask(r.birth), survive: mask(r.survive), states: r.states };
}

const FULL_VS = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/** One generation. Neighbours off the grid are dead (the JS kernel's -1 sentinels); blocked cells (glass/bedrock) are 0. */
export const CULTURE_STEP_FS = `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;
uniform usampler2D u_state;
uniform usampler2D u_blocked;
uniform ivec2 u_grid;
uniform uint u_birth;
uniform uint u_survive;
uniform int u_states;
layout(location = 0) out uint o_state;

uint alive(ivec2 p) {
  if (p.x < 0 || p.y < 0 || p.x >= u_grid.x || p.y >= u_grid.y) return 0u;
  return texelFetch(u_state, p, 0).r == 1u ? 1u : 0u;
}

void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  if (texelFetch(u_blocked, p, 0).r != 0u) { o_state = 0u; return; }
  uint k = alive(p + ivec2(-1, -1)) + alive(p + ivec2(0, -1)) + alive(p + ivec2(1, -1))
         + alive(p + ivec2(-1, 0))                             + alive(p + ivec2(1, 0))
         + alive(p + ivec2(-1, 1))  + alive(p + ivec2(0, 1))  + alive(p + ivec2(1, 1));
  uint s = texelFetch(u_state, p, 0).r;
  uint last = uint(u_states - 1);
  if (s == 0u) o_state = ((u_birth >> k) & 1u) == 1u ? 1u : 0u;
  else if (s == 1u) o_state = ((u_survive >> k) & 1u) == 1u ? 1u : (last >= 2u ? 2u : 0u);
  else o_state = s >= last ? 0u : s + 1u;
}`;

/**
 * K2 slice 2 — the fluid→culture births IN SHADER SPACE (Matt, 2026-11-16: fully in-shader). The same rule as
 * dishFluidCouple.injectFluidBirths: a dead, unblocked cell is born when hashU01(seed, 'dish-fluid-birth', gen*8192+i) is
 * below strength*(d-floor)/(1-floor). The hash is the kernel's own integer avalanche (rng.js hashU32) in uint32 arithmetic,
 * so the draws are bit-identical; only the compare is float32 (a cell whose draw lands within ~2^-24 of the threshold can
 * differ). The density is a float texture sampled in place: no readback.
 */
export const CULTURE_BIRTH_FS = `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;
uniform usampler2D u_state;
uniform usampler2D u_blocked;
uniform sampler2D u_density;
uniform ivec2 u_grid;
uniform int u_dchan;
uniform uint u_base;
uniform int u_gen;
uniform float u_strength;
uniform float u_floor;
layout(location = 0) out uint o_state;

uint hashAvalanche(uint base, uint index) {
  uint h = base ^ (index * 0x85ebca6bu);
  h = (h ^ (h >> 16)) * 0x7feb352du;
  h = (h ^ (h >> 15)) * 0x846ca68bu;
  h = h ^ (h >> 16);
  return h == 0u ? 1u : h;
}

void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  uint s = texelFetch(u_state, p, 0).r;
  o_state = s;
  if (s != 0u || texelFetch(u_blocked, p, 0).r != 0u) return;
  vec2 rg = texelFetch(u_density, p, 0).rg;
  float d = u_dchan == 0 ? rg.r : rg.g;
  if (!(d > u_floor)) return;
  float chance = u_strength * ((d - u_floor) / (1.0 - u_floor));
  uint idx = uint(p.y * u_grid.x + p.x);
  uint h = hashAvalanche(u_base, uint(u_gen) * 8192u + idx);
  if (float(h) < chance * 4294967296.0) o_state = 1u;
}`;

/**
 * The GPU culture on an existing WebGL2 context. seed(cur, blocked?) uploads the state grid (Uint8, cols*rows) and the blocked
 * grid (1 = glass or bedrock; null = none); step(n, rule) runs n generations; read() returns the state grid as a Uint8Array.
 */
export function createGpuCulture(gl, cols, rows) {
  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`[cultureSim] ${gl.getShaderInfoLog(s)}`);
    return s;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, FULL_VS));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, CULTURE_STEP_FS));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(`[cultureSim] ${gl.getProgramInfoLog(prog)}`);
  const U = (n) => gl.getUniformLocation(prog, n);
  const bprog = gl.createProgram();
  gl.attachShader(bprog, compile(gl.VERTEX_SHADER, FULL_VS));
  gl.attachShader(bprog, compile(gl.FRAGMENT_SHADER, CULTURE_BIRTH_FS));
  gl.linkProgram(bprog);
  if (!gl.getProgramParameter(bprog, gl.LINK_STATUS)) throw new Error(`[cultureSim] ${gl.getProgramInfoLog(bprog)}`);
  const BU = (n) => gl.getUniformLocation(bprog, n);
  const mkTex = (data) => {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8UI, cols, rows, 0, gl.RED_INTEGER, gl.UNSIGNED_BYTE, data);
    return t;
  };
  const tex = [mkTex(null), mkTex(null)];
  const blockedTex = mkTex(new Uint8Array(cols * rows));
  const fbo = tex.map((t) => {
    const f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
      throw new Error('[cultureSim] R8UI target incomplete');
    return f;
  });
  let cur = 0;
  let gen = 0; // the generation counter the birth draw is dealt at (the JS culture's c.gen)
  const vao = gl.createVertexArray();
  const upload = (t, data) => {
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, cols, rows, gl.RED_INTEGER, gl.UNSIGNED_BYTE, data);
  };
  return {
    cols,
    rows,
    seed(state, blocked = null, startGen = 0) {
      gen = startGen | 0;
      upload(tex[cur], state);
      upload(blockedTex, blocked && blocked.length === cols * rows ? blocked : new Uint8Array(cols * rows));
    },
    /** Replace the blocked grid (1 = glass or bedrock) without touching the state — terrain can change mid-wake. */
    setBlocked(blocked) {
      upload(blockedTex, blocked && blocked.length === cols * rows ? blocked : new Uint8Array(cols * rows));
    },
    /** Queue an async readback of the state grid (R8UI) into a PIXEL_PACK_BUFFER — no stall. */
    readInto(pbo) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo[cur]);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo);
      gl.pixelStorei(gl.PACK_ALIGNMENT, 1);
      gl.readPixels(0, 0, cols, rows, gl.RED_INTEGER, gl.UNSIGNED_BYTE, 0);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    },
    /** The generation the next step()/births() is dealt at. */
    get gen() {
      return gen;
    },
    /**
     * Fluid-biased births for the NEXT generation, in shader space (call before step(1), like the JS seam). fluidTex is a
     * float texture on this context (RG32F fluid state: channel 0 = R, 1 = G — the density is G); no readback.
     * strength 0 (or non-finite) is inert, as in the JS seam.
     */
    births({ fluidTex, channel = 1, strength, seed = 0 }) {
      const st = Number.isFinite(Number(strength)) ? Math.min(1, Math.max(0, Number(strength))) : 0;
      if (!(st > 0) || !fluidTex) return;
      gl.useProgram(bprog);
      gl.bindVertexArray(vao);
      gl.disable(gl.BLEND);
      gl.viewport(0, 0, cols, rows);
      gl.uniform2i(BU('u_grid'), cols, rows);
      gl.uniform1i(BU('u_dchan'), channel === 0 ? 0 : 1);
      gl.uniform1ui(BU('u_base'), hashBase(seed | 0, FLUID_BIRTH_CHANNEL));
      gl.uniform1i(BU('u_gen'), gen);
      gl.uniform1f(BU('u_strength'), st);
      gl.uniform1f(BU('u_floor'), FLUID_BIRTH_FLOOR);
      gl.uniform1i(BU('u_state'), 0);
      gl.uniform1i(BU('u_blocked'), 1);
      gl.uniform1i(BU('u_density'), 2);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, blockedTex);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, fluidTex);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex[cur]);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo[1 - cur]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      cur = 1 - cur;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    },
    step(n, rule) {
      const m = cultureRuleMasks(rule);
      gl.useProgram(prog);
      gl.bindVertexArray(vao);
      gl.disable(gl.BLEND);
      gl.viewport(0, 0, cols, rows);
      gl.uniform2i(U('u_grid'), cols, rows);
      gl.uniform1ui(U('u_birth'), m.birth);
      gl.uniform1ui(U('u_survive'), m.survive);
      gl.uniform1i(U('u_states'), m.states);
      gl.uniform1i(U('u_state'), 0);
      gl.uniform1i(U('u_blocked'), 1);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, blockedTex);
      for (let i = 0; i < n; i++) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tex[cur]);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo[1 - cur]);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        cur = 1 - cur;
        gen++;
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    },
    read() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo[cur]);
      const out = new Uint8Array(cols * rows);
      gl.pixelStorei(gl.PACK_ALIGNMENT, 1);
      gl.readPixels(0, 0, cols, rows, gl.RED_INTEGER, gl.UNSIGNED_BYTE, out);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return out;
    },
  };
}
