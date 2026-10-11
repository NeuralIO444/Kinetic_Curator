// fieldRunner.js — transform-feedback field runner (#1315).
//
// Evaluates registered dish fields on the GPU (WebGL2 now, WebGPU later per
// docs/design/gpu-field-eval.md). This slice wires ONE field (noise); the
// rest port in #1316.
//
// Design notes:
// - SoA in, SoA out: position columns upload as two scalar attributes
//   (a_x, a_y) — never interleaved, never repacked. The field value comes
//   back as one flat float column, either read back to the CPU
//   (readback: true — the honest cost, budgeted per field) or kept on the
//   GPU for a later render pass (readback: false).
// - FIELD_BACKEND: 'js' (default) | 'gpu'. Every GPU field keeps its JS
//   implementation forever; the runner falls back to JS for fields without
//   a gpu twin. The flag is a runtime-only module variable — it is never
//   serialized into recipes/bundles, and stills/replay always use the CPU
//   path (the live render path does not call this module at all in this
//   slice; the runner is harness-driven only until parity is proven).
// - Node-import-safe: WebGL is touched only inside functions that receive
//   an explicit context. The registry integration below runs at import time
//   in both Node and the browser (pure data, no DOM).

import { FIELDS } from '../../engine/kernel/field/registry.js';
import { makeNoiseField, NOISE_FIELD_DEFAULTS } from '../../engine/kernel/field/index.js';
import { permTableFor } from '../../engine/noise.js';
import { NOISE_FIELD_GPU, NOISE_FIELD_MAX_OCTAVES } from './noiseField.glsl.js';

// ── backend flag ──────────────────────────────────────────────────────────

/** Backends a field evaluation may use. */
export const FIELD_BACKENDS = Object.freeze(['js', 'gpu']);

let fieldBackend = 'js';

/** Current field backend. Default 'js' — the byte-identical path. */
export function getFieldBackend() {
  return fieldBackend;
}

/**
 * Opt into (or out of) GPU field evaluation for this session.
 * Never persisted: stills and replay always use 'js', enforced by the fact
 * that no still/replay code path calls setFieldBackend or the runner.
 */
export function setFieldBackend(b) {
  if (!FIELD_BACKENDS.includes(b)) {
    throw new Error(`[fieldRunner] unknown field backend "${String(b)}" (want 'js' | 'gpu')`);
  }
  fieldBackend = b;
  return fieldBackend;
}

// ── registry integration (ONE field this slice) ───────────────────────────
//
// The kernel registry entry for 'noise' is re-declared here with its GPU
// twin attached. The declaration signature (id/reads/writes/costTier) is
// identical to the kernel-side one, so the registry's HMR-tolerant
// re-declaration rule treats it as a no-op refresh that carries the extra
// `gpu` payload — and the kernel→gl import boundary (#1239) stays intact
// because the arrow points gl→kernel.
FIELDS.register({
  id: 'noise',
  gpu: { ...NOISE_FIELD_GPU },
  create: (seed, opts) => makeNoiseField(seed >>> 0, opts),
});

// Per-field uniform defaults for the GPU path, so uniform resolution can
// never drift from the JS field's destructuring defaults. #1316 generalizes
// this table as more fields declare gpu twins.
const GPU_OPT_DEFAULTS = { noise: NOISE_FIELD_DEFAULTS };

// ── runner ────────────────────────────────────────────────────────────────

function isFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Create a transform-feedback field runner around an explicit WebGL2
 * context. Throws when the context cannot do transform feedback.
 *
 * @param {WebGL2RenderingContext} gl
 * @returns {{ runField, release, dispose }}
 */
