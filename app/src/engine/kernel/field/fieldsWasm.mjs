// fieldsWasm.mjs — optional Rust/wasm fast path for kernel field evaluation (#1319).
//
// The wasm module (kernel/wasm/kc_fields.wasm, built by scripts/build-wasm.sh,
// #1317) ports the two noisiest kernel fields — the fBm noise field and the
// scent grid's sample + diffuse/decay step — from app/src/engine/noise.js and
// kernel/field/scent.js. It is a pure accelerator: identical inputs produce
// bit-identical outputs, and the JS implementations stay the permanent
// references.
//
// Port order (documented per #1319): the registry declares costTier 0 for
// every field, so the registry's tiers don't discriminate — the order follows
// measured per-call cost instead: noise first (fBm = octaves of 3D simplex
// per sample, the noisiest), scent second (the per-frame diffuse/decay pass
// over the 64×36 grid). constant/ca/quadtree are out of scope for this crate.
//
// Contract:
//   - Rust is NEVER a build/CI requirement: the .wasm is checked in and CI
//     consumes the artifact as-is.
//   - The crate never allocates: every export takes caller-provided pointers
//     + scalar params and writes into caller-provided output buffers. The
//     bump allocator below lives on the JS side (marshaling, over the
//     module's linear memory) — the Rust side owns no heap state.
//   - If the module cannot load, is absent, or the config is out of scope,
//     callers stay on the JS engine. KC_FIELDS_WASM=0 forces the JS path.
//   - WASM_BACKEND is the per-field flag (noise, scent). Default is ON
//     (Matt, 2026-10-11: "Rust by default and when possible", #1304): the
//     wasm path runs whenever the module is loaded and the call is in scope,
//     and anything else silently uses the JS reference, which is never
//     deleted. Parity is bit-identical and gated in CI.

const REQUIRED_EXPORTS = [
  'memory',
  'fields_noise_batch',
  'fields_scent_sample',
  'fields_scent_step',
];

/**
 * Per-field WASM_BACKEND flags. The JS implementations are the permanent
 * references; the wasm paths are parity-checked accelerators. Both default
 * to true (#1304): "use wasm when it is loaded and in scope". KC_FIELDS_WASM=0
 * forces JS. A saved recipe can never change these (runtime-only).
 */
export const WASM_BACKEND = { noise: true, scent: true };

/** Debug counters: lets selfchecks prove the wasm path actually ran. */
export const wasmStats = { noiseBatches: 0, scentSamples: 0, scentSteps: 0 };

let cached = null;      // { instance } | null
let loadAttempted = false;
let loadError = null;

/** The reason the last ensureFieldsWasm() returned null (for selfchecks). */
export function fieldsWasmLoadError() {
  return loadError;
}

/** Synchronously available module, or null if not loaded yet / failed. */
export function getFieldsWasm() {
  return cached;
}

async function loadWasmBytes() {
  // 1. Bundler path (Vite `?url`): resolves to the emitted asset URL at build
  //    time; at dev time it serves the checked-in file.
  try {
    const mod = await import('../wasm/kc_fields.wasm?url');
    const url = mod && mod.default;
    if (typeof url === 'string' && url) {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
      return new Uint8Array(await res.arrayBuffer());
    }
  } catch (e) {
    loadError = e;
  }
  // 2. Plain Node path: read the artifact from kernel/wasm next to this module.
  if (typeof process !== 'undefined' && process.versions && process.versions.node) {
    const { readFile } = await import('node:fs/promises');
    try {
      return await readFile(new URL('../wasm/kc_fields.wasm', import.meta.url));
    } catch (e) {
      loadError = e;
      throw e;
    }
  }
  throw loadError || new Error('fields wasm: no loader for this environment');
}

/**
 * Load and instantiate the fields wasm module. Resolves to { instance } or
 * null when the module is absent/unusable — never rejects for a missing
 * module (dev-mode safety); a broken accelerator must never break the app.
 */
