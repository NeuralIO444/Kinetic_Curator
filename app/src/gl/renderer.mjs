/**
 * WebGL2 scene renderer — Phase 1 (#187), layer compositing + mattes (#189),
 * ACCUM feedback + bloom on GPU (#190).
 * Browser-safe (no Node imports).
 *
 * Consumes the Phase 0 scene contract (docs/GL_CONTRACT.md, v1) and renders
 * it to RGBA pixels for the parity harness. Structure mirrors the SVG
 * reference path (studio/render.mjs):
 *
 * - bg clear (palette bg, opaque)
 * - one 16F FBO per content layer: instanced textured quads, premultiplied
 *   "over" compositing, per-item blend fallback via scratch FBO
 * - layer -> target compositing with full CSS blend modes (plus-lighter
 *   falls back to screen, matching the SVG reference's #96 substitution)
 *   + group opacity + optional layer matte (mask texture, #154 re-plan)
 * - FX wrap groups: content layers folded into a wrap FBO (same as the
 *   SVG <g filter> fold), effect chain as fullscreen passes, SVG filter-
 *   region clipping, then compositing with the wrap opacity (and the FX
 *   layer's own matte, if any)
 * - final resolve to RGBA8 premultiplied bytes (resvg's pixel convention)
 *
 * Animated params (life/beat) are buffer updates by construction: per-frame
 * work is instance-buffer upload + draw calls, never placement rebuilds.
 *
 * Two entry points share one core (createRendererBase):
 * - createRenderer(canvas): one-shot stills/exports (renderScene,
 *   renderAccumSequence). Allocates frame targets per render.
 * - createLiveRenderer(canvas): the live instrument (issue #224, PERFORM).
 *   Persistent GL resources across frames (atlas, grain LUTs, frame targets,
 *   ACCUM feedback); renders through the same renderFrameInto() core as
 *   stills, presents to the visible canvas, and exposes GPU readback for
 *   capture. One instrument, one pipeline.
 */

import {
  QUAD_VS, QUAD_FS, FULL_VS, COMPOSITE_FS, RESOLVE_FS, COPY_FS, UPSCALE_FS,
  blendIdFor,
} from './shaders.mjs';
import { buildProgramChecked, auditProgramChecked } from './debug/diagnostics.mjs';
import { createBridge } from './bridge/bridge.mjs';
import { attachVelocities } from './velocitySmear.mjs';
import { registerBuiltinEffects } from './bridge/builtinEffects.mjs';
import { registerFxShaders, compileFxShaders } from './effects/fxShaders.mjs';
import { createAccum, accumRecipeParams, applyAudioEnvelope } from './accum.mjs';
import { registerCostTier } from './costTiers.mjs';

/**
 * Resolve per-layer mattes (#189, #154 re-plan) to renderable mask specs.
 *
 * Returns Map(layerId -> { sourceId, mode: 'alpha'|'luma', invert } | null).
 * Fail-closed: a matte is ignored (null) when the source is missing, is not
 * a content layer, or the source chain cycles back (self-matte, A↔B, longer
 * loops). The chain is walked only to detect cycles — the mask always
 * renders the *immediate* source's raw group content, never an FX-wrapped
 * or recursively-matted result.
 *
 * Pure (no GL): unit-tested in composite.selfcheck.mjs.
 */
export function resolveLayerMattes(contract) {
  const byId = new Map((contract.layers || []).map((l) => [l.id, l]));
  const out = new Map();
  for (const layer of contract.layers || []) {
    const m = layer.matte;
    let valid = false;
    if (m && typeof m.sourceId === 'string' && m.sourceId) {
      const seen = new Set([layer.id]);
      let cur = m.sourceId;
      for (;;) {
        if (seen.has(cur)) break; // cycle → ignore the matte
        const src = byId.get(cur);
        if (!src || src.type !== 'content') break; // missing / non-content → ignore
        seen.add(cur);
        const next = src.matte && typeof src.matte.sourceId === 'string' ? src.matte.sourceId : '';
        if (!next) { valid = true; break; } // chain ends cleanly
        cur = next; // walk on, cycle-checking
      }
    }
    out.set(
      layer.id,
      valid
        ? { sourceId: m.sourceId, mode: m.mode === 'luma' ? 'luma' : 'alpha', invert: !!m.invert }
        : null
    );
  }
  return out;
}

// All program builds go through the debug harness (#193): a compile/link
// failure throws naming the program, source file, and line number.

function makeTarget(gl, w, h, float16) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  if (float16) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
  } else {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  }
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error('[gl] framebuffer incomplete');
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { tex, fb, w, h };
}

function uploadTexture(gl, pixels, w, h, { mipmap = false, nearest = false, mipmaps = null } = {}) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  if (mipmaps && mipmaps.length > 1) {
    // Explicit CPU-generated mip chain (level 0 already uploaded).
    for (let i = 1; i < mipmaps.length; i++) {
      const m = mipmaps[i];
      gl.texImage2D(gl.TEXTURE_2D, i, gl.RGBA8, m.width, m.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, m.pixels);
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  } else if (mipmap) {
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  } else {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, nearest ? gl.NEAREST : gl.LINEAR);
  }
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, nearest ? gl.NEAREST : gl.LINEAR);
  return tex;
}

/**
 * Standard hue-rotation matrix about the sRGB luminance (gray) axis —
 * the same matrix SVG's feColorMatrix type="hueRotate" uses, so the GL
 * layer path matches the SVG reference (studio/render.mjs).
 *
 * @param {number} deg rotation in degrees (the LAYOUT panel slider unit)
 * @returns {Float32Array} 3x3 in column-major order for uniformMatrix3fv
 * Identity (exactly) when deg is 0 or a multiple of 360.
 */
