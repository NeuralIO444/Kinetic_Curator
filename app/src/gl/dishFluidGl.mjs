// dishFluidGl.mjs — FERROFLUID (#1997): the GPU display instance of the dish fluid.
//
// The kernel (engine/dishFluid.mjs) is the math authority; this module runs the SAME step on
// the GPU at the shed resolution the resolver's plan names (384×216 at the design point),
// RGBA16F ping-pong, 9-point laplacian, texelFetch taps — the app's GL machinery, ACCUM's
// construction (own programmes via the debug harness, own targets, own fullscreen triangle).
//
//   DRIVEN BY THE PLAN, NEVER BY THE CLOCK — engine/dishFluidStage.mjs publishes a plan per
//   resolved frame ({ seedKey, wakeMs, stepTarget, stepsAllowed, resIndex, cols, rows, magnets,
//   dial, coupleField, aspectHW }); applyPlan() rebuilds the field when the plan's seed/wake/
//   resolution changes (uploading the kernel's own initial condition, so the GPU field starts
//   as the very field the kernel deals), seeks back by rebuilding, and otherwise steps toward
//   stepTarget — at most stepsAllowed steps on a steady frame, with a bounded catch-up budget
//   after a rebuild so a mid-cycle arm converges in a few frames instead of one long one.
//
//   DETERMINISM (Matt's ruling, 2026-11-08) — seed, magnets and step count are stamped state,
//   so replay on the SAME DEVICE is exact (this module's selfcheck asserts bit-identity of two
//   same-device runs). GPU float does not promise bit-identity across devices and nothing here
//   claims it: the display field is a Davis-side living surface under the WebGL parity bar.
//   The COUPLING never reads this instance — it reads the resolver's dish-grid kernel instance.
//
//   THE FLOOR — FLUID_DISPLAY_FS is the renderer's `dishfluid` programme (tier 0, drawn once
//   as the frame's floor over the background): dark phase as ink over the palette's ground,
//   an oily sheen on the phase's gradient lit by the palette's lightest swatch. Continuous
//   signal, Davis rendering: bilinear sampling, soft thresholds, no hard edges.

import { buildProgramChecked, auditProgramChecked } from './debug/diagnostics.mjs';
import { FULL_VS } from './shaders.mjs';
import {
  createFluid,
  FERRO_FEED,
  FERRO_KILL,
  FERRO_KILL_MIN,
  GS_DU,
  GS_DV,
  MAGNET_FEED_GAIN,
  MAGNET_KILL_DROP,
  CULTURE_FEED_GAIN,
  CULTURE_KILL_DROP,
  MAGNET_RADIUS,
  FLOW_FEED_MIN,
  FLOW_FEED_MAX,
  MAX_MAGNETS,
} from '../engine/dishFluid.mjs';

/** Steps served per frame at most right after a (re)build, until the field catches the stamp. */
export const FLUID_CATCHUP_STEPS = 128;

