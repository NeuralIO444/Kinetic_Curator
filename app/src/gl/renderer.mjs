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
 * (Static-frame parity is this phase's acceptance; the live loop lands later.)
 */

import {
  QUAD_VS, QUAD_FS, FULL_VS, COMPOSITE_FS, RESOLVE_FS, COPY_FS,
  blendIdFor,
} from './shaders.mjs';
import { buildProgramChecked } from './debug/diagnostics.mjs';
import { createBridge } from './bridge/bridge.mjs';
import { registerBuiltinEffects } from './bridge/builtinEffects.mjs';
import { registerFxShaders, compileFxShaders } from './effects/fxShaders.mjs';
import { createAccum, accumRecipeParams } from './accum.mjs';

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

const hexToRgb = (hex) => {
  const h = hex.replace('#', '');
  const v = h.length <= 4
    ? h.slice(0, 3).split('').map((c) => c + c).join('')
    : h.slice(0, 6);
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255);
};

export function createRenderer(canvas) {
  const gl = canvas.getContext('webgl2', {
    alpha: false, antialias: false, depth: false, stencil: false,
    premultipliedAlpha: false, preserveDrawingBuffer: false,
  });
  if (!gl) throw new Error('[gl] WebGL2 not available');
  if (!gl.getExtension('EXT_color_buffer_float')) {
    throw new Error('[gl] EXT_color_buffer_float not available');
  }

  const quadProg = buildProgramChecked(gl, QUAD_VS, QUAD_FS, { name: 'quad', vsFile: 'shaders.mjs:QUAD_VS', fsFile: 'shaders.mjs:QUAD_FS' });
  const compProg = buildProgramChecked(gl, FULL_VS, COMPOSITE_FS, { name: 'composite', vsFile: 'shaders.mjs:FULL_VS', fsFile: 'shaders.mjs:COMPOSITE_FS' });
  const resProg = buildProgramChecked(gl, FULL_VS, RESOLVE_FS, { name: 'resolve', vsFile: 'shaders.mjs:FULL_VS', fsFile: 'shaders.mjs:RESOLVE_FS' });
  const copyProg = buildProgramChecked(gl, FULL_VS, COPY_FS, { name: 'copy', vsFile: 'shaders.mjs:FULL_VS', fsFile: 'shaders.mjs:COPY_FS' });

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
   */
  function composite(prog, u, srcTex, dstRead, dstWrite, blend, opacity, clip, mask = null) {
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
    drawFullscreen(prog);
  }
  const compU = {
    u_src: U(compProg, 'u_src'), u_dst: U(compProg, 'u_dst'),
    u_blend: U(compProg, 'u_blend'), u_opacity: U(compProg, 'u_opacity'),
    u_clip: U(compProg, 'u_clip'), u_clipOn: U(compProg, 'u_clipOn'),
    u_mask: U(compProg, 'u_mask'), u_maskOn: U(compProg, 'u_maskOn'),
    u_maskMode: U(compProg, 'u_maskMode'), u_maskInvert: U(compProg, 'u_maskInvert'),
  };

  /** Single fullscreen effect pass: reads srcTex, writes dstFb. */
  /** Draw instance list (Float32Array, 12 floats each) into the bound FBO. */
  function drawInstances(data, atlasTex, w, h) {
    if (data.length === 0) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, instVbo);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    gl.useProgram(quadProg);
    gl.uniform2f(U(quadProg, 'u_canvas'), 1000, 700);
    gl.uniform1i(U(quadProg, 'u_atlas'), bindTex(0, atlasTex));
    gl.bindBuffer(gl.ARRAY_BUFFER, cornerVbo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, instVbo);
    for (let i = 1; i <= 3; i++) {
      gl.enableVertexAttribArray(i);
      gl.vertexAttribPointer(i, 4, gl.FLOAT, false, 48, (i - 1) * 16);
      gl.vertexAttribDivisor(i, 1);
    }
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.blendEquation(gl.FUNC_ADD);
    gl.viewport(0, 0, w, h);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, data.length / 12);
    for (let i = 0; i <= 3; i++) { gl.disableVertexAttribArray(i); gl.vertexAttribDivisor(i, 0); }
    gl.disable(gl.BLEND);
  }

  const comboKey = (asset, tint, accent) => `${asset}|${tint}|${accent}`;

  function instanceData(instances, cells, alphaScale = 1) {
    // 12 floats/instance (48-byte stride): (x,y,sx,sy) (rot,opacity,u0,v0) (u1,v1,0,0).
    // The trailing pad keeps attribute 3's vec4 fetch inside the buffer —
    // ANGLE/Metal raises INVALID_OPERATION for out-of-bounds attrib reads.
    // alphaScale folds a group opacity into per-instance alpha (mask bakes, #189).
    const out = new Float32Array(instances.length * 12);
    instances.forEach((it, i) => {
      const cell = cells[comboKey(it.asset, it.tint, it.accent)];
      if (!cell) throw new Error(`[gl] no atlas cell for ${comboKey(it.asset, it.tint, it.accent)}`);
      const o = i * 12;
      out[o] = it.x; out[o + 1] = it.y;
      out[o + 2] = it.scaleX; out[o + 3] = it.scaleY;
      out[o + 4] = it.rotation; out[o + 5] = it.opacity * alphaScale;
      out[o + 6] = cell.u0; out[o + 7] = cell.v0;
      out[o + 8] = cell.u1; out[o + 9] = cell.v1;
    });
    return out;
  }

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
      if (batch.length) drawInstances(instanceData(batch, cells, groupOpacity), atlasTex, w, h);
      batch = [];
    };
    for (const it of instances) {
      const b = (it.blend && it.blend !== 'normal') ? it.blend : 'normal';
      if (b === 'normal') { batch.push(it); continue; }
      flush();
      // Isolated item: draw to scratch, blend over the layer backdrop.
      gl.bindFramebuffer(gl.FRAMEBUFFER, scratch.fb);
      gl.viewport(0, 0, w, h);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      drawInstances(instanceData([it], cells, groupOpacity), atlasTex, w, h);
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
      if (layer.layout && layer.layout.hueRotate) {
        throw new Error('[gl] layer hueRotate is not implemented in Phase 1');
      }
      renderLayerInstances(layerT, instances, cells, atlasTex, scratchT, blendT, w, h);
      composite(
        compProg, compU, layerT.tex, dRead, dWrite,
        blendIdFor(layer.blend), layer.opacity, null, maskFor(layer.id)
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
        if (!wrap || !wrap.contentLayerIds.length) {
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
        // Fold the pending content layers into the bridge's ping-pong targets.
        const bt = bridge.layer(layerId);
        let wRead = bt.t0, wWrite = bt.t1;
        gl.bindFramebuffer(gl.FRAMEBUFFER, wRead.fb);
        gl.viewport(0, 0, w, h);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        for (const pl of pending) {
          compositeLayerTo(pl, byLayer.get(pl.id) || [], wRead, wWrite);
          [wRead, wWrite] = [wWrite, wRead];
        }
        pending = [];
        const clip = (payload.wrapBoxes || {})[wrap.fxLayerId] || null;
        // Effect passes run unclipped (SVG primitives see the unclipped
        // input; only the final filter output is region-clipped). The clip
        // is applied once, on the wrap->main composite below.
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
        composite(
          compProg, compU, afterFx.tex, mRead, mWrite,
          blendIdFor('normal'), wrap.opacity, clip, maskFor(layerId)
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
  function renderAccumSequence(frames, { fade = 0.88, optics = 0, background = '#000000' } = {}) {
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
      const params = accumRecipeParams({ fade, optics });
      for (const payload of frames) {
        if (payload.contract.version !== 1) {
          throw new Error(`[gl] unsupported contract version ${payload.contract.version}`);
        }
        // Transparent: accum.begin() owns the opaque project background.
        const frameT = renderFrameInto(payload, T, uploaded, { transparent: true });
        accum.step(frameT.tex, params);
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
    bridge.dispose();
    for (const p of [quadProg, compProg, resProg, copyProg]) gl.deleteProgram(p);
    gl.deleteBuffer(fullVbo); gl.deleteBuffer(cornerVbo); gl.deleteBuffer(instVbo);
  }

  return { renderScene, renderAccumSequence, dispose };
}
