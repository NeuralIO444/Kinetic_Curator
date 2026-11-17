// swarmSim.mjs — K3 slice 1a (#2188): the swarm's CORE on the GPU. Standalone: wired to nothing (K1/K2's pattern).
//
// What is here: the three boids forces (separation / alignment / cohesion, ALL-PAIRS — WebGL2 has no atomics for a GPU grid;
// Matt ruled "all-pairs, measure first", 2026-11-16), the point attractor (the legacy force term of particles.js — seek /
// flee are its seekGain sign), semi-implicit Euler with dt-correct damping, the speed clamp, and the two boundary laws (cloud:
// wrap at a 120 px pad; organism: bounce off an 8 px margin). State is one RGBA32F texture, one texel per particle
// (x, y, vx, vy), ping-ponged; mass rides a static texture (the per-agent uniqueness channel, uploaded once).
//
// Slice 1b adds the cloud swarm's POINT wind; slice 1c the CURL wind (organisms) and the windMul; slice 1d chemotaxis (reads an uploaded scent grid); slice 1e Levy flights (the kernel's own integer hash in-shader); slice 1f Lorenz (per-agent xyz state, a second colour attachment); slice 1g drives + leak (energy/drive and pigment state on two more) (the noise3D -> angle/shape pair, via the field twin's GLSL + the exact perm bytes).
// What is NOT here yet (later K3 slices): the curl wind (organisms), chemotaxis, Lévy, Lorenz, cling, drives, leak, breeding,
// contacts, swarm takeover (slice 1i adds the SPINE chain: p.spine { len, follow }, its own pass, readSpine(len); slice 1h adds the HEADING: p.heading { mode 1 cloud snap | 2 organism damped turn, turn, maxTurn }, the facing in degrees riding o_drv.z). A caller that wants parity with the JS swarm runs it with wind 0 (see the
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
uniform sampler2D u_scent;   // R32F cols x rows: the scent field's cells, uploaded by the caller (JS still owns deposit/diffuse/decay)
uniform vec3 u_chem;         // chemotaxis gain (0 = off), scent cols, scent rows
uniform vec4 u_levy;         // gain (0 = off), alpha (clamped 0.05..2), sim step, unused
uniform uint u_levyBase;     // hashBase(seed, CH.dyn): the kernel's own pre-avalanche word
uniform sampler2D u_lorenz;  // (x, y, z) per agent
uniform vec3 u_lz;           // rho (clamped 1..60; 0 = Lorenz off), dt (LORENZ_DT * dtFrames), steering gain (0 = advance only)
uniform sampler2D u_drvIn;   // previous (energy, drive)
uniform sampler2D u_leakIn;  // previous pigment (r, g, b)
uniform vec4 u_drv;          // metabolism (0 = drives off), sim step, unused, unused
uniform float u_leakK;       // leak * 0.004 * dtFrames (0 = leak off)
uniform float u_windMul;     // cloud swarm: 1 (the wind knob is ignored); organism: wind * profile.wind
uniform int u_bounce;        // 0 = wrap (cloud), 1 = bounce (organism)
uniform vec4 u_head;         // heading: mode (0 off, 1 cloud snap, 2 organism turn), turn fraction per step (1 = no smoothing), max turn degrees per step, unused
layout(location = 0) out vec4 o_state;
layout(location = 2) out vec4 o_drv;      // (energy, drive, heading degrees, 0) per agent
layout(location = 3) out vec4 o_leak;     // pigment working copy (r, g, b, 0) per agent
layout(location = 1) out vec4 o_lorenz;   // per-agent Lorenz phase state (x, y, z, 0), ping-ponged beside o_state

uint hashAvalanche(uint base, uint index) {
  uint h = base ^ (index * 0x85ebca6bu);
  h = (h ^ (h >> 16)) * 0x7feb352du;
  h = (h ^ (h >> 15)) * 0x846ca68bu;
  h = h ^ (h >> 16);
  return h == 0u ? 1u : h;
}
float hashU01(uint index) { return float(hashAvalanche(u_levyBase, index)) / 4294967296.0; }

