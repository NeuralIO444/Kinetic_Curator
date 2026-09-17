// swarmWasm.mjs — optional Rust/wasm fast path for the cloud-swarm bake (#175).
//
// The wasm module (kernel/wasm/swarm_bake.wasm, built by
// scripts/build-swarm-wasm.sh) ports the swarm bake hot loop — noise,
// spatial-hash neighbour pass, and cloud integration — from particles.js.
// It is a pure accelerator: identical inputs produce equivalent bakes, and
// every unsupported configuration stays on the JS engine.
//
// Contract:
//   - Rust is NEVER a build/CI requirement: the .wasm is checked in and CI
//     consumes the artifact as-is.
//   - If the module cannot load, is absent, or the config is out of scope,
//     bakeParticles() silently falls back to the JS engine. KC_SWARM_WASM=0
//     forces the JS path for debugging.
//   - Only the synchronous public API changes: none. Callers keep calling
//     bakeParticles(); the wasm route is selected inside it after an
//     explicit ensureSwarmWasm() preload (studio render path) or lazily.

import { isOrganismMode } from '../../../data/layout-modes.js';

// The f64 columns, in swarm_col_f64() id order.
const F64_COLS = [
  'x', 'y', 'vx', 'vy', 'ax', 'ay', 'mass', 'scale', 'rotation',
  'alpha', 'phase', 'u', 'seedOffset',
];

const REQUIRED_EXPORTS = [
  'memory',
  'swarm_create',
  'swarm_destroy',
  'swarm_col_f64',
  'swarm_col_i32',
  'swarm_col_u8',
  'swarm_init_noise',
  'swarm_run',
  'swarm_noise3d',
  'swarm_params_ptr',
];

let cached = null;      // { instance } | null
let loadAttempted = false;
let loadError = null;

/** The reason the last ensureSwarmWasm() returned null (for selfchecks). */
export function swarmWasmLoadError() {
  return loadError;
}

/** Synchronously available module, or null if not loaded yet / failed. */
export function getSwarmWasm() {
  return cached;
}

async function loadWasmBytes() {
  // 1. Bundler path (Vite `?url`): resolves to the emitted asset URL at build
  //    time; at dev time it serves the checked-in file.
  try {
    const mod = await import('../wasm/swarm_bake.wasm?url');
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
      return await readFile(new URL('../wasm/swarm_bake.wasm', import.meta.url));
    } catch (e) {
      loadError = e;
      throw e;
    }
  }
  throw loadError || new Error('swarm wasm: no loader for this environment');
}

/**
 * Load and instantiate the swarm wasm module. Resolves to { instance } or
 * null when the module is absent/unusable — never rejects for a missing
 * module (dev-mode safety); corrupt modules are also a null + loud warning,
 * because a broken accelerator must never break the app.
 */
export async function ensureSwarmWasm() {
  if (cached) return cached;
  if (loadAttempted) return null;
  loadAttempted = true;
  try {
    const bytes = await loadWasmBytes();
    const { instance } = await WebAssembly.instantiate(bytes, {});
    for (const name of REQUIRED_EXPORTS) {
      if (typeof instance.exports[name] === 'undefined') {
        throw new Error(`swarm wasm: missing export "${name}"`);
      }
    }
    cached = { instance };
    return cached;
  } catch (e) {
    loadError = e;
    console.warn('[swarmWasm] wasm fast path unavailable, using JS engine:', e && e.message ? e.message : e);
    return null;
  }
}

/**
 * KC_SWARM_WASM=0 forces the JS engine (debugging escape hatch). Uses
 * globalThis so this module stays lint-clean under browser globals.
 */
export function wasmForcedOff() {
  const proc = globalThis.process;
  return !!proc && !!proc.env && proc.env.KC_SWARM_WASM === '0';
}

/**
 * Scope gate: can this bake config run on the wasm fast path?
 * Returns { ok:true } or { ok:false, reason }.
 */
export function wasmBakeEligible({ layoutParams = {}, attractor = null, count = 0 } = {}) {
  if (!Number.isFinite(count) || count <= 0) return { ok: false, reason: 'empty' };
  if (isOrganismMode(layoutParams.mode)) return { ok: false, reason: 'organism-mode' };
  if ((layoutParams.contactRadius ?? 0) > 0) return { ok: false, reason: 'contacts' };
  if (attractor) return { ok: false, reason: 'attractor' };
  return { ok: true };
}

