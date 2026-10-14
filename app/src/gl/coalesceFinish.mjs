// coalesceFinish.mjs — #1411 petri dish B2: the coalescence finish.
//
// Same-family bodies in sustained contact render a soft merge at their
// seam (the law — dwell tracking and the merge factor — lives in
// engine/dishCoalesce.mjs). The render is ONE fullscreen pass per
// coalescing layer, run on the layer's own texture inside the
// renderer's per-layer composite step, before the layer lands on the
// stack: a local threshold blend in the finish, exactly as the spec
// asks — not a blend mode over the frame, not a post effect.
//
// The maths is the metaball rule: each active pair contributes a smooth
// potential centred on the contact midpoint, with radius from the
// pair's discs, scaled by the pair's merge factor. Where the strongest
// potential crosses COALESCE_THRESHOLD, the pixel's alpha is raised to
// the bridge value and its colour pulled to the pair's blended tint —
// so the membrane exists ONLY in the notch between two touching discs:
// inside a disc the marks' own alpha already wins, outside every field
// the potential is zero and the pixel is bit-identical. No fields on
// the layer: the pass never runs and the frame is exactly what it was.

import { hexRgb01 } from './contactShadow.mjs';

/**
 * The finish's uniform-array size. Must equal COALESCE_MAX_FIELDS in
 * engine/dishCoalesce.mjs (the contract caps a layer's fields at that
 * count, and dishCoalesce.selfcheck pins the two equal) — declared
 * here, not imported, so this module pulls no engine registration
 * side effects into GL-only processes.
 */
export const COALESCE_FINISH_MAX_FIELDS = 24;
const COALESCE_MAX_FIELDS = COALESCE_FINISH_MAX_FIELDS;

/** Potential threshold the bridge is built from: below it, nothing. */
export const COALESCE_THRESHOLD = 0.35;

export const COALESCE_FS = `#version 300 es
precision highp float;
uniform sampler2D u_src;      // the layer's marks (premultiplied)
uniform vec2 u_scene;         // scene units (W, H)
uniform int u_count;          // active fields, 0..${COALESCE_MAX_FIELDS}
uniform vec4 u_fields[${COALESCE_MAX_FIELDS}];  // x, y, radius (scene units), merge factor
uniform vec3 u_colors[${COALESCE_MAX_FIELDS}];   // pair tint, sRGB 0..1 (straight)
in vec2 v_cuv;
out vec4 o;
void main() {
  vec4 s = texture(u_src, v_cuv);
  // the renderer's FULL_VS gives v_cuv in [0, 1]; texture y runs bottom-up, scene y top-down
  vec2 world = vec2(v_cuv.x * u_scene.x, (1.0 - v_cuv.y) * u_scene.y);
  float bridge = 0.0;
  vec3 bridgeCol = vec3(0.0);
  for (int k = 0; k < ${COALESCE_MAX_FIELDS}; k++) {
    if (k >= u_count) break;
    vec4 F = u_fields[k];
    float d = distance(world, F.xy);
    float g = clamp(1.0 - d / max(F.z, 1e-3), 0.0, 1.0);
    float p = g * g * (3.0 - 2.0 * g); // smooth kernel, 1 at the seam, 0 at the rim
    float b = clamp((p * F.w - ${COALESCE_THRESHOLD.toFixed(2)}) / ${(1 - COALESCE_THRESHOLD).toFixed(2)}, 0.0, 1.0);
    if (b > bridge) { bridge = b; bridgeCol = u_colors[k]; }
  }
  if (bridge > s.a) {
    // raise the silhouette to the bridge, tinted by the pair — the
    // weight is the share of the new alpha the membrane contributes
    float wgt = (bridge - s.a) / max(bridge, 1e-4);
    o = vec4(mix(s.rgb, bridgeCol * bridge, wgt), bridge);
  } else {
    o = s;
  }
}`;

export const COALESCE_PROGRAMS = [
  { key: 'fuse', name: 'dish-coalesce/fuse', fs: COALESCE_FS, fsFile: 'coalesceFinish.mjs:COALESCE_FS',
    uniforms: ['u_src', 'u_scene', 'u_count', 'u_fields', 'u_colors'] },
];

/**
 * The GPU half. `buildProgram(def)` compiles + audits one
 * COALESCE_PROGRAMS entry (the renderer passes its checked builder);
 * `drawFullscreen(program)` draws the renderer's fullscreen quad;
 * `bindTex(unit, tex)` binds. The one full-size working target is
 * allocated on first use and resized with the frame, so a scene that
 * never coalesces never allocates it.
 */
export function createCoalesceFinish(gl, { buildProgram, drawFullscreen, bindTex }) {
  const progs = {};
  for (const def of COALESCE_PROGRAMS) progs[def.key] = buildProgram(def);
  const U = {};
  for (const def of COALESCE_PROGRAMS) {
    U[def.key] = {};
    for (const n of def.uniforms) U[def.key][n] = gl.getUniformLocation(progs[def.key], n);
  }
  let out = null; // { tex, fb, w, h }

  function makeOut(w, h) {
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
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('[gl] dish-coalesce framebuffer incomplete');
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fb, w, h };
  }
  function ensureOut(w, h) {
    if (out && out.w === w && out.h === h) return out;
    if (out) { gl.deleteTexture(out.tex); gl.deleteFramebuffer(out.fb); }
    out = makeOut(w, h);
    return out;
  }

  const fieldBuf = new Float32Array(COALESCE_MAX_FIELDS * 4);
  const colorBuf = new Float32Array(COALESCE_MAX_FIELDS * 3);

  /**
   * Fuse one layer's merge fields into its marks: reads srcTex, writes
   * the owned target, returns it (the caller composites from its tex).
   * fields: the contract's [{ x, y, r, f, tint }] in scene units.
   */
  function apply({ srcTex, fields, sceneW, sceneH, w, h }) {
    const T = ensureOut(w, h);
    const n = Math.min(fields.length, COALESCE_MAX_FIELDS);
    fieldBuf.fill(0);
    colorBuf.fill(0);
    for (let k = 0; k < n; k++) {
      const f = fields[k];
      fieldBuf[k * 4] = f.x;
      fieldBuf[k * 4 + 1] = f.y;
      fieldBuf[k * 4 + 2] = f.r;
      fieldBuf[k * 4 + 3] = f.f;
      const c = hexRgb01(f.tint);
      colorBuf[k * 3] = c[0];
      colorBuf[k * 3 + 1] = c[1];
      colorBuf[k * 3 + 2] = c[2];
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, T.fb);
    gl.viewport(0, 0, T.w, T.h);
    gl.disable(gl.BLEND);
    gl.useProgram(progs.fuse);
    const u = U.fuse;
    gl.uniform1i(u.u_src, bindTex(0, srcTex));
    gl.uniform2f(u.u_scene, sceneW, sceneH);
    gl.uniform1i(u.u_count, n);
    gl.uniform4fv(u.u_fields, fieldBuf);
    gl.uniform3fv(u.u_colors, colorBuf);
    drawFullscreen(progs.fuse);
    return T;
  }

  function dispose() {
    if (out) { gl.deleteTexture(out.tex); gl.deleteFramebuffer(out.fb); out = null; }
    for (const p of Object.values(progs)) gl.deleteProgram(p);
  }

  return { apply, dispose };
}
