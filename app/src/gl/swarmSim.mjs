// swarmSim.mjs — K3 slice 1a (#2188): the swarm's CORE on the GPU. Standalone: wired to nothing (K1/K2's pattern).
//
// What is here: the three boids forces (separation / alignment / cohesion, ALL-PAIRS — WebGL2 has no atomics for a GPU grid;
// Matt ruled "all-pairs, measure first", 2026-11-16), the point attractor (the legacy force term of particles.js — seek /
// flee are its seekGain sign), semi-implicit Euler with dt-correct damping, the speed clamp, and the two boundary laws (cloud:
// wrap at a 120 px pad; organism: bounce off an 8 px margin). State is one RGBA32F texture, one texel per particle
// (x, y, vx, vy), ping-ponged; mass rides a static texture (the per-agent uniqueness channel, uploaded once).
//
// Slice 1b adds the cloud swarm's POINT wind; slice 1c the CURL wind (organisms) and the windMul (the noise3D -> angle/shape pair, via the field twin's GLSL + the exact perm bytes).
// What is NOT here yet (later K3 slices): the curl wind (organisms), chemotaxis, Lévy, Lorenz, cling, drives, leak, breeding,
// contacts, the heading and spine integrators. A caller that wants parity with the JS swarm runs it with wind 0 (see the
// selfcheck, which drives the real ParticleSystem and this kernel from the same state).
//
// K0 tier: the kernel is judged against the JS swarm, not bitwise — float32 vs float64 differ at noise and a swarm is chaotic;
// the bar is one-step agreement to float noise, then bounded speed / no NaN / ordering properties over long runs.

import { FIELD_COMMON_GLSL } from './fields/fieldCommon.glsl.js';
import { permTableFor } from '../engine/noise.js';

/** The constants particles.js uses in cloud (swarm) mode and organism mode, for the forces this kernel owns. */
export const SWARM_CORE_CLOUD = Object.freeze({
  sepR: 35,
  aliR: 60,
  cohR: 70,
  sepW: 1.8,
  aliW: 1.0,
  cohW: 1.5,
  damping: 0.95,
  maxSpeed: 8.0,
  bounds: 'wrap',
});
export const ATTRACTOR_GAIN = 8; // particles.js ATTRACTOR_GAIN
export const WRAP_PAD = 120;
export const BOUNCE_MARGIN = 8;
export const BOUNCE = 0.62;