/** The step programme: one Gray-Scott step, tap for tap the kernel's (engine/dishFluid.mjs). */
export const FLUID_STEP_FS = `#version 300 es
precision highp float;
uniform sampler2D u_state;
uniform sampler2D u_culture;
uniform float u_feed;
uniform float u_kill;
uniform float u_killMin;
uniform float u_du;
uniform float u_dv;
uniform float u_flowScale;
uniform float u_feedGain;
uniform float u_killDrop;
uniform float u_cultureGain;
uniform float u_cultureKillDrop;
uniform float u_pull;
uniform float u_couple;
uniform float u_radius;
uniform float u_aspectHW;
uniform int u_magnetCount;
uniform vec3 u_magnets[${MAX_MAGNETS}];
in vec2 v_cuv;
out vec4 o;
vec2 tap(ivec2 c, ivec2 sz) {
  if (c.x < 0 || c.y < 0 || c.x >= sz.x || c.y >= sz.y) return vec2(1.0, 0.0);
  return texelFetch(u_state, c, 0).rg;
}
void main() {
  ivec2 sz = textureSize(u_state, 0);
  ivec2 c = ivec2(gl_FragCoord.xy);
  vec2 C = texelFetch(u_state, c, 0).rg;
  vec2 lap = -C;
  lap += 0.2 * tap(c + ivec2(-1, 0), sz) + 0.2 * tap(c + ivec2(1, 0), sz);
  lap += 0.2 * tap(c + ivec2(0, -1), sz) + 0.2 * tap(c + ivec2(0, 1), sz);
  lap += 0.05 * tap(c + ivec2(-1, -1), sz) + 0.05 * tap(c + ivec2(1, -1), sz);
  lap += 0.05 * tap(c + ivec2(-1, 1), sz) + 0.05 * tap(c + ivec2(1, 1), sz);
  float feed = u_feed * u_flowScale;
  float kill = u_kill;
  if (u_pull > 0.0 && u_magnetCount > 0) {
    vec2 np = (vec2(c) + 0.5) / vec2(sz);
    float mf = 0.0;
    for (int i = 0; i < ${MAX_MAGNETS}; i++) {
      if (i >= u_magnetCount) break;
      vec2 d = vec2(np.x - u_magnets[i].x, (np.y - u_magnets[i].y) * u_aspectHW);
      mf += exp(-dot(d, d) / (u_radius * u_radius));
    }
    if (mf > 0.001) {
      feed += u_feedGain * u_pull * mf;
      kill = max(u_killMin, kill - u_killDrop * u_pull * mf);
    }
  }
  if (u_couple > 0.0) {
    ivec2 csz = textureSize(u_culture, 0);
    ivec2 cc = ivec2((vec2(c) + 0.5) / vec2(sz) * vec2(csz));
    cc = clamp(cc, ivec2(0), csz - 1);
    float cl = texelFetch(u_culture, cc, 0).r;
    if (cl > 0.0) {
      feed += u_cultureGain * u_couple * cl;
      kill = max(u_killMin, kill - u_cultureKillDrop * u_couple * cl);
    }
  }
  float uvv = C.x * C.y * C.y;
  float nu = C.x + (u_du * lap.x - uvv + feed * (1.0 - C.x));
  float nv = C.y + (u_dv * lap.y + uvv - (feed + kill) * C.y);
  o = vec4(clamp(nu, 0.0, 1.0), clamp(nv, 0.0, 1.0), 0.0, 1.0);
}`;

/** The floor programme (the renderer's `dishfluid` def): the fluid drawn beneath the strata. */
export const FLUID_DISPLAY_FS = `#version 300 es
precision highp float;
uniform sampler2D u_fluid;
uniform vec3 u_bg;
uniform vec3 u_ground;
uniform vec3 u_bright;
uniform vec3 u_ink;
uniform float u_amt;
uniform vec2 u_fluidTexel;
in vec2 v_cuv;
out vec4 o;
void main() {
  // the fluid texture's row 0 is the dish's top (y down, the placement convention); the
  // frame's v runs the other way, so the sample flips — a magnet at dish (x, y) stands at
  // (x from the left, y from the top) of the frame, where the performer put it.
  vec2 uv = vec2(v_cuv.x, 1.0 - v_cuv.y);
  float v = texture(u_fluid, uv).g;
  float gx = texture(u_fluid, uv + vec2(u_fluidTexel.x, 0.0)).g - texture(u_fluid, uv - vec2(u_fluidTexel.x, 0.0)).g;
  float gy = texture(u_fluid, uv + vec2(0.0, u_fluidTexel.y)).g - texture(u_fluid, uv - vec2(0.0, u_fluidTexel.y)).g;
  float cover = smoothstep(0.10, 0.45, v);
  float sheen = clamp((abs(gx) + abs(gy)) * 5.0, 0.0, 1.0);
  vec3 col = mix(u_ground, u_ink, cover);
  col += u_bright * sheen * (0.10 + 0.30 * cover);
  o = vec4(mix(u_bg, col, u_amt), 1.0);
}`;