export function createFieldRunner(gl) {
  if (!gl || typeof gl.transformFeedbackVaryings !== 'function') {
    throw new Error('[fieldRunner] WebGL2 with transform feedback is required');
  }

  const programs = new Map(); // fieldId -> { program, aX, aY, uPerm, uFreq, uZ, uOct, uLac, uGain }
  const permTextures = new Map(); // seed >>> 0 -> WebGLTexture
  const liveOutputs = new Set(); // gpuBuffers handed out with readback:false

  function compileShader(type, source, label) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, source);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh) || '(no log)';
      gl.deleteShader(sh);
      throw new Error(`[fieldRunner] ${label} compile failed: ${log}`);
    }
    return sh;
  }

  function programFor(fieldId) {
    let rec = programs.get(fieldId);
    if (rec) return rec;
    const decl = FIELDS.get(fieldId);
    if (!decl) throw new Error(`[fieldRunner] unknown field "${fieldId}"`);
    if (!decl.gpu) throw new Error(`[fieldRunner] field "${fieldId}" has no GPU twin`);
    const { vertexShader, fragmentShader, varyings } = decl.gpu;

    const vs = compileShader(gl.VERTEX_SHADER, vertexShader, `${fieldId} vertex`);
    let fs = null;
    try {
      if (fragmentShader) fs = compileShader(gl.FRAGMENT_SHADER, fragmentShader, `${fieldId} fragment`);
      const program = gl.createProgram();
      gl.attachShader(program, vs);
      if (fs) gl.attachShader(program, fs);
      // MUST precede linkProgram — the capture list is baked at link time.
      gl.transformFeedbackVaryings(program, [...varyings], gl.SEPARATE_ATTRIBS);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(`[fieldRunner] ${fieldId} link failed: ${gl.getProgramInfoLog(program) || '(no log)'}`);
      }
      const need = (loc, name) => {
        if (loc === -1 || loc === null || loc === undefined) {
          throw new Error(`[fieldRunner] ${fieldId}: shader/program contract mismatch — missing "${name}"`);
        }
        return loc;
      };
      rec = {
        program,
        aX: need(gl.getAttribLocation(program, 'a_x'), 'a_x'),
        aY: need(gl.getAttribLocation(program, 'a_y'), 'a_y'),
        uPerm: need(gl.getUniformLocation(program, 'u_perm'), 'u_perm'),
        uFreq: need(gl.getUniformLocation(program, 'u_freq'), 'u_freq'),
        uZ: need(gl.getUniformLocation(program, 'u_z'), 'u_z'),
        uOct: need(gl.getUniformLocation(program, 'u_octaves'), 'u_octaves'),
        uLac: need(gl.getUniformLocation(program, 'u_lacunarity'), 'u_lacunarity'),
        uGain: need(gl.getUniformLocation(program, 'u_gain'), 'u_gain'),
      };
      programs.set(fieldId, rec);
      return rec;
    } finally {
      gl.deleteShader(vs);
      if (fs) gl.deleteShader(fs);
    }
  }

  function permTextureFor(seed) {
    const key = seed >>> 0;
    let tex = permTextures.get(key);
    if (tex) return tex;
    tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // Exact perm bytes — the shader hashes exactly like JS (see
    // fieldCommon.glsl.js); only float32 rounding diverges.
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.R8UI, 512, 1, 0,
      gl.RED_INTEGER, gl.UNSIGNED_BYTE, permTableFor(key),
    );
    permTextures.set(key, tex);
    return tex;
  }

  function uploadColumn(data, n, attrib) {
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, n), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(attrib);
    gl.vertexAttribPointer(attrib, 1, gl.FLOAT, false, 0, 0);
    return buf;
  }

  /**
   * Run one GPU-registered field over SoA position columns.
   *
   * @param {string} fieldId            registered field with a gpu twin
   * @param {number} seed
   * @param {object} [opts]             field opts (freq, octaves, lacunarity, gain, z)
   * @param {{x: Float32Array, y: Float32Array, count?: number}} columns
   * @param {{readback?: boolean}} [runOpts]  true (default): return CPU values;
   *        false: keep the result on the GPU (caller must release())
   * @returns {{ values: Float32Array|null, gpuBuffer: WebGLBuffer|null, count: number }}
   */
  function runField(fieldId, seed, opts, columns, runOpts = {}) {
    const decl = FIELDS.get(fieldId);
    if (!decl) throw new Error(`[fieldRunner] unknown field "${fieldId}"`);
    if (!decl.gpu) {
      throw new Error(`[fieldRunner] field "${fieldId}" has no GPU twin — use evaluateFieldColumns for the JS fallback`);
    }
    const { x, y } = columns || {};
    if (!(x instanceof Float32Array) || !(y instanceof Float32Array)) {
      throw new Error('[fieldRunner] columns x/y must be Float32Array (SoA contract)');
    }
    const n = columns.count === undefined ? x.length : columns.count;
    if (!Number.isInteger(n) || n < 1 || n > x.length || n > y.length) {
      throw new Error(`[fieldRunner] bad lane count ${String(columns.count)} for columns of length ${x.length}/${y.length}`);
    }

    const defaults = GPU_OPT_DEFAULTS[fieldId] || {};
    const o = { ...defaults, ...(opts || {}) };
    if (!isFiniteNumber(o.freq) || !isFiniteNumber(o.z) ||
        !isFiniteNumber(o.lacunarity) || !isFiniteNumber(o.gain)) {
      throw new Error(`[fieldRunner] ${fieldId}: freq/z/lacunarity/gain must be finite numbers`);
    }
    if (!Number.isInteger(o.octaves) || o.octaves < 1 || o.octaves > NOISE_FIELD_MAX_OCTAVES) {
      // Documented boundary: the shader loop is bounded (see
      // fieldCommon.glsl.js); wider fields stay on the JS implementation.
      throw new Error(
        `[fieldRunner] ${fieldId}: octaves ${String(o.octaves)} outside GPU range 1..${NOISE_FIELD_MAX_OCTAVES} — use the JS backend`,
      );
    }

    const rec = programFor(fieldId);
    gl.useProgram(rec.program);

    const bufX = uploadColumn(x, n, rec.aX);
    const bufY = uploadColumn(y, n, rec.aY);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, permTextureFor(seed));
    gl.uniform1i(rec.uPerm, 0);
    gl.uniform1f(rec.uFreq, o.freq);
    gl.uniform1f(rec.uZ, o.z);
    gl.uniform1i(rec.uOct, o.octaves);
    gl.uniform1f(rec.uLac, o.lacunarity);
    gl.uniform1f(rec.uGain, o.gain);

    const out = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, out);
    gl.bufferData(gl.ARRAY_BUFFER, n * 4, gl.DYNAMIC_COPY);
    // A buffer bound to a transform-feedback binding point must NOT also sit
    // on the generic ARRAY_BUFFER binding at draw time (ANGLE raises
    // INVALID_OPERATION); release it right after sizing.
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    const tf = gl.createTransformFeedback();
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, tf);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, out);

    gl.enable(gl.RASTERIZER_DISCARD);
    gl.beginTransformFeedback(gl.POINTS);
    gl.drawArrays(gl.POINTS, 0, n);
    gl.endTransformFeedback();
    gl.disable(gl.RASTERIZER_DISCARD);

    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);

    gl.deleteBuffer(bufX);
    gl.deleteBuffer(bufY);

    const readback = runOpts.readback !== false;
    if (!readback) {
      gl.deleteTransformFeedback(tf);
      liveOutputs.add(out);
      return { values: null, gpuBuffer: out, count: n };
    }
    const values = new Float32Array(n);
    gl.bindBuffer(gl.ARRAY_BUFFER, out);
    gl.getBufferSubData(gl.ARRAY_BUFFER, 0, values);
    gl.deleteBuffer(out);
    gl.deleteTransformFeedback(tf);
    return { values, gpuBuffer: null, count: n };
  }

  /** Release a keep-on-GPU result from runField(..., { readback: false }). */
  function release(result) {
    if (result && result.gpuBuffer && liveOutputs.has(result.gpuBuffer)) {
      gl.deleteBuffer(result.gpuBuffer);
      liveOutputs.delete(result.gpuBuffer);
    }
  }

  /** Delete cached programs and permutation textures. */
  function dispose() {
    for (const rec of programs.values()) gl.deleteProgram(rec.program);
    programs.clear();
    for (const tex of permTextures.values()) gl.deleteTexture(tex);
    permTextures.clear();
    for (const buf of liveOutputs) gl.deleteBuffer(buf);
    liveOutputs.clear();
  }

  return { runField, release, dispose };
}

/**
 * Backend dispatch for field evaluation over SoA columns.
 *
 * GPU path only when ALL hold: backend is 'gpu', the field declares a gpu
 * twin, and a runner is supplied. Everything else — including every
 * still/replay path, which never opts in — takes the JS implementation,
 * which every GPU field keeps forever.
 *
 * @returns {Float32Array} field values, one per lane
 */
export function evaluateFieldColumns(fieldId, seed, opts, columns, { runner = null } = {}) {
  const decl = FIELDS.get(fieldId);
  if (!decl) throw new Error(`[fieldRunner] unknown field "${fieldId}"`);
  if (getFieldBackend() === 'gpu' && decl.gpu && runner) {
    return runner.runField(fieldId, seed, opts, columns, { readback: true }).values;
  }
  const inst = decl.create(seed, opts);
  const n = columns.count === undefined ? columns.x.length : columns.count;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = inst.sample(columns.x[i], columns.y[i]);
  return out;
}
