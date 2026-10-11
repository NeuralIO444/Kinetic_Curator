// neighborWasm.mjs — optional Rust/wasm fast path for the kernel neighbor
// search (#1318, Rust 2/3).
//
// The wasm module (kernel/wasm/kc_neighbor.wasm, built by
// scripts/build-wasm.sh, #1317) ports the idea-#4 hot spot — the spatial
// hash + neighbor loop behind the FIELD patch path
// (`tracks/trackGraph.js` `applyField`, called per frame from
// `gl/liveResolve.mjs`) — onto SoA position columns (Float32Array x/y,
// #1324). It is a pure accelerator: the JS column implementation below is
// the permanent reference, bit-identical by construction (both sides do the
// distance test in f64 on the exact f32 column values; per-target indices
// are ascending on both sides).
//
// Contract:
//   - Rust is NEVER a build/CI requirement: the .wasm is checked in and CI
//     consumes the artifact as-is (provenance: kernel/wasm/MANIFEST.json,
//     gated by bake/swarmWasm.selfcheck.mjs).
//   - The WASM_BACKEND flag selects the neighbor path backend. Default is
//     'wasm' (Matt, 2026-10-11, #1304): used when the module is loaded, with
//     a silent fall back to the JS reference otherwise. KC_NEIGHBOR_WASM=0
//     forces JS per-process. The JS implementation is never deleted.
//   - If the module cannot load, is absent, or the wasm backend is selected
//     without a loaded module, the path silently falls back to the JS
//     reference. A broken accelerator must never break the app.
//   - Boundary discipline: the wasm takes column pointers + scalars and
//     returns nothing — neighbor indices/counts land in caller-provided
//     buffers carved from wasm memory via neighbor_alloc. NO allocation
//     crosses the boundary.
//
// NOTE: the SoA migration (#1324) is still landing, so no production call
// site passes columns yet — this module is the loader + flag + the two
// backends, proven identical by tracks/neighborWasm.selfcheck.mjs. When the
// SoA columns exist at the live FIELD path, that call site preloads with
// ensureNeighborWasm() once and dispatches through findNeighbors().

const REQUIRED_EXPORTS = [
  'memory',
  'neighbor_alloc',
  'neighbor_free',
  'neighbor_run',
  'neighbor_rng_create',
  'neighbor_rng_next',
  'neighbor_rng_destroy',
  'neighbor_hash_u32',
  'neighbor_hash_channel',
  'neighbor_stream_seed',
];

let cached = null;      // { instance } | null
let loadAttempted = false;
let loadError = null;

/** The reason the last ensureNeighborWasm() returned null (for selfchecks). */
export function neighborWasmLoadError() {
  return loadError;
}

/** Synchronously available module, or null if not loaded yet / failed. */
export function getNeighborWasm() {
  return cached;
}

async function loadWasmBytes() {
  // 1. Bundler path (Vite `?url`): resolves to the emitted asset URL at build
  //    time; at dev time it serves the checked-in file.
  try {
    const mod = await import('../wasm/kc_neighbor.wasm?url');
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
      return await readFile(new URL('../wasm/kc_neighbor.wasm', import.meta.url));
    } catch (e) {
      loadError = e;
      throw e;
    }
  }
  throw loadError || new Error('neighbor wasm: no loader for this environment');
}

/**
 * Load and instantiate the kc-neighbor wasm module. Resolves to { instance }
 * or null when the module is absent/unusable — never rejects for a missing
 * module (dev-mode safety); corrupt modules are also a null + loud warning.
 */
export async function ensureNeighborWasm() {
  if (cached) return cached;
  if (loadAttempted) return null;
  loadAttempted = true;
  try {
    const bytes = await loadWasmBytes();
    const { instance } = await WebAssembly.instantiate(bytes, {});
    for (const name of REQUIRED_EXPORTS) {
      if (typeof instance.exports[name] === 'undefined') {
        throw new Error(`neighbor wasm: missing export "${name}"`);
      }
    }
    cached = { instance };
    return cached;
  } catch (e) {
    loadError = e;
    console.warn('[neighborWasm] wasm fast path unavailable, using JS reference:', e && e.message ? e.message : e);
    return null;
  }
}

