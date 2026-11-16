// cultureSim.mjs — K2 slice 1 (#2187): the DISH LIFE culture kernel on the GPU. Standalone: wired to nothing (K1 stage 1's
// pattern). The culture is INTEGER state (0 dead, 1 alive, 2..states-1 decaying), so unlike the fluid the GPU result is not
// "close to" the JS one — it is the same bytes. K0 tier: the culture stays Tier D; this kernel is judged on exact equality
// with engine/dishLife.mjs stepCulture, every generation, mask and bedrock included.
import { normalizeRule } from '../engine/dishLife.mjs';

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
  const vao = gl.createVertexArray();
  const upload = (t, data) => {
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, cols, rows, gl.RED_INTEGER, gl.UNSIGNED_BYTE, data);
  };
  return {
    cols,
    rows,
    seed(state, blocked = null) {
      upload(tex[cur], state);
      upload(blockedTex, blocked && blocked.length === cols * rows ? blocked : new Uint8Array(cols * rows));
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