export function hueRotateMatrix(deg) {
  const rad = ((Number(deg) || 0) % 360) * Math.PI / 180;
  const c = Math.cos(rad), s = Math.sin(rad);
  // Row-major SVG hueRotate matrix...
  const r00 = 0.213 + c * 0.787 - s * 0.213;
  const r01 = 0.715 - c * 0.715 - s * 0.715;
  const r02 = 0.072 - c * 0.072 + s * 0.928;
  const r10 = 0.213 - c * 0.213 + s * 0.143;
  const r11 = 0.715 + c * 0.285 + s * 0.140;
  const r12 = 0.072 - c * 0.072 - s * 0.283;
  const r20 = 0.213 - c * 0.213 - s * 0.787;
  const r21 = 0.715 - c * 0.715 + s * 0.715;
  const r22 = 0.072 + c * 0.928 + s * 0.072;
  // ...stored column-major for uniformMatrix3fv.
  return new Float32Array([r00, r10, r20, r01, r11, r21, r02, r12, r22]);
}
const HUE_IDENTITY = hueRotateMatrix(0); // exact identity: cos=1, sin=0

const hexToRgb = (hex) => {
  const h = hex.replace('#', '');
  const v = h.length <= 4
    ? h.slice(0, 3).split('').map((c) => c + c).join('')
    : h.slice(0, 6);
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255);
};

/**
 * Every renderer-owned GPU program in one table — the single source of
 * truth for what createRenderer builds and what the debug harness audits
 * (#193 second pass). `uniforms` is the exact set the renderer uploads
 * for the program; the checked audit throws if the shader declares
 * anything outside it.
 */
/**
 * Cost-tier declarations (hardening 3/6): the cost lives IN each program
 * definition — the renderer's own programs are structural plumbing
 * (compositing and present), so tier 0, never shed, per the architecture
 * contract. The registry reads the declarations straight out of
 * RENDERER_PROGRAMS; there is no parallel cost-only map.
 */
export const RENDERER_PROGRAMS = [
  {
    key: 'quad', name: 'quad', vs: QUAD_VS, fs: QUAD_FS,
    vsFile: 'shaders.mjs:QUAD_VS', fsFile: 'shaders.mjs:QUAD_FS',
    uniforms: ['u_canvas', 'u_atlas', 'u_smear', 'u_liveTint'],
    cost: { tier: 0, memoryBytes: 1920 * 1080 * 8, timeMs: 0.3,
      notes: 'structural renderer program (composite/present plumbing); never shed' },
  },
  {
    key: 'composite', name: 'composite', vs: FULL_VS, fs: COMPOSITE_FS,
    vsFile: 'shaders.mjs:FULL_VS', fsFile: 'shaders.mjs:COMPOSITE_FS',
    uniforms: ['u_src', 'u_dst', 'u_blend', 'u_opacity', 'u_clip', 'u_clipOn',
      'u_mask', 'u_maskOn', 'u_maskMode', 'u_maskInvert',
      'u_hueOn', 'u_hueMat'], // hueRotate (#262)
    cost: { tier: 0, memoryBytes: 1920 * 1080 * 8, timeMs: 0.3,
      notes: 'structural renderer program (composite/present plumbing); never shed' },
  },
  {
    key: 'resolve', name: 'resolve', vs: FULL_VS, fs: RESOLVE_FS,
    vsFile: 'shaders.mjs:FULL_VS', fsFile: 'shaders.mjs:RESOLVE_FS',
    uniforms: ['u_src'],
    cost: { tier: 0, memoryBytes: 1920 * 1080 * 8, timeMs: 0.3,
      notes: 'structural renderer program (composite/present plumbing); never shed' },
  },
  {
    key: 'copy', name: 'copy', vs: FULL_VS, fs: COPY_FS,
    vsFile: 'shaders.mjs:FULL_VS', fsFile: 'shaders.mjs:COPY_FS',
    uniforms: ['u_src'],
    cost: { tier: 0, memoryBytes: 1920 * 1080 * 8, timeMs: 0.3,
      notes: 'structural renderer program (composite/present plumbing); never shed' },
  },
  {
    // #309: presents the half-res ACCUM feedback pair at backing size
    // (manual bilinear upscale). Tier 0 structural plumbing, never shed.
    key: 'upscale', name: 'upscale', vs: FULL_VS, fs: UPSCALE_FS,
    vsFile: 'shaders.mjs:FULL_VS', fsFile: 'shaders.mjs:UPSCALE_FS',
    uniforms: ['u_src', 'u_srcSize'],
    cost: { tier: 0, memoryBytes: 1920 * 1080 * 8, timeMs: 0.3,
      notes: 'structural renderer program (composite/present plumbing); never shed' },
  },
];

for (const def of RENDERER_PROGRAMS) {
  registerCostTier(`renderer/${def.key}`, def.cost);
}

/**
 * #309 velocity smear amount (QUAD_VS u_smear = (k, max)): each scene-unit
 * of per-frame velocity stretches the instance 6% along its own motion
 * direction, capped at 2x length. Zero velocity is exactly the old path.
 * Fixed recipe constants — no panel, no controls (issue #309 is NEEDS HIS
 * EYES; Matt judges the amount on the live canvas).
 */
export const SMEAR_K = 0.06;
export const SMEAR_MAX = 1.0;

export const comboKey = (asset, tint, accent) => `${asset}|${tint}|${accent}`;