// ── WASM_BACKEND flag ─────────────────────────────────────────────────
// Default is 'wasm' (#1304, Matt-approved 2026-10-11); parity is bit-identical
// and gated in CI. KC_NEIGHBOR_WASM=0 forces the JS reference.

let wasmBackend = 'wasm';

/** Current WASM_BACKEND selection for the neighbor path: 'js' | 'wasm'. */
export function getNeighborBackend() {
  return wasmBackend;
}

/** Select the neighbor-path backend. Throws on anything but 'js' | 'wasm'. */
export function setNeighborBackend(name) {
  if (name !== 'js' && name !== 'wasm') {
    throw new RangeError(`[neighborWasm] unknown backend "${name}" (want 'js' | 'wasm')`);
  }
  wasmBackend = name;
}

/** KC_NEIGHBOR_WASM=1 explicitly opts the neighbor path into the wasm backend. */
export function neighborWasmEnvOptIn() {
  const p = globalThis.process;
  return !!p && !!p.env && p.env.KC_NEIGHBOR_WASM === '1';
}

/** KC_NEIGHBOR_WASM=0 forces the JS reference (debugging escape hatch). */
export function neighborWasmForcedOff() {
  const p = globalThis.process;
  return !!p && !!p.env && p.env.KC_NEIGHBOR_WASM === '0';
}

/** Effective backend: forced-off wins, then the explicit env opt-in, then the flag. */
export function effectiveNeighborBackend() {
  if (neighborWasmForcedOff()) return 'js';
  return neighborWasmEnvOptIn() ? 'wasm' : wasmBackend;
}

// ── JS reference (the permanent reference implementation) ─────────────
// Column-based port of applyField's inclusion loop: for each target, every
// source with d2 <= r2 (f64 arithmetic on the exact f32 column values),
// indices ascending. Bit-identical to the wasm path by construction.

function checkArgs(tx, ty, sx, sy, radius, maxNeighbors) {
  if (!(tx instanceof Float32Array) || !(ty instanceof Float32Array)
      || !(sx instanceof Float32Array) || !(sy instanceof Float32Array)) {
    throw new TypeError('[neighborWasm] columns must be Float32Array (SoA x/y)');
  }
  if (tx.length !== ty.length || sx.length !== sy.length) {
    throw new RangeError('[neighborWasm] x/y column length mismatch');
  }
  if (!Number.isFinite(radius) || radius <= 0) {
    throw new RangeError(`[neighborWasm] radius must be finite and > 0 (got ${radius})`);
  }
  if (!Number.isInteger(maxNeighbors) || maxNeighbors < 0) {
    throw new RangeError(`[neighborWasm] maxNeighbors must be a non-negative integer (got ${maxNeighbors})`);
  }
}

/**
 * JS reference neighbor search on SoA columns. Returns
 * { counts: Uint32Array(nT), indices: Uint32Array(nT * maxNeighbors) } —
 * per-target neighbor source indices, ascending within each target's run.
 * Throws RangeError when a target exceeds maxNeighbors (loud, like the
 * wasm path's overflow status).
 */
export function findNeighborsJS(tx, ty, sx, sy, radius, maxNeighbors) {
  checkArgs(tx, ty, sx, sy, radius, maxNeighbors);
  const nT = tx.length;
  const nS = sx.length;
  const r32 = Math.fround(radius);
  const r2 = r32 * r32;
  const counts = new Uint32Array(nT);
  const indices = new Uint32Array(nT * maxNeighbors);
  for (let i = 0; i < nT; i++) {
    const qx = tx[i];
    const qy = ty[i];
    let k = 0;
    const base = i * maxNeighbors;
    for (let j = 0; j < nS; j++) {
      const dx = sx[j] - qx;
      const dy = sy[j] - qy;
      const d2 = dx * dx + dy * dy;
      // Verbatim applyField inclusion: `if (d2 > r2) continue`.
      if (d2 > r2) continue;
      if (k >= maxNeighbors) {
        throw new RangeError(
          `[neighborWasm] target ${i} exceeds maxNeighbors=${maxNeighbors} (JS reference)`,
        );
      }
      indices[base + k] = j;
      k++;
    }
    counts[i] = k;
  }
  return { counts, indices };
}