float scentAt(int x, int y) {
  int cx = clamp(x, 0, int(u_chem.y) - 1);
  int cy = clamp(y, 0, int(u_chem.z) - 1);
  return texelFetch(u_scent, ivec2(cx, cy), 0).r;
}
float scentSample(vec2 n) {
  float gx = min(u_chem.y - 1.001, max(0.0, n.x * u_chem.y - 0.5));
  float gy = min(u_chem.z - 1.001, max(0.0, n.y * u_chem.z - 0.5));
  float fx0 = floor(gx);
  float fy0 = floor(gy);
  float fx = gx - fx0;
  float fy = gy - fy0;
  int x0 = int(fx0);
  int y0 = int(fy0);
  float a = scentAt(x0, y0);
  float b = scentAt(x0 + 1, y0);
  float c = scentAt(x0, y0 + 1);
  float d = scentAt(x0 + 1, y0 + 1);
  float v = a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  return clamp(v, 0.0, 4.0);
}

void main() {
  ivec2 tp = ivec2(gl_FragCoord.xy);
  int i = tp.y * u_w + tp.x;
  vec4 s = texelFetch(u_state, tp, 0);
  vec4 lz = texelFetch(u_lorenz, tp, 0);
  o_lorenz = lz;
  vec4 dr = texelFetch(u_drvIn, tp, 0);
  vec4 lk = texelFetch(u_leakIn, tp, 0);
  o_drv = dr;
  o_leak = lk;
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

  if (u_lz.x != 0.0) {
    // behave.js lorenzAdvance: one RK2 (midpoint) step of the agent's own attractor state; the VELOCITY is the steering direction
    float rho = clamp(u_lz.x, 1.0, 60.0);
    vec3 k1 = vec3(10.0 * (lz.y - lz.x), lz.x * (rho - lz.z) - lz.y, lz.x * lz.y - (8.0 / 3.0) * lz.z);
    vec3 h = lz.xyz + k1 * u_lz.y * 0.5;
    vec3 k2 = vec3(10.0 * (h.y - h.x), h.x * (rho - h.z) - h.y, h.x * h.y - (8.0 / 3.0) * h.z);
    o_lorenz = vec4(lz.xyz + k2 * u_lz.y, 0.0);
    float mag = length(k2.xy);
    if (u_lz.z != 0.0 && mag > 1e-9) f += (k2.xy / mag) * u_lz.z / m;
  }

  if (u_levy.x != 0.0) {
    // particles.js #582 Levy: hold one heading + one heavy-tailed magnitude for LEVY_FLIGHT_FRAMES (45), phase-staggered per agent
    uint iu = uint(i);
    float phase = hashU01(224717u + iu) * 45.0;
    uint epoch = uint(floor((u_levy.z + phase) / 45.0));
    float ul = hashU01(epoch * 7919u + 224737u + iu);
    float ua = hashU01(epoch * 7919u + 224753u + iu);
    float a = clamp(u_levy.y, 0.05, 2.0);
    float L = pow(max(1.0 - ul, 1e-9), -1.0 / a) - 1.0;
    float stride = min(L, 64.0) * u_levy.x;
    float ang = ua * 6.283185307179586;
    f += vec2(cos(ang), sin(ang)) * stride / m;
  }

  if (u_chem.x != 0.0) {
    // scent.js: bilinear sample (cell-centred, clamped, value clamped to 0..4) and its central-difference gradient, normalised coords
    vec2 nrm = p / u_canvas;
    float ex = 1.0 / u_chem.y;
    float ey = 1.0 / u_chem.z;
    float gx = (scentSample(vec2(nrm.x + ex, nrm.y)) - scentSample(vec2(nrm.x - ex, nrm.y))) / (2.0 * ex);
    float gy = (scentSample(vec2(nrm.x, nrm.y + ey)) - scentSample(vec2(nrm.x, nrm.y - ey))) / (2.0 * ey);
    f += vec2(gx, gy) * u_chem.x / m;
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
  vec3 leakSum = vec3(0.0);
  float meta = u_drv.x;
  float cohW = u_weight.z;
  if (meta > 0.0) cohW = u_weight.z * (1.0 + (1.0 - dr.x) * 1.6); // hunger seeks density
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
    if (d2 < u_radius2.z) {
      coh += o.xy; cohN += 1.0;
      if (u_leakK > 0.0) leakSum += texelFetch(u_leakIn, jp, 0).rgb;
    }
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
    f += (steer / mag) * cohW / m;
  }
  if (u_leakK > 0.0 && cohN > 0.0) o_leak = vec4(lk.rgb + (leakSum / cohN - lk.rgb) * u_leakK, 0.0);
  if (meta > 0.0) {
    // particles.js #287 drives: fatigue / feeding, a curiosity random walk on the drive value, and its noise detour
    float e = dr.x - 0.0016 * meta * u_dt;
    if (cohN > 0.0) e += 0.0012 * meta * u_dt;
    if (u_chem.y > 1.5) e += scentSample(p / u_canvas) * 0.002 * meta * u_dt;
    e = clamp(e, 0.0, 1.0);
    float h = hashU01(uint(u_drv.y) * 131071u + 104729u + uint(i));
    float dd = clamp(dr.y + (h - 0.5) * 0.06 * meta * u_dt, 0.0, 1.0);
    o_drv = vec4(e, dd, dr.z, dr.w);
    if (dd > 0.001) {
      float wob = kcNoise3D(p.x * u_wind.x + 500.0, p.y * u_wind.x + 500.0, u_wind.w + mt.g * 0.0001 + 7.3);
      float wa = wob * 6.283185307179586;
      f += vec2(cos(wa), sin(wa)) * (dd * meta * 0.6) / m;
    }
    f *= 0.45 + 0.55 * e; // fatigue damps steering authority
  }

  v = (v + f * u_dt) * pow(u_damp, u_dt);
  float speed = length(v);
  if (speed > u_maxSpeed) v = v / speed * u_maxSpeed;
  if (u_head.x > 0.5 && speed > 0.04) {
    // particles.js heading: the facing follows the (clamped) velocity. Cloud: snap. Organism: the shortest turn, damped, then capped per step.
    float next = atan(v.y, v.x) * 57.29577951308232;
    if (u_head.x < 1.5) {
      o_drv.z = next;
    } else {
      float dlt = next - dr.z;
      if (abs(dlt) > 180.0) dlt -= 360.0 * sign(dlt) * ceil((abs(dlt) - 180.0) / 360.0);
      float stp = clamp(dlt * u_head.y, -u_head.z, u_head.z);
      o_drv.z = dr.z + stp;
    }
  }
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

export const SPINE_MAX = 7; // particles.js caps an organism's body at 7 segments (bodyLen = clamp(round(body), 1, 7))

/**
 * The spine pass. An organism's body is a chain of bodyLen points: segment 0 is the head (the post-bounce position this step), and
 * every later segment eases toward the one in front of it, which has ALREADY moved this step: new[s] = cur[s] + (new[s-1] - cur[s]) * f
 * (f = 1 - pow(1 - follow, dtFrames), computed by the caller). That recurrence is sequential along the chain, so each fragment (agent,
 * segment s) unrolls it from the head: s <= 6 iterations, no cross-fragment dependency. Spine texture = the state texture's layout
 * stacked SPINE_MAX times: row (s * h + ty). Mode 1 (init) sets every segment to the head, as particles.js's [head] seed does.
 */
export const SPINE_FS = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D u_state;   // the state texture holding the heads (x, y, vx, vy)
uniform sampler2D u_spineIn; // previous (x, y) per segment
uniform int u_n;
uniform int u_w;
uniform int u_h;
uniform int u_len;           // bodyLen (1..7)
uniform float u_follow;      // dt-corrected follow fraction
uniform int u_init;          // 1 = every segment starts at the head
layout(location = 0) out vec4 o_spine;
void main() {
  ivec2 tp = ivec2(gl_FragCoord.xy);
  int s = tp.y / u_h;
  ivec2 ap = ivec2(tp.x, tp.y - s * u_h);
  int i = ap.y * u_w + ap.x;
  vec4 prev = texelFetch(u_spineIn, tp, 0);
  if (i >= u_n) { o_spine = prev; return; }
  vec2 head = texelFetch(u_state, ap, 0).xy;
  if (u_init == 1) { o_spine = vec4(head, 0.0, 0.0); return; }
  if (s >= u_len) { o_spine = prev; return; }
  vec2 acc = head;
  for (int k = 1; k <= 6; k++) {
    if (k > s) break;
    vec2 cur = texelFetch(u_spineIn, ivec2(ap.x, k * u_h + ap.y), 0).xy;
    acc = cur + (acc - cur) * u_follow;
  }
  o_spine = vec4(acc, 0.0, 0.0);
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
 *                                  attractor: {x, y} | null, attractStrength, wind: {seed, freq, offX, offY, nt, curl?, mul?} | null, chemotaxis (gain; needs setScent), levy: {gain, alpha, step, base: hashBase(seed, CH.dyn)}, lorenz: {rho, gain} (seed({lorenz:{x,y,z}}); readLorenz()), drives: {meta, step, base: hashBase(seed, CH.dyn)} (needs wind.freq/nt/seed for the detour; seed({energy,drive})), leak (0..1; seed({leakRgb}); readDrives()), bounds: 'wrap'|'bounce', canvasW, canvasH }
 *                                  heading: { mode: 1 (cloud: snap to the velocity) | 2 (organism: shortest turn x turn, capped at maxTurn deg), turn: 1 - exp(-lambda*dtSec) or 1, maxTurn: 600*dtSec } (seed({rotation}) degrees; readDrives().rotation)
 *                                  spine: { len (body segments, 1..7), follow (0.05..0.95, particles.js `tight`) } runs the spine pass after the step: readSpine(len) -> { x, y } indexed i*len+s
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
  const lzTex = [mkTex(null), mkTex(null)];
  const drvTex = [mkTex(null), mkTex(null)];
  const leakTex = [mkTex(null), mkTex(null)];
  const massTex = mkTex(new Float32Array(w * h * 4).fill(1));
  let scentTex = null;
  let scentDim = [1, 1];
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
  const fbo = tex.map((t, k) => {
    const f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, lzTex[k], 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT2, gl.TEXTURE_2D, drvTex[k], 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT3, gl.TEXTURE_2D, leakTex[k], 0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2, gl.COLOR_ATTACHMENT3]);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
      throw new Error('[swarmSim] RGBA32F target incomplete');
    return f;
  });
  let cur = 0;
  const vao = gl.createVertexArray();
  // the spine pass: its own program + ping-pong texture (w x h*SPINE_MAX), allocated on first use
  let spine = null;
  const ensureSpine = () => {
    if (spine) return spine;
    const sp = gl.createProgram();
    gl.attachShader(sp, compile(gl.VERTEX_SHADER, FULL_VS));
    gl.attachShader(sp, compile(gl.FRAGMENT_SHADER, SPINE_FS));
    gl.linkProgram(sp);
    if (!gl.getProgramParameter(sp, gl.LINK_STATUS)) throw new Error(`[swarmSim] ${gl.getProgramInfoLog(sp)}`);
    const SH = h * SPINE_MAX;
    const mk = () => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, SH, 0, gl.RGBA, gl.FLOAT, null);
      return t;
    };
    const tx = [mk(), mk()];
    const fb = tx.map((t) => {
      const f = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
        throw new Error('[swarmSim] spine target incomplete');
      return f;
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    spine = { prog: sp, tx, fb, cur: 0, ready: false, SH };
    return spine;
  };
  const runSpine = (init, len, follow) => {
    const S = ensureSpine();
    const U2 = (nme) => gl.getUniformLocation(S.prog, nme);
    gl.useProgram(S.prog);
    gl.bindVertexArray(vao);
    gl.disable(gl.BLEND);
    gl.viewport(0, 0, w, S.SH);
    gl.uniform1i(U2('u_n'), count);
    gl.uniform1i(U2('u_w'), w);
    gl.uniform1i(U2('u_h'), h);
    gl.uniform1i(U2('u_len'), len);
    gl.uniform1f(U2('u_follow'), follow);
    gl.uniform1i(U2('u_init'), init ? 1 : 0);
    gl.uniform1i(U2('u_state'), 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex[cur]);
    gl.uniform1i(U2('u_spineIn'), 1);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, S.tx[S.cur]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, S.fb[1 - S.cur]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    S.cur = 1 - S.cur;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.activeTexture(gl.TEXTURE0);
  };
  const upload = (t, data) => {
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, gl.RGBA, gl.FLOAT, data);
  };
  return {
    n: count,
    seed({ x, y, vx, vy, mass, seedOffset, lorenz, energy, drive, leakRgb, rotation }) {
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
      const lz = new Float32Array(w * h * 4);
      if (lorenz)
        for (let i = 0; i < count; i++) {
          lz[i * 4] = lorenz.x[i];
          lz[i * 4 + 1] = lorenz.y[i];
          lz[i * 4 + 2] = lorenz.z[i];
        }
      upload(lzTex[cur], lz);
      const dv = new Float32Array(w * h * 4);
      const lk = new Float32Array(w * h * 4);
      for (let i = 0; i < count; i++) {
        dv[i * 4] = energy ? energy[i] : 1;
        dv[i * 4 + 1] = drive ? drive[i] : 0;
        dv[i * 4 + 2] = rotation ? rotation[i] : 0;
        if (leakRgb) {
          lk[i * 4] = leakRgb[i * 3];
          lk[i * 4 + 1] = leakRgb[i * 3 + 1];
          lk[i * 4 + 2] = leakRgb[i * 3 + 2];
        }
      }
      upload(drvTex[cur], dv);
      upload(leakTex[cur], lk);
      upload(massTex, ms);
    },
    /** Upload the scent field's cells (Float32Array cols*rows, row-major) for the chemotaxis term. */
    setScent(cells, cols, rows) {
      if (!scentTex) {
        scentTex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, scentTex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      }
      gl.bindTexture(gl.TEXTURE_2D, scentTex);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, cols, rows, 0, gl.RED, gl.FLOAT, cells);
      scentDim = [cols, rows];
    },
    step(p) {
      const dt = Number.isFinite(p.dtFrames) ? p.dtFrames : 1;
      const a = p.attractor && Number.isFinite(p.attractor.x) && Number.isFinite(p.attractor.y) ? p.attractor : null;
      const sg = p.spine && p.spine.len >= 1 ? p.spine : null;
      const sgLen = sg ? Math.max(1, Math.min(SPINE_MAX, Math.round(sg.len))) : 0;
      // the first stepped substep seeds every segment at the pre-step head (particles.js starts a spine as [head])
      if (sg && !(spine && spine.ready)) {
        runSpine(true, sgLen, 0);
        spine.ready = true;
      }
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
      const hd = p.heading && p.heading.mode ? p.heading : null;
      gl.uniform4f(
        U('u_head'),
        hd ? hd.mode : 0,
        hd && Number.isFinite(hd.turn) ? hd.turn : 1,
        hd && Number.isFinite(hd.maxTurn) ? hd.maxTurn : 1e9,
        0,
      );
      const wd = p.wind && Number.isFinite(p.wind.nt) ? p.wind : null;
      gl.uniform4f(U('u_wind'), wd ? wd.freq : 0, wd ? wd.offX || 0 : 0, wd ? wd.offY || 0 : 0, wd ? wd.nt : 0);
      gl.uniform1f(U('u_windOn'), wd ? (wd.curl ? 2 : 1) : 0);
      gl.uniform1f(U('u_windMul'), wd && Number.isFinite(wd.mul) ? wd.mul : 1);
      const chem = scentTex && Number.isFinite(p.chemotaxis) ? p.chemotaxis : 0;
      gl.uniform3f(U('u_chem'), chem, scentDim[0], scentDim[1]);
      const lv = p.levy && Number.isFinite(p.levy.gain) && p.levy.gain !== 0 ? p.levy : null;
      gl.uniform4f(U('u_levy'), lv ? lv.gain : 0, lv ? lv.alpha : 0, lv ? lv.step : 0, 0);
      const dp = p.drives && p.drives.meta > 0 ? p.drives : null;
      gl.uniform1ui(U('u_levyBase'), lv ? lv.base >>> 0 : dp ? dp.base >>> 0 : 0);
      gl.uniform4f(U('u_drv'), dp ? dp.meta : 0, dp ? dp.step : 0, 0, 0);
      gl.uniform1f(U('u_leakK'), p.leak > 0 ? p.leak * 0.004 * dt : 0);
      gl.uniform1i(U('u_drvIn'), 5);
      gl.activeTexture(gl.TEXTURE5);
      gl.bindTexture(gl.TEXTURE_2D, drvTex[cur]);
      gl.uniform1i(U('u_leakIn'), 6);
      gl.activeTexture(gl.TEXTURE6);
      gl.bindTexture(gl.TEXTURE_2D, leakTex[cur]);
      const lzp = p.lorenz && p.lorenz.rho > 0 ? p.lorenz : null;
      gl.uniform3f(U('u_lz'), lzp ? lzp.rho : 0, lzp ? 0.006 * dt : 0, lzp && lzp.gain ? lzp.gain : 0);
      gl.uniform1i(U('u_lorenz'), 4);
      gl.activeTexture(gl.TEXTURE4);
      gl.bindTexture(gl.TEXTURE_2D, lzTex[cur]);
      gl.uniform1i(U('u_scent'), 3);
      if (scentTex) {
        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_2D, scentTex);
      }
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
      if (sg) runSpine(false, sgLen, 1 - Math.pow(1 - Math.max(0.05, Math.min(0.95, sg.follow)), dt));
    },
    /** The spine chain after the last step: { len, x, y } with x[i * len + s] = segment s of agent i (s = 0 is the head). Needs p.spine. */
    readSpine(len) {
      const out = { len, x: new Float32Array(count * len), y: new Float32Array(count * len) };
      if (!spine) return out;
      gl.bindFramebuffer(gl.FRAMEBUFFER, spine.fb[spine.cur]);
      const d = new Float32Array(w * spine.SH * 4);
      gl.readPixels(0, 0, w, spine.SH, gl.RGBA, gl.FLOAT, d);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      for (let i = 0; i < count; i++) {
        const tx = i % w;
        const ty = Math.floor(i / w);
        for (let s = 0; s < len; s++) {
          const o = ((s * h + ty) * w + tx) * 4;
          out.x[i * len + s] = d[o];
          out.y[i * len + s] = d[o + 1];
        }
      }
      return out;
    },
    /** The agents' Lorenz phase state after the last step: { x, y, z } Float32Arrays. */
    readLorenz() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo[cur]);
      gl.readBuffer(gl.COLOR_ATTACHMENT1);
      const d = new Float32Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, d);
      gl.readBuffer(gl.COLOR_ATTACHMENT0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      const out = { x: new Float32Array(count), y: new Float32Array(count), z: new Float32Array(count) };
      for (let i = 0; i < count; i++) {
        out.x[i] = d[i * 4];
        out.y[i] = d[i * 4 + 1];
        out.z[i] = d[i * 4 + 2];
      }
      return out;
    },
    /** Drive, heading and pigment state after the last step: { energy, drive, rotation (degrees), leakRgb (3 per agent) }. */
    readDrives() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo[cur]);
      const grab = (att) => {
        gl.readBuffer(att);
        const d = new Float32Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, d);
        return d;
      };
      const dv = grab(gl.COLOR_ATTACHMENT2);
      const lk = grab(gl.COLOR_ATTACHMENT3);
      gl.readBuffer(gl.COLOR_ATTACHMENT0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      const out = {
        energy: new Float32Array(count),
        drive: new Float32Array(count),
        rotation: new Float32Array(count),
        leakRgb: new Float32Array(count * 3),
      };
      for (let i = 0; i < count; i++) {
        out.energy[i] = dv[i * 4];
        out.drive[i] = dv[i * 4 + 1];
        out.rotation[i] = dv[i * 4 + 2];
        out.leakRgb[i * 3] = lk[i * 4];
        out.leakRgb[i * 3 + 1] = lk[i * 4 + 1];
        out.leakRgb[i * 3 + 2] = lk[i * 4 + 2];
      }
      return out;
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
      for (const t of [...tex, ...lzTex, ...drvTex, ...leakTex, massTex, ...permTex.values()]) gl.deleteTexture(t);
      if (scentTex) gl.deleteTexture(scentTex);
      for (const f of fbo) gl.deleteFramebuffer(f);
      if (spine) {
        gl.deleteProgram(spine.prog);
        for (const t of spine.tx) gl.deleteTexture(t);
        for (const f of spine.fb) gl.deleteFramebuffer(f);
      }
    },
  };
}