const FULL_VS = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/** One substep. i = the texel's particle index; every j is visited (all-pairs). Matches particles.js's force sum and integrator. */
export const SWARM_STEP_FS = `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;
${FIELD_COMMON_GLSL}
uniform sampler2D u_state;   // (x, y, vx, vy)
uniform sampler2D u_mass;    // (mass, 0, 0, 0)
uniform int u_n;
uniform int u_w;             // texture width in texels
uniform float u_dt;          // dtFrames (1 at 60 fps)
uniform vec3 u_radius2;      // sep, ali, coh radii squared
uniform vec3 u_weight;       // sep, ali, coh weights
uniform float u_damp;
uniform float u_maxSpeed;
uniform vec4 u_attract;      // x, y, strength (gravityWells*attractMul*GAIN*seekMul), enabled (0/1)
uniform vec2 u_canvas;
uniform vec4 u_wind;         // noiseFreq, domainOffsetX, domainOffsetY, nt (time * noiseSpeed * 0.001)
uniform float u_windOn;      // 0 = off, 1 = point wind (noise3D -> angle), 2 = curl wind (curl2, organisms)
uniform float u_windMul;     // cloud swarm: 1 (the wind knob is ignored); organism: wind * profile.wind
uniform int u_bounce;        // 0 = wrap (cloud), 1 = bounce (organism)
layout(location = 0) out vec4 o_state;

void main() {
  ivec2 tp = ivec2(gl_FragCoord.xy);
  int i = tp.y * u_w + tp.x;
  vec4 s = texelFetch(u_state, tp, 0);
  if (i >= u_n) { o_state = s; return; }
  vec4 mt = texelFetch(u_mass, tp, 0);
  float m = mt.r;
  vec2 p = s.xy;
  vec2 v = s.zw;
  vec2 f = vec2(0.0);

  if (u_windOn > 0.5) {
    float fx = p.x * u_wind.x + u_wind.y;
    float fy = p.y * u_wind.x + u_wind.z;
    float tz = u_wind.w + mt.g * 0.0001;
    if (u_windOn > 1.5) {
      // particles.js curl wind: curl2 = central differences of 3-octave fBm, eps 0.5
      float n1 = kcFbm3D(fx, fy + 0.5, tz, 3, 2.0, 0.5);
      float n2 = kcFbm3D(fx, fy - 0.5, tz, 3, 2.0, 0.5);
      float n3 = kcFbm3D(fx + 0.5, fy, tz, 3, 2.0, 0.5);
      float n4 = kcFbm3D(fx - 0.5, fy, tz, 3, 2.0, 0.5);
      f += vec2(n1 - n2, n4 - n3) * (0.8 * u_windMul) / m;
    } else {
      // noise3D -> angle, a second sample (+200) -> shape
      float ang = kcNoise3D(fx, fy, tz) * 6.283185307179586;
      float shape = (kcNoise3D(fx + 200.0, fy + 200.0, u_wind.w) + 1.0) * 0.4;
      f += vec2(cos(ang), sin(ang)) * shape * u_windMul / m;
    }
  }

  if (u_attract.w > 0.5) {
    vec2 d2v = u_attract.xy - p;
    float d = length(d2v);
    if (d > 5.0) {
      float mag = u_attract.z / max(20.0, d * 0.05);
      f += (d2v / d) * mag / m;
    }
  }

  vec2 sep = vec2(0.0); float sepN = 0.0;
  vec2 ali = vec2(0.0); float aliN = 0.0;
  vec2 coh = vec2(0.0); float cohN = 0.0;
  float maxR2 = max(u_radius2.x, max(u_radius2.y, u_radius2.z));
  for (int j = 0; j < u_n; j++) {
    if (j == i) continue;
    ivec2 jp = ivec2(j % u_w, j / u_w);
    vec4 o = texelFetch(u_state, jp, 0);
    vec2 dv = o.xy - p;
    float d2 = dot(dv, dv);
    if (d2 >= maxR2 || d2 <= 0.0) continue;
    if (d2 < u_radius2.x) { sep -= dv / sqrt(d2); sepN += 1.0; }
    if (d2 < u_radius2.y) { ali += o.zw; aliN += 1.0; }
    if (d2 < u_radius2.z) { coh += o.xy; cohN += 1.0; }
  }
  if (sepN > 0.0) {
    float mag = length(sep); if (mag == 0.0) mag = 1.0;
    f += (sep / sepN / mag) * u_weight.x * sepN / m;
  }
  if (aliN > 0.0 && u_weight.y != 0.0) {
    float mag = length(ali); if (mag == 0.0) mag = 1.0;
    f += (ali / aliN / mag) * u_weight.y * aliN / m;
  }
  if (cohN > 0.0 && u_weight.z != 0.0) {
    vec2 steer = coh / cohN - p;
    float mag = length(steer); if (mag == 0.0) mag = 1.0;
    f += (steer / mag) * u_weight.z / m;
  }

  v = (v + f * u_dt) * pow(u_damp, u_dt);
  float speed = length(v);
  if (speed > u_maxSpeed) v = v / speed * u_maxSpeed;
  p += v * u_dt;
  if (u_bounce == 1) {
    if (p.x < 8.0) { p.x = 8.0; v.x = abs(v.x) * 0.62; }
    else if (p.x > u_canvas.x - 8.0) { p.x = u_canvas.x - 8.0; v.x = -abs(v.x) * 0.62; }
    if (p.y < 8.0) { p.y = 8.0; v.y = abs(v.y) * 0.62; }
    else if (p.y > u_canvas.y - 8.0) { p.y = u_canvas.y - 8.0; v.y = -abs(v.y) * 0.62; }
  } else {
    if (p.x < -120.0) p.x = u_canvas.x + 120.0; else if (p.x > u_canvas.x + 120.0) p.x = -120.0;
    if (p.y < -120.0) p.y = u_canvas.y + 120.0; else if (p.y > u_canvas.y + 120.0) p.y = -120.0;
  }
  o_state = vec4(p, v);
}`;

/** Pure: texture layout for n particles — a fixed width keeps the all-pairs index math cheap and the texture within limits. */
export function swarmTextureLayout(n, width = 128) {
  const count = Math.max(1, Math.floor(n));
  const w = Math.min(count, width);
  return { w, h: Math.ceil(count / w), n: count };
}

/**
 * The GPU swarm core on an existing WebGL2 context (EXT_color_buffer_float required — the renderer already demands it).
 *   seed({ x, y, vx, vy, mass, seedOffset })   upload n particles (Float32Array / number arrays)
 *   step(params)                   one substep; params: { dtFrames, sepR, aliR, cohR, sepW, aliW, cohW, damping, maxSpeed,
 *                                  attractor: {x, y} | null, attractStrength, wind: {seed, freq, offX, offY, nt, curl?, mul?} | null, bounds: 'wrap'|'bounce', canvasW, canvasH }
 *   read()                         { x, y, vx, vy } as Float32Arrays (synchronous: tests / measurement)
 */