/**
 * Resolve the 16-f64 param block for swarm_run(), mirroring the
 * destructuring defaults at the top of ParticleSystem.update() for the
 * cloud path. NOTE: like the JS engine, the cloud path ignores `wind`
 * (windMul = organism ? wind * profile.wind : 1) and pins damping as-is.
 */
export function resolveWasmParams(layoutParams = {}, canvasW = 0, canvasH = 0) {
  const {
    noiseFreq = 0.005,
    noiseSpeed = 0.5,
    swarmCohesion = 1.5,
    gravityWells = 1.0,
    damping = 0.95,
    scale = [0.4, 1.6],
    alpha = [40, 100],
  } = layoutParams;
  const [minScale, maxScale] = scale;
  const [minAlpha, maxAlpha] = alpha;
  return [
    noiseFreq,          // 0 P_NOISE_FREQ
    noiseSpeed,         // 1 P_NOISE_SPEED
    damping,            // 2 P_DAMPING (cloud: as-is)
    minScale,           // 3 P_MIN_SCALE
    maxScale,           // 4 P_MAX_SCALE
    minAlpha,           // 5 P_MIN_ALPHA
    maxAlpha,           // 6 P_MAX_ALPHA
    1.0,                // 7 P_WIND_MUL (cloud: 1 — wind ignored, like JS)
    gravityWells,       // 8 P_GRAVITY_WELLS
    swarmCohesion,      // 9 P_COH_W
    canvasW,            // 10 P_CANVAS_W
    canvasH,            // 11 P_CANVAS_H
    8.0,                // 12 P_MAX_SPEED (MAX_SPEED_CLOUD)
    0,                  // 13 P_ATTRACTOR_X (scope-gated off)
    0,                  // 14 P_ATTRACTOR_Y
    0,                  // 15 P_ATTRACTOR_ON
  ];
}

function memView(exports, ptr, n, Kind) {
  if (!ptr) throw new Error('swarm wasm: null column pointer');
  return new Kind(exports.memory.buffer, ptr, n);
}

/**
 * Run the whole bake inside wasm: copy the seeded JS particle state in,
 * run `steps` steps, copy the final state back onto `sys`, destroy the ctx.
 * `sys` must be a fully initialised ParticleSystem (same as update() needs).
 */
export function runSwarmWasm(wasm, sys, { n, steps, time0, dt, params16, seed }) {
  const { exports } = wasm.instance;
  const ctx = exports.swarm_create(n);
  if (!ctx) throw new Error('swarm wasm: swarm_create failed');
  try {
    for (let c = 0; c < F64_COLS.length; c++) {
      memView(exports, exports.swarm_col_f64(ctx, c), n, Float64Array)
        .set(sys[F64_COLS[c]].subarray(0, n));
    }
    memView(exports, exports.swarm_col_i32(ctx, 0), n, Int32Array)
      .set(sys.assetIndex.subarray(0, n));
    memView(exports, exports.swarm_col_u8(ctx, 0), n, Uint8Array)
      .set(sys.alive.subarray(0, n));
    memView(exports, exports.swarm_col_u8(ctx, 1), n, Uint8Array)
      .set(sys.cgroup.subarray(0, n));

    exports.swarm_init_noise(ctx, seed || 444);

    memView(exports, exports.swarm_params_ptr(), 16, Float64Array).set(params16);
    const rc = exports.swarm_run(ctx, n, steps, time0, dt, exports.swarm_params_ptr());
    if (rc !== 0) throw new Error(`swarm wasm: swarm_run failed (rc=${rc})`);

    for (let c = 0; c < F64_COLS.length; c++) {
      sys[F64_COLS[c]].set(
        memView(exports, exports.swarm_col_f64(ctx, c), n, Float64Array),
      );
    }
    sys.assetIndex.set(memView(exports, exports.swarm_col_i32(ctx, 0), n, Int32Array));
    sys.alive.set(memView(exports, exports.swarm_col_u8(ctx, 0), n, Uint8Array));
    sys.cgroup.set(memView(exports, exports.swarm_col_u8(ctx, 1), n, Uint8Array));
  } finally {
    exports.swarm_destroy(ctx);
  }
}