export function packInstanceData(instances, cells, alphaScale = 1) {
  // Spine B (#388): skip instances whose cells[comboKey] is missing instead
  // of throwing. Do not invent UVs; new combos simply do not draw until baked.
  if (!instances || instances.length === 0 || !cells) return new Float32Array(0);

  // 20 floats/instance (80-byte stride): (x,y,sx,sy) (rot,opacity,u0,v0)
  // (u1,v1,vx,vy) (inkR,inkG,inkB,accR) (accG,accB,0,0).
  const maxLen = instances.length;
  const buf = new Float32Array(maxLen * 20);
  let o = 0;
  for (let i = 0; i < maxLen; i++) {
    const it = instances[i];
    // Spine D: fallback supports both live (R/G mask per asset) and offline (baked combos)
    const cell = cells[`${it.asset}|${it.tint}|${it.accent}`] || cells[it.asset];
    if (!cell) continue; // Spine B: skip missing instance, never throw
    buf[o] = it.x; buf[o + 1] = it.y;
    buf[o + 2] = it.scaleX; buf[o + 3] = it.scaleY;
    buf[o + 4] = it.rotation; buf[o + 5] = it.opacity * alphaScale;
    buf[o + 6] = cell.u0; buf[o + 7] = cell.v0;
    buf[o + 8] = cell.u1; buf[o + 9] = cell.v1;
    buf[o + 10] = it.vx || 0; buf[o + 11] = it.vy || 0;
    const ink = hexToRgb(it.tint);
    const acc = hexToRgb(it.accent);
    buf[o + 12] = ink[0]; buf[o + 13] = ink[1]; buf[o + 14] = ink[2]; buf[o + 15] = acc[0];
    buf[o + 16] = acc[1]; buf[o + 17] = acc[2]; buf[o + 18] = 0; buf[o + 19] = 0;
    o += 20;
  }
  if (o === 0) return new Float32Array(0);
  if (o === buf.length) return buf;
  return buf.subarray(0, o);
}