export function createGpuSwarm(gl, n) {
  if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('[swarmSim] EXT_color_buffer_float required');
  const { w, h, n: count } = swarmTextureLayout(n);
  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`[swarmSim] ${gl.getShaderInfoLog(s)}`);
    return s;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, FULL_VS));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, SWARM_STEP_FS));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(`[swarmSim] ${gl.getProgramInfoLog(prog)}`);
  const U = (name) => gl.getUniformLocation(prog, name);
  const mkTex = (data) => {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, data);
    return t;
  };
  const tex = [mkTex(null), mkTex(null)];
  const massTex = mkTex(new Float32Array(w * h * 4).fill(1));
  const permTex = new Map(); // noise seed -> R8UI 512x1 (the exact bytes permTableFor gives, as fieldRunner uploads them)
  const permFor = (seed) => {
    const key = seed >>> 0;
    let t = permTex.get(key);
    if (!t) {
      t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8UI, 512, 1, 0, gl.RED_INTEGER, gl.UNSIGNED_BYTE, permTableFor(seed));
      permTex.set(key, t);
    }
    return t;
  };
  const fbo = tex.map((t) => {
    const f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
      throw new Error('[swarmSim] RGBA32F target incomplete');
    return f;
  });
  let cur = 0;
  const vao = gl.createVertexArray();
  const upload = (t, data) => {
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, gl.RGBA, gl.FLOAT, data);
  };
  return {
    n: count,
    seed({ x, y, vx, vy, mass, seedOffset }) {
      const st = new Float32Array(w * h * 4);
      const ms = new Float32Array(w * h * 4).fill(1);
      for (let i = 0; i < count; i++) {
        st[i * 4] = x[i];
        st[i * 4 + 1] = y[i];
        st[i * 4 + 2] = vx[i];
        st[i * 4 + 3] = vy[i];
        ms[i * 4] = mass ? mass[i] : 1;
        ms[i * 4 + 1] = seedOffset ? seedOffset[i] : 0;
      }
      upload(tex[cur], st);
      upload(massTex, ms);
    },
    step(p) {
      const dt = Number.isFinite(p.dtFrames) ? p.dtFrames : 1;
      const a = p.attractor && Number.isFinite(p.attractor.x) && Number.isFinite(p.attractor.y) ? p.attractor : null;
      gl.useProgram(prog);
      gl.bindVertexArray(vao);
      gl.disable(gl.BLEND);
      gl.viewport(0, 0, w, h);
      gl.uniform1i(U('u_n'), count);
      gl.uniform1i(U('u_w'), w);
      gl.uniform1f(U('u_dt'), dt);
      gl.uniform3f(U('u_radius2'), p.sepR * p.sepR, p.aliR * p.aliR, p.cohR * p.cohR);
      gl.uniform3f(U('u_weight'), p.sepW, p.aliW, p.cohW);
      gl.uniform1f(U('u_damp'), p.damping);
      gl.uniform1f(U('u_maxSpeed'), p.maxSpeed);
      gl.uniform4f(
        U('u_attract'),
        a ? a.x : 0,
        a ? a.y : 0,
        a ? p.attractStrength || 0 : 0,
        a && p.attractStrength ? 1 : 0,
      );
      gl.uniform2f(U('u_canvas'), p.canvasW, p.canvasH);
      gl.uniform1i(U('u_bounce'), p.bounds === 'bounce' ? 1 : 0);
      const wd = p.wind && Number.isFinite(p.wind.nt) ? p.wind : null;
      gl.uniform4f(U('u_wind'), wd ? wd.freq : 0, wd ? wd.offX || 0 : 0, wd ? wd.offY || 0 : 0, wd ? wd.nt : 0);
      gl.uniform1f(U('u_windOn'), wd ? (wd.curl ? 2 : 1) : 0);
      gl.uniform1f(U('u_windMul'), wd && Number.isFinite(wd.mul) ? wd.mul : 1);
      gl.uniform1i(U('u_perm'), 2);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, permFor(wd ? wd.seed : 444));
      gl.uniform1i(U('u_state'), 0);
      gl.uniform1i(U('u_mass'), 1);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, massTex);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex[cur]);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo[1 - cur]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      cur = 1 - cur;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    },
    read() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo[cur]);
      const d = new Float32Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, d);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      const out = {
        x: new Float32Array(count),
        y: new Float32Array(count),
        vx: new Float32Array(count),
        vy: new Float32Array(count),
      };
      for (let i = 0; i < count; i++) {
        out.x[i] = d[i * 4];
        out.y[i] = d[i * 4 + 1];
        out.vx[i] = d[i * 4 + 2];
        out.vy[i] = d[i * 4 + 3];
      }
      return out;
    },
    dispose() {
      gl.deleteProgram(prog);
      for (const t of [...tex, massTex, ...permTex.values()]) gl.deleteTexture(t);
      for (const f of fbo) gl.deleteFramebuffer(f);
    },
  };
}