const STEP_UNIFORMS = [
  'u_state',
  'u_culture',
  'u_feed',
  'u_kill',
  'u_killMin',
  'u_du',
  'u_dv',
  'u_flowScale',
  'u_feedGain',
  'u_killDrop',
  'u_cultureGain',
  'u_cultureKillDrop',
  'u_pull',
  'u_couple',
  'u_radius',
  'u_aspectHW',
  'u_magnetCount',
  'u_magnets',
];

function makeTarget16F(gl, w, h) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  // LINEAR: the floor samples bilinear (Davis); the step pass reads by texelFetch, which
  // ignores filtering, so the one setting serves both.
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error('[dishfluid] framebuffer incomplete');
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return { tex, fb, w, h };
}

function deleteTarget(gl, t) {
  if (!t) return;
  gl.deleteTexture(t.tex);
  gl.deleteFramebuffer(t.fb);
}

/** Pack a kernel field into RGBA float data (U in R, V in G) for the seed upload. */
function packField(f) {
  const data = new Float32Array(f.cols * f.rows * 4);
  for (let i = 0; i < f.u.length; i++) {
    data[i * 4] = f.u[i];
    data[i * 4 + 1] = f.v[i];
    data[i * 4 + 3] = 1;
  }
  return data;
}

/**
 * Create the display instance on a WebGL2 context. Returns { applyPlan, dispose }.
 * applyPlan(plan, colours) → { tex, cols, rows, ground, bright, ink } for the frame's floor
 * draw, or null when the plan is inactive / the context cannot serve it.
 */