function createRendererBase(canvas, { alpha = false, isLive = false } = {}) {
  const gl = canvas.getContext('webgl2', {
    alpha, antialias: false, depth: false, stencil: false,
    premultipliedAlpha: false, preserveDrawingBuffer: false,
  });
  if (!gl) throw new Error('[gl] WebGL2 not available');
  if (!gl.getExtension('EXT_color_buffer_float')) {
    throw new Error('[gl] EXT_color_buffer_float not available');
  }

  const progs = {};
  for (const def of RENDERER_PROGRAMS) {
    progs[def.key] = buildProgramChecked(gl, def.vs, def.fs, {
      name: def.name, vsFile: def.vsFile, fsFile: def.fsFile,
    });
    // Uniform gate (#193 second pass): the shader may only declare
    // uniforms the renderer uploads. A mismatch throws here — naming the
    // program and file — instead of failing silently mid-render.
    auditProgramChecked(gl, progs[def.key], def.uniforms, {
      name: def.name, file: 'shaders.mjs',
    });
  }
  const quadProg = progs.quad;
  const compProg = progs.composite;
  const resProg = progs.resolve;
  const copyProg = progs.copy;

  // FX chain execution lives in the JS↔GL bridge (#194): programs compile
  // once, uniform uploads are dirty-checked, targets are bridge-owned.
  const bridge = createBridge(gl, canvas, { width: 2, height: 2, dpr: 1 });
  registerBuiltinEffects(bridge);
  registerFxShaders(bridge, gl); // Phase-2 template effects (#188): displace, tear, scanlines, solarize, edge

  const U = (p, n) => gl.getUniformLocation(p, n);

  // Fullscreen quad (two triangles via TRIANGLE_STRIP).
  const fullVbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, fullVbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

  // Instanced quad corners + instance buffer.
  const cornerVbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, cornerVbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  const instVbo = gl.createBuffer();

  function drawFullscreen(prog) {
    gl.bindBuffer(gl.ARRAY_BUFFER, fullVbo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disableVertexAttribArray(0);
  }

  function bindTex(unit, tex) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    return unit;
  }

  /**
   * Composite srcTex over dstTex (ping-pong): reads dstRead, writes dstWrite.
   * blend: blend id from blendIdFor(); opacity: group opacity; clip: [x0,y0,x1,y1] or null.
   * mask: { tex, mode: 'alpha'|'luma', invert } or null — a layer matte (#189).
   * hueRotate: degrees from layer.layout.hueRotate (0 = off) — hue-rotation
   *   color matrix in the shader (#262).
   */
  function composite(prog, u, srcTex, dstRead, dstWrite, blend, opacity, clip, mask = null, hueRotate = 0) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, dstWrite.fb);
    gl.viewport(0, 0, dstWrite.w, dstWrite.h);
    gl.disable(gl.BLEND);
    gl.useProgram(prog);
    gl.uniform1i(u.u_src, bindTex(0, srcTex));
    gl.uniform1i(u.u_dst, bindTex(1, dstRead.tex));
    gl.uniform1i(u.u_blend, blend);
    gl.uniform1f(u.u_opacity, opacity);
    if (clip) {
      gl.uniform4f(u.u_clip, clip[0], clip[1], clip[2], clip[3]);
      gl.uniform1f(u.u_clipOn, 1);
    } else {
      gl.uniform1f(u.u_clipOn, 0);
    }
    // Matte: bind a real texture even when off (the sampler must be valid).
    gl.uniform1i(u.u_mask, bindTex(2, mask ? mask.tex : dstRead.tex));
    gl.uniform1f(u.u_maskOn, mask ? 1 : 0);
    gl.uniform1i(u.u_maskMode, mask && mask.mode === 'luma' ? 1 : 0);
    gl.uniform1f(u.u_maskInvert, mask && mask.invert ? 1 : 0);
    // Hue rotation (#262): branch-gated in the shader so hueRotate=0 is
    // pixel-identical to the pre-#262 path (identity matrix, no arithmetic).
    const hue = Number(hueRotate) || 0;
    gl.uniform1f(u.u_hueOn, hue ? 1 : 0);
    gl.uniformMatrix3fv(u.u_hueMat, false, hue ? hueRotateMatrix(hue) : HUE_IDENTITY);
    drawFullscreen(prog);
  }
  const compU = {
    u_src: U(compProg, 'u_src'), u_dst: U(compProg, 'u_dst'),
    u_blend: U(compProg, 'u_blend'), u_opacity: U(compProg, 'u_opacity'),
    u_clip: U(compProg, 'u_clip'), u_clipOn: U(compProg, 'u_clipOn'),
    u_mask: U(compProg, 'u_mask'), u_maskOn: U(compProg, 'u_maskOn'),
    u_maskMode: U(compProg, 'u_maskMode'), u_maskInvert: U(compProg, 'u_maskInvert'),
    u_hueOn: U(compProg, 'u_hueOn'), u_hueMat: U(compProg, 'u_hueMat'),
  };

  /** Single fullscreen effect pass: reads srcTex, writes dstFb. */
  /** Draw instance list (Float32Array, 12 floats each) into the bound FBO. */
  function drawInstances(data, atlasTex, w, h) {
    if (data.length === 0) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, instVbo);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    gl.useProgram(quadProg);
    gl.uniform2f(U(quadProg, 'u_canvas'), 1000, 700);
    gl.uniform2f(U(quadProg, 'u_smear'), SMEAR_K, SMEAR_MAX);
    gl.uniform1f(U(quadProg, 'u_liveTint'), isLive ? 1.0 : 0.0);
    gl.uniform1i(U(quadProg, 'u_atlas'), bindTex(0, atlasTex));
    gl.bindBuffer(gl.ARRAY_BUFFER, cornerVbo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, instVbo);
    for (let i = 1; i <= 5; i++) {
      gl.enableVertexAttribArray(i);
      gl.vertexAttribPointer(i, 4, gl.FLOAT, false, 80, (i - 1) * 16);
      gl.vertexAttribDivisor(i, 1);
    }
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.blendEquation(gl.FUNC_ADD);
    gl.viewport(0, 0, w, h);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, data.length / 20);
    for (let i = 0; i <= 5; i++) { gl.disableVertexAttribArray(i); gl.vertexAttribDivisor(i, 0); }
    gl.disable(gl.BLEND);
  }

  const instanceData = packInstanceData;

  /**
   * Render one content layer's instances into layerTarget (cleared first).
   * Non-normal per-item blends go through the scratch target (slow but exact).
   * groupOpacity folds into instance alpha (mask bakes; normal layers keep
   * group opacity in the composite pass, matching the SVG <g opacity>).
   */
  function renderLayerInstances(layerTarget, instances, cells, atlasTex, scratch, blendTmp, w, h, groupOpacity = 1) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, layerTarget.fb);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    let batch = [];
    const flush = () => {
      if (batch.length) {
        const data = instanceData(batch, cells, groupOpacity);
        if (data.length) drawInstances(data, atlasTex, w, h);
      }
      batch = [];
    };
    for (const it of instances) {
      const b = (it.blend && it.blend !== 'normal') ? it.blend : 'normal';
      if (b === 'normal') { batch.push(it); continue; }
      const cell = cells ? cells[`${it.asset}|${it.tint}|${it.accent}`] : null;
      if (!cell) continue; // Spine B (#388): cell missing, skip isolated item entirely
      flush();
      // Isolated item: draw to scratch, blend over the layer backdrop.
      gl.bindFramebuffer(gl.FRAMEBUFFER, scratch.fb);
      gl.viewport(0, 0, w, h);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      const data = instanceData([it], cells, groupOpacity);
      if (data.length) drawInstances(data, atlasTex, w, h);
      composite(compProg, compU, scratch.tex, layerTarget, blendTmp, blendIdFor(b), 1, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, layerTarget.fb);
      gl.viewport(0, 0, w, h);
      gl.disable(gl.BLEND);
      gl.useProgram(copyProg);
      gl.uniform1i(U(copyProg, 'u_src'), bindTex(0, blendTmp.tex));
      drawFullscreen(copyProg);
    }
    flush();
  }

  /**
   * Upload the per-render static textures (atlas + grain LUTs). Shared by
   * renderScene and renderAccumSequence — a sequence uploads once.
   */
  function uploadStatic(payload) {
    const atlasTex = uploadTexture(gl, payload.atlas.pixels, payload.atlas.width, payload.atlas.height, { mipmaps: payload.atlas.mipmaps || null });
    const grainLuts = {};
    for (const [id, lut] of Object.entries(payload.grainLuts || {})) {
      grainLuts[id] = uploadTexture(gl, lut.pixels, lut.width, lut.height, { nearest: true });
    }
    return { atlasTex, grainLuts };
  }

  function freeStatic(uploaded) {
    gl.deleteTexture(uploaded.atlasTex);
    for (const k of Object.keys(uploaded.grainLuts)) gl.deleteTexture(uploaded.grainLuts[k]);
  }

  /** Frame targets (16F premultiplied; RGBA8 for final output). */
  function allocFrameTargets(w, h) {
    const layerT = makeTarget(gl, w, h, true);
    const scratchT = makeTarget(gl, w, h, true);
    const blendT = makeTarget(gl, w, h, true);
    const maskT = makeTarget(gl, w, h, true); // layer-matte bakes (#189)
    const mainA = makeTarget(gl, w, h, true);
    const mainB = makeTarget(gl, w, h, true);
    const outT = makeTarget(gl, w, h, false);
    return { layerT, scratchT, blendT, maskT, mainA, mainB, outT };
  }

  function freeFrameTargets(T) {
    for (const t of Object.values(T)) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); }
  }

  /**
   * Composite one scene contract into the main ping-pong.
   * @returns the 16F target holding the frame (one of T.mainA/mainB)
   */
  function renderFrameInto(payload, T, uploaded, { transparent = false } = {}) {
    const { width: w, height: h, contract, cells, bg } = payload;
    const { atlasTex, grainLuts } = uploaded;
    const { layerT, scratchT, blendT, maskT, mainA, mainB } = T;

    const byLayer = new Map();
    for (const it of contract.instances) {
      if (!byLayer.has(it.layer)) byLayer.set(it.layer, []);
      byLayer.get(it.layer).push(it);
    }
    const layerById = new Map(contract.layers.map((l) => [l.id, l]));
    const wrapByFx = new Map((contract.fxWraps || []).map((x) => [x.fxLayerId, x]));
    const matteMap = resolveLayerMattes(contract);

    // Bake a matte source layer's raw group content into maskT (premultiplied).
    // The mask is the source layer's own content over transparent — its blend
    // mode and any matte of its own are ignored (documented #154 semantics);
    // its opacity is baked into the mask alpha.
    const renderMask = (sourceId) => {
      const src = layerById.get(sourceId);
      renderLayerInstances(maskT, byLayer.get(sourceId) || [], cells, atlasTex, scratchT, blendT, w, h, src.opacity);
    };
    const maskFor = (layerId) => {
      const m = matteMap.get(layerId);
      if (!m) return null;
      renderMask(m.sourceId);
      return { tex: maskT.tex, mode: m.mode, invert: m.invert };
    };

    // Main accumulation, ping-ponged.
    let mRead = mainA, mWrite = mainB;
    gl.bindFramebuffer(gl.FRAMEBUFFER, mRead.fb);
    gl.viewport(0, 0, w, h);
    if (transparent) {
      // ACCUM input frames: transparent so the opaque project background
      // owned by accum.begin() shows through; opaque here would erase trails
      // in the OVER pass (s.a=1 -> o=s).
      gl.clearColor(0, 0, 0, 0);
    } else {
      const [br, bgc, bb] = hexToRgb(bg);
      gl.clearColor(br, bgc, bb, 1);
    }
    gl.clear(gl.COLOR_BUFFER_BIT);

    const compositeLayerTo = (layer, instances, dRead, dWrite) => {
      // hueRotate (#262): implemented in the composite shader via the
      // SVG feColorMatrix hue-rotation matrix; 0 is pixel-identical to off.
      const hueRotate = (layer.layout && layer.layout.hueRotate) || 0;
      renderLayerInstances(layerT, instances, cells, atlasTex, scratchT, blendT, w, h);
      composite(
        compProg, compU, layerT.tex, dRead, dWrite,
        blendIdFor(layer.blend), layer.opacity, null, maskFor(layer.id), hueRotate
      );
    };

    let pending = []; // content layers accumulated below the next FX layer (SVG pushAcc fold)
    const flushPendingPlain = () => {
      for (const layer of pending) {
        compositeLayerTo(layer, byLayer.get(layer.id) || [], mRead, mWrite);
        [mRead, mWrite] = [mWrite, mRead];
      }
      pending = [];
    };

    for (const layerId of contract.compositeOrder) {
      const layer = layerById.get(layerId);
      if (!layer) throw new Error(`[gl] compositeOrder references unknown layer ${layerId}`);
      if (layer.type === 'fx') {
        const wrap = wrapByFx.get(layerId);
        if (!wrap) {
          // #192: no silent shed — an FX layer with no wrap is named in
          // contract.shed.fxLayerIds by buildSceneContract (maxFxLayers is
          // retired as a budget, so this is empty in normal operation).
          // Effect-less FX layers also land here: content passes through
          // unwrapped, like the SVG pushAcc.
          for (const pl of pending) {
            compositeLayerTo(pl, byLayer.get(pl.id) || [], mRead, mWrite);
            [mRead, mWrite] = [mWrite, mRead];
          }
          pending = [];
          continue;
        }
        // #227: an FX layer adjusts EVERYTHING below it — seed the wrap with
        // the current main composite (background + lower layers' output,
        // including lower FX layers), then fold the pending content over it.
        // The wrap used to start from transparent, so with multiple FX
        // layers an upper one never saw what the lower ones had done.
        const bt = bridge.layer(layerId);
        let wRead = bt.t0, wWrite = bt.t1;
        gl.bindFramebuffer(gl.FRAMEBUFFER, wRead.fb);
        gl.viewport(0, 0, w, h);
        gl.disable(gl.BLEND);
        gl.useProgram(copyProg);
        gl.uniform1i(U(copyProg, 'u_src'), bindTex(0, mRead.tex));
        drawFullscreen(copyProg);
        for (const pl of pending) {
          compositeLayerTo(pl, byLayer.get(pl.id) || [], wRead, wWrite);
          [wRead, wWrite] = [wWrite, wRead];
        }
        pending = [];
        // The chain runs through the JS↔GL bridge (#194) via the #188 GL
        // compiler: sanitized (unknown kinds dropped, params clamped),
        // grain LUT wired as aux. Template effects (#195) need zero
        // runner changes per effect.
        const steps = compileFxShaders(layer.fx || [], {
          auxFor: (kind) => {
            if (kind !== 'grain') return null;
            const aux = grainLuts[wrap.fxLayerId];
            if (!aux) throw new Error(`[gl] missing grain LUT for wrap ${wrap.fxLayerId}`);
            return aux;
          },
        });
        const afterFx = bridge.runChain(layerId, wRead, steps);
        // An FX layer's own matte masks the wrap result at composite time.
        // #227: no region clip — the FX output is defined over the whole
        // composite below, so clipping to the pending layers' bbox would cut
        // the effect (e.g. an invert would only invert inside the box).
        composite(
          compProg, compU, afterFx.tex, mRead, mWrite,
          blendIdFor('normal'), wrap.opacity, null, maskFor(layerId)
        );
        [mRead, mWrite] = [mWrite, mRead];
        continue;
      }
      pending.push(layer);
    }
    flushPendingPlain();

    // Text runs (glyph atlas) — none in the Phase 1 corpus; fail loudly if present.
    if (contract.textRuns && contract.textRuns.length) {
      throw new Error('[gl] textRuns are not wired into the Phase 1 renderer yet (glyph atlas baker exists; compositing lands with live text)');
    }
    return mRead;
  }

  /** Resolve a 16F premultiplied target to RGBA8 bytes (top-first rows). */
  function resolveTargetToBytes(mRead, T, w, h) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, T.outT.fb);
    gl.viewport(0, 0, w, h);
    gl.disable(gl.BLEND);
    gl.useProgram(resProg);
    gl.uniform1i(U(resProg, 'u_src'), bindTex(0, mRead.tex));
    drawFullscreen(resProg);
    const pixels = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    return pixels;
  }


  function disposeBase() {
    bridge.dispose();
    for (const p of [quadProg, compProg, resProg, copyProg]) gl.deleteProgram(p);
    gl.deleteBuffer(fullVbo); gl.deleteBuffer(cornerVbo); gl.deleteBuffer(instVbo);
  }

  return {
    gl, canvas, bridge, progs, U, bindTex, drawFullscreen,
    composite, drawInstances, instanceData, renderLayerInstances,
    uploadStatic, freeStatic, makeTarget, allocFrameTargets, freeFrameTargets,
    renderFrameInto, resolveTargetToBytes, disposeBase,
  };
}