// ── wasm backend ──────────────────────────────────────────────────────

const RC_OK = 0;

/**
 * Wasm neighbor search. Same contract/shape as findNeighborsJS. Throws on
 * bad args (rc=-1) or neighbor overflow (rc=-2). Buffers are carved from
 * wasm memory with neighbor_alloc and freed before return — views are
 * re-created after every call that can grow memory (alloc, neighbor_run),
 * never held across one.
 */
export function findNeighborsWasm(wasm, tx, ty, sx, sy, radius, maxNeighbors) {
  checkArgs(tx, ty, sx, sy, radius, maxNeighbors);
  if (!wasm || !wasm.instance) throw new Error('[neighborWasm] no loaded module');
  const { exports } = wasm.instance;
  const nT = tx.length;
  const nS = sx.length;
  if (nT === 0) return { counts: new Uint32Array(0), indices: new Uint32Array(0) };
  const r32 = Math.fround(radius);
  const txOff = 0;
  const tyOff = nT * 4;
  const sxOff = tyOff + nT * 4;
  const syOff = sxOff + nS * 4;
  const countsOff = syOff + nS * 4;
  const idxOff = countsOff + nT * 4;
  const bytes = idxOff + nT * maxNeighbors * 4;
  const base = exports.neighbor_alloc(bytes);
  if (!base) throw new Error('[neighborWasm] neighbor_alloc failed');
  try {
    // Fresh views per access: neighbor_alloc / neighbor_run can grow wasm
    // memory, which detaches every existing view.
    const f32 = (off, n) => new Float32Array(exports.memory.buffer, base + off, n);
    f32(txOff, nT).set(tx);
    f32(tyOff, nT).set(ty);
    f32(sxOff, nS).set(sx);
    f32(syOff, nS).set(sy);
    const rc = exports.neighbor_run(
      base + txOff, base + tyOff, nT,
      base + sxOff, base + syOff, nS,
      r32,
      base + countsOff, base + idxOff, maxNeighbors,
    );
    if (rc !== RC_OK) {
      const why = rc === -2 ? 'neighbor overflow: raise maxNeighbors' : `bad args (rc=${rc})`;
      throw new Error(`[neighborWasm] neighbor_run failed: ${why}`);
    }
    const counts = new Uint32Array(exports.memory.buffer, base + countsOff, nT).slice();
    const indices = new Uint32Array(exports.memory.buffer, base + idxOff, nT * maxNeighbors).slice();
    return { counts, indices };
  } finally {
    exports.neighbor_free(base, bytes);
  }
}

// ── dispatch ──────────────────────────────────────────────────────────

/**
 * Neighbor search on SoA columns, dispatched on the WASM_BACKEND flag.
 * Default backend is wasm when loaded, else the JS reference; pass
 * { backend: 'js' } or set KC_NEIGHBOR_WASM=0 to force the reference.
 * The wasm path requires a preloaded module (ensureNeighborWasm()); when
 * it isn't available the call falls back to the JS reference with a
 * warning — the accelerator never breaks the app.
 */
export function findNeighbors(tx, ty, sx, sy, radius, { maxNeighbors = 64, backend } = {}) {
  const be = backend ?? effectiveNeighborBackend();
  if (be === 'wasm') {
    const w = getNeighborWasm();
    if (w) return findNeighborsWasm(w, tx, ty, sx, sy, radius, maxNeighbors);
    // Default-on means "not loaded yet" is normal: fall back quietly. Only an
    // explicit request (the call's backend option or the env opt-in) is a warning.
    if (backend === 'wasm' || neighborWasmEnvOptIn()) {
      console.warn('[neighborWasm] backend=wasm requested but module not loaded — falling back to JS reference');
    }
  }
  return findNeighborsJS(tx, ty, sx, sy, radius, maxNeighbors);
}