export async function ensureFieldsWasm() {
  if (cached) return cached;
  if (loadAttempted) return null;
  loadAttempted = true;
  try {
    const bytes = await loadWasmBytes();
    const { instance } = await WebAssembly.instantiate(bytes, {});
    for (const name of REQUIRED_EXPORTS) {
      if (typeof instance.exports[name] === 'undefined') {
        throw new Error(`fields wasm: missing export "${name}"`);
      }
    }
    cached = { instance };
    return cached;
  } catch (e) {
    loadError = e;
    console.warn('[fieldsWasm] wasm fast path unavailable, using JS engine:', e && e.message ? e.message : e);
    return null;
  }
}

/**
 * KC_FIELDS_WASM=0 forces the JS engine (debugging escape hatch). Uses
 * globalThis so this module stays lint-clean under browser globals.
 */
export function wasmForcedOff() {
  const proc = globalThis.process;
  return !!proc && !!proc.env && proc.env.KC_FIELDS_WASM === '0';
}

/** True when the wasm path is selected for this field id ('noise' | 'scent'). */
export function wasmBackendFor(id) {
  if (wasmForcedOff()) return false;
  return id === 'noise' ? !!WASM_BACKEND.noise : id === 'scent' ? !!WASM_BACKEND.scent : false;
}

// ── JS-side bump allocator over the module's linear memory ──────────────
// Marshaling only: the Rust exports take raw pointers, so the wrapper stages
// caller buffers into linear memory, calls, and copies results back out.
// The bump resets per call; memory grows on demand. The crate itself never
// allocates — the no-allocation contract holds on the Rust side.

// Region base: the module's linear memory below its initial end holds the
// Rust shadow stack and statics, and the module exports no __heap_base. The
// crate never allocates, so everything past the initial memory end is ours:
// pin the base there on first use and grow upward from it.
let bumpBase = -1;
let bumpPtr = 0;

function bumpReset(exports) {
  if (bumpBase < 0) bumpBase = (exports.memory.buffer.byteLength + 15) & ~15;
  bumpPtr = bumpBase;
}

function bumpAlloc(exports, bytes, align) {
  const a = (bumpPtr + align - 1) & ~(align - 1);
  const end = a + bytes;
  const mem = exports.memory;
  if (end > mem.buffer.byteLength) {
    mem.grow(Math.ceil((end - mem.buffer.byteLength) / 65536));
  }
  bumpPtr = end;
  return a;
}

function lenOf(v) {
  return v != null && Number.isInteger(v.length) ? v.length : 0;
}

/**
 * Scope gate: can this field call run on the wasm fast path?
 * Returns { ok:true } or { ok:false, reason }. Anything the gate refuses
 * stays on the JS reference — no silent wrong answers.
 */
export function wasmFieldsEligible(kind, p = {}) {
  if (kind === 'noise') {
    const { seed, freq, octaves, lacunarity, gain, z, count, xsLen, ysLen, outLen } = p;
    if (!Number.isInteger(count) || count <= 0) return { ok: false, reason: 'empty' };
    if (xsLen < count || ysLen < count || outLen < count) return { ok: false, reason: 'short-buffer' };
    if (!Number.isFinite(seed)) return { ok: false, reason: 'bad-seed' };
    if (!Number.isFinite(freq) || !Number.isFinite(lacunarity) ||
        !Number.isFinite(gain) || !Number.isFinite(z)) return { ok: false, reason: 'bad-params' };
    if (!Number.isInteger(octaves) || octaves < 1 || octaves > 8) return { ok: false, reason: 'bad-octaves' };
    return { ok: true };
  }
  if (kind === 'scent-sample' || kind === 'scent-step') {
    const { cols, rows, cellsLen } = p;
    if (!Number.isInteger(cols) || cols < 1 || !Number.isInteger(rows) || rows < 1) {
      return { ok: false, reason: 'bad-grid' };
    }
    if (cellsLen !== cols * rows) return { ok: false, reason: 'grid-mismatch' };
    if (kind === 'scent-sample') {
      const { count, xsLen, ysLen, outLen } = p;
      if (!Number.isInteger(count) || count <= 0) return { ok: false, reason: 'empty' };
      if (xsLen < count || ysLen < count || outLen < count) return { ok: false, reason: 'short-buffer' };
    } else {
      const { decay, diffuse } = p;
      if (!Number.isFinite(decay) || !Number.isFinite(diffuse)) return { ok: false, reason: 'bad-params' };
    }
    return { ok: true };
  }
  return { ok: false, reason: 'unknown-kind' };
}