/**
 * createRenderer(canvas) — one-shot stills/exports. Unchanged API:
 * renderScene(payload) and renderAccumSequence(frames, opts), each
 * allocating frame targets per render.
 */
export function createRenderer(canvas) {
  const b = createRendererBase(canvas, { alpha: false });
  const {
    gl, bridge, uploadStatic, freeStatic,
    allocFrameTargets, freeFrameTargets, renderFrameInto, resolveTargetToBytes,
  } = b;
  /**
   * @param {object} payload
   * @returns {{pixels: Uint8Array, width: number, height: number}} bottom-first RGBA
   */
  function renderScene(payload) {
    const { width: w, height: h, contract } = payload;
    if (contract.version !== 1) throw new Error(`[gl] unsupported contract version ${contract.version}`);
    canvas.width = w; canvas.height = h;
    bridge.resize(w, h, 1);

    const uploaded = uploadStatic(payload);
    const T = allocFrameTargets(w, h);
    try {
      const mRead = renderFrameInto(payload, T, uploaded);
      const pixels = resolveTargetToBytes(mRead, T, w, h);
      const err = gl.getError();
      if (err !== gl.NO_ERROR) throw new Error(`[gl] GL error after render: 0x${err.toString(16)}`);
      return { pixels, width: w, height: h };
    } finally {
      freeFrameTargets(T);
      freeStatic(uploaded);
    }
  }

  /**
   * ACCUM trail still — Phase 4 (#190). Renders each frame contract through
   * renderFrameInto, then feeds the frame texture through the shared ACCUM
   * recipe (app/src/gl/accum.mjs): the SAME code the future live loop and
   * `studio.py render --accum` run. The buffer is off by default — this entry
   * is only called when the caller passes accum-enabled contracts.
   *
   * @param {Array<object>} frames per-frame render payloads (shared atlas)
   * @param {object} opts { fade: 0..0.99, optics: 0..1, background: '#rrggbb' }
   * @returns {{pixels: Uint8Array, width: number, height: number}} top-first RGBA
   */
  function renderAccumSequence(frames, { fade = 0.88, optics = 0, tunnel = 0, prism = 0, flow = 0, echoes = 0, audio = null, swell = 1, background = '#000000' } = {}) {
    if (!frames.length) throw new Error('[gl] renderAccumSequence: no frames');
    const { width: w, height: h, contract } = frames[0];
    if (contract.version !== 1) throw new Error(`[gl] unsupported contract version ${contract.version}`);
    canvas.width = w; canvas.height = h;
    bridge.resize(w, h, 1);

    const uploaded = uploadStatic(frames[0]);
    const T = allocFrameTargets(w, h);
    const accum = createAccum(gl, bridge, { width: w, height: h });
    try {
      accum.begin(background);
      const base = accumRecipeParams({ fade, optics, tunnel, prism, flow, echoes, echoWidth: w, background });
      // #309 velocity smear: per-frame displacement per instance, attached
      // as vx/vy — the stills/export path smears exactly like the live loop.
      const velPrev = new Map();
      let i = 0;
      for (const payload of frames) {
        if (payload.contract.version !== 1) {
          throw new Error(`[gl] unsupported contract version ${payload.contract.version}`);
        }
        attachVelocities(payload.contract.instances, velPrev);
        // Transparent: accum.begin() owns the opaque project background.
        const frameT = renderFrameInto(payload, T, uploaded, { transparent: true });
        // B1: per-frame audio envelope modulates the recipe params.
        // #306: swell scales the glow gesture only (the washout control).
        const params = audio ? applyAudioEnvelope(base, audio[i] || {}, { swell }) : base;
        accum.step(frameT.tex, params);
        i++;
      }
      const pixels = resolveTargetToBytes(accum.texture(), T, w, h);
      const err = gl.getError();
      if (err !== gl.NO_ERROR) throw new Error(`[gl] GL error after accum render: 0x${err.toString(16)}`);
      return { pixels, width: w, height: h };
    } finally {
      accum.dispose();
      freeFrameTargets(T);
      freeStatic(uploaded);
    }
  }

  function dispose() {
    b.disposeBase();
  }

  return { renderScene, renderAccumSequence, dispose };
}


