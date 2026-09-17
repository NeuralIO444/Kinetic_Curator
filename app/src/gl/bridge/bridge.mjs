/**
 * JS↔GL bridge contract — order:05 (#194). Browser-safe (no Node imports).
 *
 * The seam between the app and the GPU: how the store's FX layer stack
 * becomes textures and uniforms every frame. This module owns the per-frame
 * chain loop; it contains no effect logic, no blending, and no React.
 *
 * Contract (from #194):
 *
 * - Textures/FBOs are owned by the bridge, not by effects. Two ping-pong
 *   FBOs per FX layer, sized to the canvas (times DPR), plus an optional
 *   padded pair for effects declaring `pad`. Effects never allocate GL
 *   resources.
 * - Programs are compiled once at registration (via the #193 debug
 *   harness, so failures name the program and line); uniform locations
 *   are cached from the program's uniform descriptor.
 * - Uniform upload is dirty-checked: unchanged params don't re-upload.
 *   Per-frame uploads are the known perf trap — this rule exists so
 *   nobody has to discover it twice.
 * - `u_res` always reflects the write FBO's pixel size. DPR changes
 *   resize FBOs, never shaders.
 * - Context loss: `webglcontextlost` → the bridge drops all GL handles
 *   and pauses the chain; `webglcontextrestored` → it recompiles
 *   programs, rebuilds FBOs/textures, and resumes. No reload.
 * - The bridge reads a plain snapshot of FX state (kind/params per
 *   effect); React re-renders never block the frame loop. Compositing
 *   semantics belong to Phase 3 — the bridge hands back the texture.
 *
 * Padded passes (pad > 0): the bridge allocates the padded write FBO and
 * routes padded passes into it. UV remapping for the padded region and
 * the composite crop belong to Phase 2/3 (they need shader cooperation);
 * Phase-1 builtins declare pad: 0, so the static-frame path is unchanged.
 */

import { buildProgramChecked } from '../debug/diagnostics.mjs';

export const BRIDGE_VERSION = 1;

/** RGBA16F target, matching the Phase-1 renderer's working precision. */
function makeTarget(gl, w, h) {
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
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error('[bridge] framebuffer incomplete');
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { tex, fb, w, h };
}

function deleteTarget(gl, t) {
  gl.deleteTexture(t.tex);
  gl.deleteFramebuffer(t.fb);
}

const sameValue = (a, b) => {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
    return a.every((v, i) => v === b[i]);
  }
  return false;
};

const copyValue = (v) => (Array.isArray(v) ? v.slice() : v);

