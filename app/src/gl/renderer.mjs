/**
 * WebGL2 scene renderer — Phase 1 (#187). Browser-safe (no Node imports).
 *
 * Consumes the Phase 0 scene contract (docs/GL_CONTRACT.md, v1) and renders
 * it to RGBA pixels for the parity harness. Structure mirrors the SVG
 * reference path (studio/render.mjs):
 *
 * - bg clear (palette bg, opaque)
 * - one 16F FBO per content layer: instanced textured quads, premultiplied
 *   "over" compositing, per-item blend fallback via scratch FBO
 * - layer -> target compositing with full CSS blend modes + group opacity
 * - FX wrap groups: content layers folded into a wrap FBO (same as the
 *   SVG <g filter> fold), effect chain as fullscreen passes, SVG filter-
 *   region clipping, then compositing with the wrap opacity
 * - final resolve to RGBA8 premultiplied bytes (resvg's pixel convention)
 *
 * Animated params (life/beat) are buffer updates by construction: per-frame
 * work is instance-buffer upload + draw calls, never placement rebuilds.
 * (Static-frame parity is this phase's acceptance; the live loop lands later.)
 */

import {
  QUAD_VS, QUAD_FS, FULL_VS, COMPOSITE_FS, EFFECT_FS, RESOLVE_FS, COPY_FS,
  BLEND_IDS, EFFECT_IDS,
} from './shaders.mjs';

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`[gl] shader compile failed: ${log}\n---\n${src.slice(0, 400)}`);
  }
  return sh;
}