/**
 * createLiveRenderer(canvas) — the live instrument's GPU session (#224).
 *
 * Persistent resources: atlas texture, grain LUT textures, ping-pong frame
 * targets, ACCUM feedback pair. Targets re-allocate only when the render
 * size changes (governor renderScale). Rendering runs through the same
 * renderFrameInto() core as stills, so what plays is what renders.
 *
 * Frame flow per tick:
 *   renderFrame(payload) -> present(target)      // to the visible canvas
 *   readback(target, w, h)                       // GPU pixels for capture
 * Capture never touches preserveDrawingBuffer: readback resolves into the
 * persistent outT FBO, then readPixels — the visible canvas can stay
 * preserveDrawingBuffer:false.
 *
 * #270 — DPR: the scene contract is always in logical 1000×700 scene units
 * (drawInstances maps via u_canvas, so render size and scene units are
 * decoupled — the same trick governor renderScale uses below 1x). The live
 * canvas backing store renders at liveDisplayScale() (capped at 2 for perf)
 * while the CSS layout size is untouched, so retina displays get real
 * pixels, not a CSS upscale. Capture exports pass dprScale: 1 explicitly —
 * export resolution is the caller's choice, never the display's.
 */

/**
 * #270: live canvas display scale. min(devicePixelRatio, 2) — 3x phone
 * panels get 2x (perf), desktop retina gets its native 2x. Pure function
 * of window.devicePixelRatio; call per frame so moving the window across
 * monitors with different DPR re-resolves (ensureTargets reallocs).
 */