/**
 * Evaluate the fBm noise field at `count` points: out[i] = field.sample(xs[i], ys[i]).
 * Bit-identical to makeNoiseField(seed, opts).sample. `xs`/`ys` are the SoA
 * x/y columns (f32); `out` is a caller-provided f32 buffer (length ≥ count).
 */
export function fieldsNoiseBatch(wasm, seed, opts = {}, xs, ys, out, count = lenOf(xs)) {
  const { freq = 2.5, octaves = 3, lacunarity = 2, gain = 0.5, z = 0 } = opts;
  const gate = wasmFieldsEligible('noise', {
    seed, freq, octaves, lacunarity, gain, z, count,
    xsLen: lenOf(xs), ysLen: lenOf(ys), outLen: lenOf(out),
  });
  if (!gate.ok) throw new Error(`fields wasm: noise call ineligible (${gate.reason})`);
  const { exports } = wasm.instance;
  bumpReset(exports);
  const px = bumpAlloc(exports, count * 4, 4);
  const py = bumpAlloc(exports, count * 4, 4);
  const po = bumpAlloc(exports, count * 4, 4);
  const mem = () => exports.memory.buffer;
  new Float32Array(mem(), px, count).set(xs);
  new Float32Array(mem(), py, count).set(ys);
  exports.fields_noise_batch(seed, freq, octaves, lacunarity, gain, z, px, py, po, count);
  wasmStats.noiseBatches += 1;
  out.set(new Float32Array(mem(), po, count).subarray(0, count));
  return out;
}

/**
 * Sample the scent grid at `count` points. `cells` is the caller's f64 scent
 * grid (cols × rows, row-major — the same Float64Array the JS field keeps);
 * `out` is a caller-provided f32 buffer. Bit-identical to field.sample().
 */
export function fieldsScentSample(wasm, cells, cols, rows, xs, ys, out, count = lenOf(xs)) {
  const gate = wasmFieldsEligible('scent-sample', {
    cols, rows, cellsLen: lenOf(cells), count,
    xsLen: lenOf(xs), ysLen: lenOf(ys), outLen: lenOf(out),
  });
  if (!gate.ok) throw new Error(`fields wasm: scent-sample call ineligible (${gate.reason})`);
  const { exports } = wasm.instance;
  bumpReset(exports);
  const pc = bumpAlloc(exports, cells.length * 8, 8);
  const px = bumpAlloc(exports, count * 4, 4);
  const py = bumpAlloc(exports, count * 4, 4);
  const po = bumpAlloc(exports, count * 4, 4);
  const mem = () => exports.memory.buffer;
  new Float64Array(mem(), pc, cells.length).set(cells);
  new Float32Array(mem(), px, count).set(xs);
  new Float32Array(mem(), py, count).set(ys);
  exports.fields_scent_sample(pc, cols, rows, px, py, po, count);
  wasmStats.scentSamples += 1;
  out.set(new Float32Array(mem(), po, count).subarray(0, count));
  return out;
}

/**
 * One scent simulation step (diffuse + decay), in place on the caller's f64
 * grid — mirrors the JS field's step() including its cells.set(scratch)
 * write-back. Bit-identical to field.step(opts).
 */
export function fieldsScentStep(wasm, cells, cols, rows, { decay = 0.97, diffuse = 0.25 } = {}) {
  const gate = wasmFieldsEligible('scent-step', { cols, rows, cellsLen: lenOf(cells), decay, diffuse });
  if (!gate.ok) throw new Error(`fields wasm: scent-step call ineligible (${gate.reason})`);
  const { exports } = wasm.instance;
  bumpReset(exports);
  const pc = bumpAlloc(exports, cells.length * 8, 8);
  const ps = bumpAlloc(exports, cells.length * 8, 8);
  const mem = () => exports.memory.buffer;
  new Float64Array(mem(), pc, cells.length).set(cells);
  exports.fields_scent_step(pc, ps, cols, rows, decay, diffuse);
  wasmStats.scentSteps += 1;
  cells.set(new Float64Array(mem(), pc, cells.length));
  return cells;
}