export function createBridge(gl, canvas, { width = 2, height = 2, dpr = 1 } = {}) {
  let W = width, H = height, DPR = dpr;
  let lost = false;

  // Program defs survive context loss (sources needed to recompile);
  // live handles are dropped and rebuilt.
  const programDefs = new Map(); // name -> { vs, fs, uniforms, file }
  const programs = new Map();    // name -> { program, locations: Map }
  const effects = new Map();     // kind -> { program, pad, passes }
  const layers = new Map();      // id -> { t0, t1, padT0, padT1|null, pad }
  const uniformCache = new Map();// `${layerId}` -> Map(uname -> value)
  let vbo = null;

  const stats = {
    programsCompiled: 0,
    targetsAllocated: 0,
    uniformUploads: 0,
    uniformSkips: 0,
    contextLosses: 0,
    framesRun: 0,
  };

  const targetSize = () => ({
    w: Math.max(1, Math.round(W * DPR)),
    h: Math.max(1, Math.round(H * DPR)),
  });

  function allocTarget(w, h) {
    stats.targetsAllocated++;
    return makeTarget(gl, w, h);
  }

  function ensureVbo() {
    if (vbo || lost) return;
    vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    // Fullscreen triangle; FULL_VS maps a_pos via v_cuv = a_pos*0.5+0.5.
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  function drawFullscreen() {
    ensureVbo();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disableVertexAttribArray(0);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  function compileProgram(name) {
    const def = programDefs.get(name);
    const program = buildProgramChecked(gl, def.vs, def.fs, {
      name,
      vsFile: def.file ? `${def.file}:vs` : undefined,
      fsFile: def.file ? `${def.file}:fs` : undefined,
    });
    stats.programsCompiled++;
    return { program, name, locations: new Map() };
  }

  /**
   * Register (and compile) a named program once. Uniform types are
   * declared up front so uploads dispatch to the right setter and
   * typos fail closed: { u_src: { kind: 'sampler', unit: 0 }, u_p: { kind: 'vec4' }, ... }
   * Kinds: 'sampler' | 'int' | 'float' | 'vec2' | 'vec4'.
   */
  function registerProgram(name, vs, fs, { uniforms = {}, file } = {}) {
    if (!programDefs.has(name)) {
      programDefs.set(name, { vs, fs, uniforms, file });
    }
    if (!programs.has(name) && !lost) {
      programs.set(name, compileProgram(name));
    }
    return programs.get(name) || null;
  }

  function locationOf(rec, uname) {
    if (!rec.locations.has(uname)) {
      rec.locations.set(uname, gl.getUniformLocation(rec.program, uname));
    }
    return rec.locations.get(uname); // null when optimized out — skipped
  }

  /**
   * Define an effect kind: which program it runs, its passes, and its
   * edge padding. Pass: { mode, params: (params, ctx) -> [4 numbers] }.
   * ctx carries the write target size ({ width, height }) for
   * resolution-dependent params (e.g. blur sigma).
   */
  function defineEffect(kind, def) {
    if (!programDefs.has(def.program)) {
      throw new Error(`[bridge] defineEffect "${kind}": program "${def.program}" is not registered`);
    }
    effects.set(kind, { pad: 0, ...def });
  }

  /** Per-layer ping-pong targets (bridge-owned). Callers fold layer content into these. */
  function layer(id) {
    let L = layers.get(id);
    const { w, h } = targetSize();
    const maxPad = Math.max(0, ...[...effects.values()].map((e) => e.pad || 0));
    if (!L) {
      L = { t0: allocTarget(w, h), t1: allocTarget(w, h), padT0: null, padT1: null, pad: 0 };
      layers.set(id, L);
    }
    if (maxPad > 0 && L.pad !== maxPad) {
      if (L.padT0) { deleteTarget(gl, L.padT0); deleteTarget(gl, L.padT1); }
      L.padT0 = allocTarget(w + 2 * maxPad, h + 2 * maxPad);
      L.padT1 = allocTarget(w + 2 * maxPad, h + 2 * maxPad);
      L.pad = maxPad;
    }
    return L;
  }

  function setUniform(glType, loc, value) {
    switch (glType.kind) {
      case 'sampler':
        gl.activeTexture(gl.TEXTURE0 + glType.unit);
        gl.bindTexture(gl.TEXTURE_2D, value);
        gl.uniform1i(loc, glType.unit);
        return;
      case 'int': gl.uniform1i(loc, value); return;
      case 'float': gl.uniform1f(loc, value); return;
      case 'vec2': gl.uniform2f(loc, value[0], value[1]); return;
      case 'vec4': gl.uniform4f(loc, value[0], value[1], value[2], value[3]); return;
      default: throw new Error(`[bridge] unknown uniform kind "${glType.kind}"`);
    }
  }

  function uploadUniforms(rec, def, values, cache) {
    for (const [uname, value] of Object.entries(values)) {
      const glType = def.uniforms[uname];
      if (!glType) throw new Error(`[bridge] program "${rec.name}": uniform "${uname}" not declared`);
      const loc = locationOf(rec, uname);
      if (loc == null) { stats.uniformSkips++; continue; } // optimized out of the shader
      const prev = cache.get(uname);
      if (prev !== undefined && sameValue(prev, value)) { stats.uniformSkips++; continue; }
      setUniform(glType, loc, value);
      cache.set(uname, copyValue(value));
      stats.uniformUploads++;
    }
  }

  /**
   * Run an effect chain top-down (per #185): first effect reads the
   * source, each later effect reads the previous pass's output.
   *
   * @param {string} layerId
   * @param {object} readTarget one of layer(layerId).t0/t1 holding the folded content
   * @param {Array<{kind, params, aux}>} steps plain snapshot — no React
   * @param {object} opts { clip: [x0,y0,x1,y1]|null }
   * @returns the target holding the final texture (bridge-owned)
   */
  function runChain(layerId, readTarget, steps, { clip = null } = {}) {
    if (lost) throw new Error('[bridge] context lost — chain paused');
    const L = layer(layerId);
    if (!steps.length) return readTarget;
    let read = readTarget;
    let write = read === L.t0 ? L.t1 : L.t0;
    let cache = uniformCache.get(layerId);
    if (!cache) { cache = new Map(); uniformCache.set(layerId, cache); }
    for (const step of steps) {
      const def = effects.get(step.kind);
      if (!def) throw new Error(`[bridge] unknown effect kind "${step.kind}" — register it with defineEffect first`);
      const rec = programs.get(def.program);
      if (!rec) throw new Error(`[bridge] program "${def.program}" not compiled`);
      for (const pass of def.passes) {
        // Padded passes route into the padded pair (allocated when any
        // registered effect declares pad > 0). UV remapping for the
        // padded region and the composite crop are Phase 2/3 work;
        // Phase-1 builtins declare pad: 0.
        const padded = (def.pad || 0) > 0 && L.padT0;
        const wTarget = padded ? (read === L.padT0 ? L.padT1 : L.padT0) : write;
        gl.bindFramebuffer(gl.FRAMEBUFFER, wTarget.fb);
        gl.viewport(0, 0, wTarget.w, wTarget.h);
        gl.disable(gl.BLEND);
        gl.useProgram(rec.program);
        uploadUniforms(rec, programDefs.get(def.program), {
          u_src: read.tex,
          u_aux: step.aux || read.tex,
          u_effect: pass.mode,
          u_p: pass.params(step.params || {}, { width: wTarget.w, height: wTarget.h }),
          u_texel: [1 / wTarget.w, 1 / wTarget.h],
          u_res: [wTarget.w, wTarget.h],
          ...(clip ? { u_clip: clip, u_clipOn: 1 } : { u_clipOn: 0 }),
        }, cache);
        drawFullscreen();
        read = wTarget;
        write = padded
          ? (wTarget === L.padT0 ? L.padT1 : L.padT0)
          : (wTarget === L.t0 ? L.t1 : L.t0);
      }
    }
    stats.framesRun++;
    return read;
  }

  /**
   * Resize the canvas (times DPR). FBOs are reallocated; programs are
   * never recompiled for a resize. Uniform caches are dropped so
   * resolution-derived uniforms (u_texel/u_res) re-upload.
   */
  function resize(width, height, dpr = 1) {
    W = width; H = height; DPR = dpr;
    const { w, h } = targetSize();
    for (const L of layers.values()) {
      for (const key of ['t0', 't1']) {
        const t = L[key];
        if (t.w !== w || t.h !== h) {
          deleteTarget(gl, t);
          L[key] = allocTarget(w, h);
        }
      }
      if (L.padT0) {
        const pw = w + 2 * L.pad, ph = h + 2 * L.pad;
        if (L.padT0.w !== pw || L.padT0.h !== ph) {
          deleteTarget(gl, L.padT0); deleteTarget(gl, L.padT1);
          L.padT0 = allocTarget(pw, ph); L.padT1 = allocTarget(pw, ph);
        }
      }
    }
    uniformCache.clear();
  }

  function handleContextLost() {
    if (lost) return;
    lost = true;
    for (const rec of programs.values()) gl.deleteProgram(rec.program);
    programs.clear();
    for (const L of layers.values()) {
      deleteTarget(gl, L.t0); deleteTarget(gl, L.t1);
      if (L.padT0) { deleteTarget(gl, L.padT0); deleteTarget(gl, L.padT1); }
    }
    layers.clear();
    if (vbo) { gl.deleteBuffer(vbo); vbo = null; }
    uniformCache.clear();
    stats.contextLosses++;
  }

  function handleContextRestored() {
    if (!lost) return;
    lost = false;
    for (const name of programDefs.keys()) programs.set(name, compileProgram(name));
    // Targets rebuild lazily on next layer()/runChain() at current size.
  }

  const onLost = (e) => { if (e && e.preventDefault) e.preventDefault(); handleContextLost(); };
  const onRestored = () => handleContextRestored();
  if (canvas && typeof canvas.addEventListener === 'function') {
    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);
  }

  function dispose() {
    handleContextLost();
    if (canvas && typeof canvas.removeEventListener === 'function') {
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
    }
    programDefs.clear();
    effects.clear();
    lost = false;
  }

  return {
    version: BRIDGE_VERSION,
    registerProgram,
    defineEffect,
    layer,
    runChain,
    resize,
    handleContextLost,
    handleContextRestored,
    stats: () => ({ ...stats }),
    get lost() { return lost; },
    dispose,
  };
}