export function liveDisplayScale() {
  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  return Math.max(1, Math.min(dpr, 2));
}

export function createLiveRenderer(canvas) {
  const b = createRendererBase(canvas, { alpha: true, isLive: true });
  const { gl, bridge } = b;

  let T = null;
  let TW = 0, TH = 0;
  let atlasTex = null;
  let grainTexs = {};
  let accum = null;

  // #267: last live geometry, so offscreen captures can restore the
  // bridge to exactly the live size after rendering at capture size.
  let liveW = 0, liveH = 0, liveDpr = 1;
  function ensureTargets(w, h, dprScale = 1) {
    // Backing-store (pixel) size: logical render size × dprScale. The CSS
    // layout size never changes — only canvas.width/height (the backing
    // store) and the render targets follow.
    liveW = w; liveH = h; liveDpr = dprScale;
    const bw = Math.max(2, Math.round(w * dprScale));
    const bh = Math.max(2, Math.round(h * dprScale));
    if (T && bw === TW && bh === TH) return;
    if (T) b.freeFrameTargets(T);
    T = b.allocFrameTargets(bw, bh);
    TW = bw; TH = bh;
    // Resizing the canvas clears it; the loop re-renders every frame, so
    // this costs one frame on renderScale changes only.
    if (canvas.width !== bw) canvas.width = bw;
    if (canvas.height !== bh) canvas.height = bh;
    // The bridge allocates its FBOs at W×DPR internally (targetSize), so
    // passing the DPR here keeps its layers in sync with the targets.
    bridge.resize(w, h, dprScale);
    // #309: the ACCUM feedback pair runs at LOGICAL size (resDiv), so it
    // resizes with the logical dimensions, not the backing store.
    if (accum) accum.resize(w, h);
  }

  function setAtlas(pixels, w, h, mipmaps) {
    if (atlasTex) gl.deleteTexture(atlasTex);
    atlasTex = uploadTexture(gl, pixels, w, h, {
      mipmaps: mipmaps && mipmaps.length ? mipmaps : null,
    });
  }

  function setGrainLuts(luts) {
    for (const t of Object.values(grainTexs)) gl.deleteTexture(t);
    grainTexs = {};
    for (const [k, lut] of Object.entries(luts || {})) {
      grainTexs[k] = uploadTexture(gl, lut.pixels, lut.width, lut.height, { nearest: true });
    }
  }

  /**
   * Render one frame into the persistent targets.
   * payload: { width, height, bg, contract, cells, transparent? } —
   *   contract instances are in logical 1000x700 scene units regardless of
   *   width/height (governor renderScale only changes output resolution).
   * dprScale multiplies the backing-store size only (live display path);
   * capture exports pass dprScale: 1 to keep export resolution exact.
   * Returns the target holding the composited frame.
   */
  function renderFrame(payload, { transparent = false, dprScale = liveDisplayScale() } = {}) {
    if (!atlasTex) throw new Error('[gl-live] atlas not uploaded — call setAtlas first');
    ensureTargets(payload.width, payload.height, dprScale);
    // Draw at backing-store size; u_canvas stays 1000×700 so the scene
    // layout is identical — the extra pixels are pure sharpness.
    return b.renderFrameInto({ ...payload, width: TW, height: TH }, T, { atlasTex, grainLuts: grainTexs }, { transparent });
  }

  /** Present a composited target to the visible canvas (Y-flip resolve). */
  function present(target) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.disable(gl.BLEND);
    gl.useProgram(b.progs.resolve);
    gl.uniform1i(b.U(b.progs.resolve, 'u_src'), b.bindTex(0, target.tex));
    b.drawFullscreen(b.progs.resolve);
  }

  /**
   * Present a smaller target — the half-res ACCUM feedback pair (#309) —
   * to the visible canvas. The pair is NEAREST-filtered, so it is upscaled
   * with the manual-bilinear upscale pass (soft, not blocky) into a
   * backing-size scratch target, then presented through the normal Y-flip
   * resolve path. T.mainA is the scratch: renderFrameInto() overwrites it
   * every frame, so there is no cross-frame state.
   */
  function presentUpscaled(target) {
    if (!T) { present(target); return; } // degenerate: no live targets yet
    const up = b.progs.upscale;
    const dst = T.mainA;
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb);
    gl.viewport(0, 0, dst.w, dst.h);
    gl.disable(gl.BLEND);
    gl.useProgram(up);
    gl.uniform1i(b.U(up, 'u_src'), b.bindTex(0, target.tex));
    gl.uniform2f(b.U(up, 'u_srcSize'), target.w, target.h);
    b.drawFullscreen(up);
    present(dst);
  }

  /**
   * GPU readback of a composited target: resolves through RESOLVE_FS into
   * the persistent outT (top-first), then readPixels. Safe with
   * preserveDrawingBuffer:false — never reads the default framebuffer.
   */
  function readback(target, w, h) {
    return b.resolveTargetToBytes(target, T, w, h);
  }

  /** Lazily create (and keep) the ACCUM feedback pair at the render size. */
  let accumDprScale = 1; // the dprScale the feedback pair was built for
  function ensureAccum(w, h, dprScale = liveDisplayScale()) {
    // #309: the feedback pair runs at logical size (resDiv = dprScale). A
    // dprScale change (window moved across monitors) rebuilds the pair at
    // the new ratio — the caller re-begins it, so trails restart cleanly.
    if (accum && accumDprScale !== dprScale) dropAccum();
    ensureTargets(w, h, dprScale);
    if (!accum) {
      accum = createAccum(gl, bridge, { width: w, height: h, resDiv: dprScale });
      accumDprScale = dprScale;
    }
    return accum;
  }

  function dropAccum() {
    if (accum) {
      accum.dispose();
      accum = null;
    }
  }

  // #278 — VJ MIX palette crossfade decks. holdT keeps the outgoing
  // palette's last rendered frame (snapshotted once per dissolve);
  // mixT receives the dissolved output each frame. Both are 16F like the
  // main ping-pong, allocated lazily at the live render size and REUSED
  // across dissolves — no per-dissolve allocation, no per-frame allocation.
  // (One 16F target ≈ 5.6MB at 1000×700; the pair is ~11MB.)
  let holdT = null, mixT = null, mixW = 0, mixH = 0;
  let compU = null;
  const getCompU = () => {
    if (!compU) {
      const p = b.progs.composite;
      compU = {
        u_src: b.U(p, 'u_src'), u_dst: b.U(p, 'u_dst'),
        u_blend: b.U(p, 'u_blend'), u_opacity: b.U(p, 'u_opacity'),
        u_clip: b.U(p, 'u_clip'), u_clipOn: b.U(p, 'u_clipOn'),
        u_mask: b.U(p, 'u_mask'), u_maskOn: b.U(p, 'u_maskOn'),
        u_maskMode: b.U(p, 'u_maskMode'), u_maskInvert: b.U(p, 'u_maskInvert'),
        u_hueOn: b.U(p, 'u_hueOn'), u_hueMat: b.U(p, 'u_hueMat'),
      };
    }
    return compU;
  };
  /** Ensure the deck targets match the live render size. Returns true when (re)allocated. */
  function ensureMixTargets(w, h) {
    if (holdT && mixW === w && mixH === h) return false;
    dropMixTargets();
    holdT = b.makeTarget(gl, w, h, true);
    mixT = b.makeTarget(gl, w, h, true);
    mixW = w; mixH = h;
    return true;
  }
  function dropMixTargets() {
    for (const t of [holdT, mixT]) {
      if (t) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); }
    }
    holdT = null; mixT = null; mixW = 0; mixH = 0;
  }
  /**
   * Snapshot a rendered frame as the dissolve's outgoing deck. Must be
   * called BEFORE the next renderFrameInto (which ping-pongs over the
   * live targets). Returns false when there is nothing valid to hold.
   */
  function snapshotHoldFrame(srcTarget) {
    try {
      if (!srcTarget || !srcTarget.tex || !srcTarget.fb) return false;
      ensureMixTargets(TW, TH);
      gl.bindFramebuffer(gl.FRAMEBUFFER, holdT.fb);
      gl.viewport(0, 0, mixW, mixH);
      gl.disable(gl.BLEND);
      gl.useProgram(b.progs.copy);
      gl.uniform1i(b.U(b.progs.copy, 'u_src'), b.bindTex(0, srcTarget.tex));
      b.drawFullscreen(b.progs.copy);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return true;
    } catch {
      return false;
    }
  }
  /**
   * Dissolve the incoming frame (srcTarget) over the held outgoing deck.
   * t=0 shows the held frame, t=1 the incoming frame — a normal 'over'
   * composite with opacity=t. Returns { target, resized }: resized is true
   * when the deck targets had to be reallocated this call (the held frame
   * is blank) — the caller must cancel the dissolve, never composite
   * against it.
   */
  function mixWithHold(srcTarget, t) {
    const resized = ensureMixTargets(TW, TH);
    const e = Math.min(1, Math.max(0, Number(t) || 0));
    b.composite(
      b.progs.composite, getCompU(), srcTarget.tex, holdT, mixT,
      blendIdFor('normal'), e, null,
    );
    return { target: mixT, resized };
  }

  // #267: dedicated offscreen targets for captures. A capture renders the
  // scene contract at the requested size into its own target set — the live
  // canvas and the shared live targets T are never touched, so the visible
  // canvas can't flash and a running WebM recording never sees a mid-stream
  // resolution jump. The bridge (FX-layer FBOs) is resized to the capture
  // size for the render and restored to the live geometry afterwards, so the
  // next live tick's ensureTargets is a no-op.
  let OT = null, OTW = 0, OTH = 0;
  // #267: the capture size rides in the payload (width/height) — one shape
  // for every caller, so a signature skew can't silently mis-size a capture.
  function renderFrameOffscreen(payload, { transparent = false } = {}) {
    const w = payload.width, h = payload.height;
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0)
      throw new Error(`[gl-live] renderFrameOffscreen needs payload.width/height, got ${w}x${h}`);
    if (!atlasTex) throw new Error('[gl-live] atlas not uploaded — call setAtlas first');
    if (!OT || OTW !== w || OTH !== h) {
      if (OT) b.freeFrameTargets(OT);
      OT = b.allocFrameTargets(w, h);
      OTW = w; OTH = h;
    }
    bridge.resize(w, h, 1);
    try {
      // u_canvas stays 1000×700 (scene layout units) — the extra pixels are
      // pure sharpness, same trick governor renderScale uses below 1x.
      const mRead = b.renderFrameInto(
        { ...payload, width: w, height: h }, OT,
        { atlasTex, grainLuts: grainTexs }, { transparent });
      return b.resolveTargetToBytes(mRead, OT, w, h);
    } finally {
      // A capture can only run after the first live frame (waitForReady), so
      // liveW is set — the guard is belt-and-braces against a 0-size alloc.
      if (liveW > 0 && liveH > 0) bridge.resize(liveW, liveH, liveDpr);
    }
  }

  function dispose() {
    dropAccum();
    dropMixTargets();
    if (atlasTex) gl.deleteTexture(atlasTex);
    for (const t of Object.values(grainTexs)) gl.deleteTexture(t);
    if (T) b.freeFrameTargets(T);
    if (OT) b.freeFrameTargets(OT);
    b.disposeBase();
  }

  return {
    setAtlas, setGrainLuts,
    hasAtlas: () => !!atlasTex,
    renderFrame, renderFrameOffscreen, present, presentUpscaled, readback,
    ensureAccum, dropAccum,
    snapshotHoldFrame, mixWithHold, dropMixTargets,
    getGL: () => gl,
    getBridge: () => bridge,
    dispose,
  };
}

export { accumRecipeParams, applyAudioEnvelope };