export function createDishFluidGl(gl) {
  const prog = buildProgramChecked(gl, FULL_VS, FLUID_STEP_FS, {
    name: 'dishfluid-step',
    vsFile: 'shaders.mjs:FULL_VS',
    fsFile: 'dishFluidGl.mjs:FLUID_STEP_FS',
  });
  auditProgramChecked(gl, prog, STEP_UNIFORMS, { name: 'dishfluid-step', file: 'dishFluidGl.mjs:FLUID_STEP_FS' });
  const U = (n) => gl.getUniformLocation(prog, n);
  const locs = {};
  for (const n of STEP_UNIFORMS) locs[n] = U(n);
  const magnetLocs = [];
  for (let i = 0; i < MAX_MAGNETS; i++) magnetLocs.push(U(`u_magnets[${i}]`));

  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  // the culture coupling texture (RGBA8, level in R) + a 1×1 zero stand-in for "no coupling"
  const cultureTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, cultureTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  let cultureRef = null; // the level array last uploaded (identity = the frame-behind publication changed)
  gl.bindTexture(gl.TEXTURE_2D, null);

  let read = null;
  let write = null;
  let key = null;
  let served = 0;
  let disposed = false;

  function rebuild(plan) {
    if (read) deleteTarget(gl, read);
    if (write) deleteTarget(gl, write);
    read = makeTarget16F(gl, plan.cols, plan.rows);
    write = makeTarget16F(gl, plan.cols, plan.rows);
    const f = createFluid({ cols: plan.cols, rows: plan.rows, seedKey: plan.seedKey >>> 0, magnets: plan.magnets });
    gl.bindTexture(gl.TEXTURE_2D, read.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, plan.cols, plan.rows, 0, gl.RGBA, gl.FLOAT, packField(f));
    gl.bindTexture(gl.TEXTURE_2D, null);
    key = `${plan.seedKey >>> 0}|${plan.wakeMs}|${plan.cols}x${plan.rows}`;
    served = 0;
  }

  let cultureGen = null;
  function uploadCulture(cf) {
    // the culture's level buffer is one stable array mutated per generation, so the change
    // signal is (array, generation): a held culture (same gen) is uploaded once.
    if (!cf) {
      cultureRef = null;
      cultureGen = null;
      return;
    }
    if (cf.level === cultureRef && cf.gen === cultureGen) return;
    cultureRef = cf.level;
    cultureGen = cf.gen;
    const data = new Uint8Array(cf.cols * cf.rows * 4);
    for (let i = 0; i < cf.level.length; i++) data[i * 4] = Math.round(Math.min(1, Math.max(0, cf.level[i])) * 255);
    gl.bindTexture(gl.TEXTURE_2D, cultureTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, cf.cols, cf.rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  function stepOnce(plan) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, write.fb);
    gl.viewport(0, 0, read.w, read.h);
    gl.disable(gl.BLEND);
    gl.useProgram(prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, read.tex);
    gl.uniform1i(locs.u_state, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, cultureTex);
    gl.uniform1i(locs.u_culture, 1);
    gl.uniform1f(locs.u_feed, FERRO_FEED);
    gl.uniform1f(locs.u_kill, FERRO_KILL);
    gl.uniform1f(locs.u_killMin, FERRO_KILL_MIN);
    gl.uniform1f(locs.u_du, GS_DU);
    gl.uniform1f(locs.u_dv, GS_DV);
    const flow = plan.dial ? plan.dial.flow : 0.5;
    gl.uniform1f(locs.u_flowScale, FLOW_FEED_MIN + (FLOW_FEED_MAX - FLOW_FEED_MIN) * flow);
    gl.uniform1f(locs.u_feedGain, MAGNET_FEED_GAIN);
    gl.uniform1f(locs.u_killDrop, MAGNET_KILL_DROP);
    gl.uniform1f(locs.u_cultureGain, CULTURE_FEED_GAIN);
    gl.uniform1f(locs.u_cultureKillDrop, CULTURE_KILL_DROP);
    gl.uniform1f(locs.u_pull, plan.dial ? plan.dial.pull : 0.7);
    gl.uniform1f(locs.u_couple, plan.coupleField ? (plan.dial ? plan.dial.couple : 0.5) : 0);
    gl.uniform1f(locs.u_radius, MAGNET_RADIUS);
    gl.uniform1f(locs.u_aspectHW, plan.aspectHW || 0.7);
    const mags = plan.magnets || [];
    gl.uniform1i(locs.u_magnetCount, Math.min(MAX_MAGNETS, mags.length));
    for (let i = 0; i < MAX_MAGNETS; i++) {
      const m = mags[i];
      gl.uniform3f(magnetLocs[i], m ? m.x : 0, m ? m.y : 0, 1);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    const aPos = gl.getAttribLocation(prog, 'a_pos');
    if (aPos >= 0) {
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.activeTexture(gl.TEXTURE0);
    const t = read;
    read = write;
    write = t;
    served++;
  }

  return {
    applyPlan(plan, colours) {
      if (disposed || !plan || !plan.active) return null;
      const wantKey = `${plan.seedKey >>> 0}|${plan.wakeMs}|${plan.cols}x${plan.rows}`;
      let fresh = false;
      if (wantKey !== key || plan.stepTarget < served) {
        rebuild(plan);
        fresh = true;
      }
      uploadCulture(plan.coupleField || null);
      const needed = Math.max(0, Math.floor(plan.stepTarget) - served);
      const budget = fresh ? FLUID_CATCHUP_STEPS : Math.max(0, plan.stepsAllowed | 0);
      const n = Math.min(needed, budget);
      for (let i = 0; i < n; i++) stepOnce(plan);
      const c = colours || {};
      return {
        tex: read.tex,
        cols: read.w,
        rows: read.h,
        ground: c.ground || [0, 0, 0],
        bright: c.bright || [1, 1, 1],
        ink: c.ink || [0.02, 0.02, 0.03],
      };
    },
    get served() {
      return served;
    },
    dispose() {
      disposed = true;
      if (read) deleteTarget(gl, read);
      if (write) deleteTarget(gl, write);
      read = write = null;
      gl.deleteTexture(cultureTex);
      gl.deleteBuffer(vbo);
      gl.deleteProgram(prog);
    },
  };
}