function program(gl, vsSrc, fsSrc) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vsSrc));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fsSrc));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(`[gl] program link failed: ${gl.getProgramInfoLog(p)}`);
  }
  return p;
}

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

  const quadProg = program(gl, QUAD_VS, QUAD_FS);
  const compProg = program(gl, FULL_VS, COMPOSITE_FS);
  const fxProg = program(gl, FULL_VS, EFFECT_FS);
  const resProg = program(gl, FULL_VS, RESOLVE_FS);
  const copyProg = program(gl, FULL_VS, COPY_FS);

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
   * blend: BLEND_IDS value; opacity: group opacity; clip: [x0,y0,x1,y1] or null.
   */
  function composite(prog, u, srcTex, dstRead, dstWrite, blend, opacity, clip) {
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
    drawFullscreen(prog);
  }
  const compU = {
    u_src: U(compProg, 'u_src'), u_dst: U(compProg, 'u_dst'),
    u_blend: U(compProg, 'u_blend'), u_opacity: U(compProg, 'u_opacity'),
    u_clip: U(compProg, 'u_clip'), u_clipOn: U(compProg, 'u_clipOn'),
  };

  /** Single fullscreen effect pass: reads srcTex, writes dstFb. */
  function effectPass(u, fx, srcTex, dstFb, params, clip, auxTex, w, h) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, dstFb);
    gl.viewport(0, 0, w, h);
    gl.disable(gl.BLEND);
    gl.useProgram(fxProg);
    gl.uniform1i(u.u_src, bindTex(0, srcTex));
    gl.uniform1i(u.u_aux, bindTex(1, auxTex || srcTex));
    gl.uniform1i(u.u_effect, fx);
    gl.uniform4f(u.u_p, params[0], params[1] || 0, params[2] || 0, params[3] || 0);
    gl.uniform2f(u.u_texel, 1 / w, 1 / h);
    if (clip) {
      gl.uniform4f(u.u_clip, clip[0], clip[1], clip[2], clip[3]);
      gl.uniform1f(u.u_clipOn, 1);
    } else {
      gl.uniform1f(u.u_clipOn, 0);
    }
    drawFullscreen(fxProg);
  }
  const fxU = {
    u_src: U(fxProg, 'u_src'), u_aux: U(fxProg, 'u_aux'),
    u_effect: U(fxProg, 'u_effect'), u_p: U(fxProg, 'u_p'),
    u_texel: U(fxProg, 'u_texel'), u_clip: U(fxProg, 'u_clip'), u_clipOn: U(fxProg, 'u_clipOn'),
  };

  /** Draw instance list (Float32Array, 10 floats each) into the bound FBO. */
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
      gl.vertexAttribPointer(i, 4, gl.FLOAT, false, 40, (i - 1) * 16);
      gl.vertexAttribDivisor(i, 1);
    }
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.blendEquation(gl.FUNC_ADD);
    gl.viewport(0, 0, w, h);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, data.length / 10);
    for (let i = 0; i <= 3; i++) { gl.disableVertexAttribArray(i); gl.vertexAttribDivisor(i, 0); }
    gl.disable(gl.BLEND);
  }

  const comboKey = (asset, tint, accent) => `${asset}|${tint}|${accent}`;

  function instanceData(instances, cells) {
    const out = new Float32Array(instances.length * 10);
    instances.forEach((it, i) => {
      const cell = cells[comboKey(it.asset, it.tint, it.accent)];
      if (!cell) throw new Error(`[gl] no atlas cell for ${comboKey(it.asset, it.tint, it.accent)}`);
      const o = i * 10;
      out[o] = it.x; out[o + 1] = it.y;
      out[o + 2] = it.scaleX; out[o + 3] = it.scaleY;
      out[o + 4] = it.rotation; out[o + 5] = it.opacity;
      out[o + 6] = cell.u0; out[o + 7] = cell.v0;
      out[o + 8] = cell.u1; out[o + 9] = cell.v1;
    });
    return out;
  }

  /**
   * Render one content layer's instances into layerTarget (cleared first).
   * Non-normal per-item blends go through the scratch target (slow but exact).
   */
  function renderLayerInstances(layerTarget, instances, cells, atlasTex, scratch, blendTmp, w, h) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, layerTarget.fb);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    let batch = [];
    const flush = () => {
      if (batch.length) drawInstances(instanceData(batch, cells), atlasTex, w, h);
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
      drawInstances(instanceData([it], cells), atlasTex, w, h);
      const id = BLEND_IDS[b];
      if (id == null) throw new Error(`[gl] unknown blend mode "${b}"`);
      composite(compProg, compU, scratch.tex, layerTarget, blendTmp, id, 1, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, layerTarget.fb);
      gl.viewport(0, 0, w, h);
      gl.disable(gl.BLEND);
      gl.useProgram(copyProg);
      gl.uniform1i(U(copyProg, 'u_src'), bindTex(0, blendTmp.tex));
      drawFullscreen(copyProg);
    }
    flush();
  }

  function applyEffectChain(wrap, fxList, acc, tmp, grainLuts, w, h, clip) {
    let read = acc, write = tmp;
    for (const fx of fxList) {
      if (fx.kind === 'blur') {
        const sigma = Math.max(0.5, (fx.params.radius || 0) * (w / 1000));
        const params = [sigma];
        effectPass(fxU, EFFECT_IDS.blurH, read.tex, write.fb, params, clip, null, w, h);
        [read, write] = [write, read];
        effectPass(fxU, EFFECT_IDS.blurV, read.tex, write.fb, params, clip, null, w, h);
        [read, write] = [write, read];
        continue;
      }
      const id = EFFECT_IDS[fx.kind];
      if (id == null) throw new Error(`[gl] Phase 1 cannot render effect "${fx.kind}" (lands in Phase 2, #188)`);
      let params = [0], aux = null;
      if (fx.kind === 'rgbSplit') params = [(fx.params.dx || 0) / 1000];
      else if (fx.kind === 'grain') {
        params = [fx.params.amount ?? 0.4];
        aux = grainLuts[wrap.fxLayerId];
        if (!aux) throw new Error(`[gl] missing grain LUT for wrap ${wrap.fxLayerId}`);
      } else if (fx.kind === 'posterize') params = [fx.params.levels || 4];
      effectPass(fxU, id, read.tex, write.fb, params, clip, aux, w, h);
      [read, write] = [write, read];
    }
    return read;
  }

  /**
   * @param {object} payload
   * @returns {{pixels: Uint8Array, width: number, height: number}} bottom-first RGBA
   */
  function renderScene(payload) {
    const { width: w, height: h, contract, cells, bg } = payload;
    if (contract.version !== 1) throw new Error(`[gl] unsupported contract version ${contract.version}`);
    canvas.width = w; canvas.height = h;

    const atlasTex = uploadTexture(gl, payload.atlas.pixels, payload.atlas.width, payload.atlas.height, { mipmaps: payload.atlas.mipmaps || null });
    const grainLuts = {};
    for (const [id, lut] of Object.entries(payload.grainLuts || {})) {
      grainLuts[id] = uploadTexture(gl, lut.pixels, lut.width, lut.height, { nearest: true });
    }

    // Targets (16F premultiplied; RGBA8 for final output).
    const layerT = makeTarget(gl, w, h, true);
    const scratchT = makeTarget(gl, w, h, true);
    const blendT = makeTarget(gl, w, h, true);
    const mainA = makeTarget(gl, w, h, true);
    const mainB = makeTarget(gl, w, h, true);
    const outT = makeTarget(gl, w, h, false);
    const targets = [layerT, scratchT, blendT, mainA, mainB, outT];

    const byLayer = new Map();
    for (const it of contract.instances) {
      if (!byLayer.has(it.layer)) byLayer.set(it.layer, []);
      byLayer.get(it.layer).push(it);
    }
    const layerById = new Map(contract.layers.map((l) => [l.id, l]));
    const wrapByFx = new Map((contract.fxWraps || []).map((x) => [x.fxLayerId, x]));

    // Main accumulation, ping-ponged.
    let mRead = mainA, mWrite = mainB;
    gl.bindFramebuffer(gl.FRAMEBUFFER, mRead.fb);
    gl.viewport(0, 0, w, h);
    const [br, bgc, bb] = hexToRgb(bg);
    gl.clearColor(br, bgc, bb, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const compositeLayerTo = (layer, instances, dRead, dWrite) => {
      if (layer.layout && layer.layout.hueRotate) {
        throw new Error('[gl] layer hueRotate is not implemented in Phase 1');
      }
      renderLayerInstances(layerT, instances, cells, atlasTex, scratchT, blendT, w, h);
      const blendId = BLEND_IDS[layer.blend] ?? BLEND_IDS.normal;
      composite(compProg, compU, layerT.tex, dRead, dWrite, blendId, layer.opacity, null);
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
        if (!wrap || !wrap.contentLayerIds.length) { pending = []; continue; }
        // Fold the pending content layers into the wrap FBO.
        const wrapA = makeTarget(gl, w, h, true);
        const wrapB = makeTarget(gl, w, h, true);
        targets.push(wrapA, wrapB);
        let wRead = wrapA, wWrite = wrapB;
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
        const afterFx = applyEffectChain(wrap, layer.fx || [], wRead, wWrite, grainLuts, w, h, null);
        composite(compProg, compU, afterFx.tex, mRead, mWrite, BLEND_IDS.normal, wrap.opacity, clip);
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

    // Resolve to RGBA8 premultiplied bytes.
    gl.bindFramebuffer(gl.FRAMEBUFFER, outT.fb);
    gl.viewport(0, 0, w, h);
    gl.disable(gl.BLEND);
    gl.useProgram(resProg);
    gl.uniform1i(U(resProg, 'u_src'), bindTex(0, mRead.tex));
    drawFullscreen(resProg);
    const pixels = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    for (const t of targets) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); }
    gl.deleteTexture(atlasTex);
    for (const k of Object.keys(grainLuts)) gl.deleteTexture(grainLuts[k]);

    const err = gl.getError();
    if (err !== gl.NO_ERROR) throw new Error(`[gl] GL error after render: 0x${err.toString(16)}`);
    return { pixels, width: w, height: h };
  }

  function dispose() {
    for (const p of [quadProg, compProg, fxProg, resProg, copyProg]) gl.deleteProgram(p);
    gl.deleteBuffer(fullVbo); gl.deleteBuffer(cornerVbo); gl.deleteBuffer(instVbo);
  }

  return { renderScene, dispose };
}
