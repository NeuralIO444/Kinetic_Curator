// Kernel K4 — bake particle dynamics (#63).
//
// The live swarm is a requestAnimationFrame loop driven by Date.now(), so a
// still could only ever capture "whatever frame the browser happened to be
// on". Worse, particle initialisation used Math.random, so the same seed
// produced a different swarm on every load — the motion wasn't reproducible
// even in principle.
//
// Initialisation is now seeded off the `dyn` channel (see particles.js), and
// this module replays the *same* physics with a fixed timestep from a fixed
// origin. Bake is therefore a pure function of its inputs, and RENDER/BATCH
// can produce a swarm still without depending on the live loop at all.
//
// That purity has one limit, found while building the #108 swarm SoA
// behaviour lock: Math.sin/cos/atan2 are not required by ECMAScript to be
// correctly rounded, and V8 evaluates them differently on x64 and arm64. Over
// 120 chaotic steps that last-bit difference becomes a visibly different
// swarm. A bake is a pure function of its inputs *on a given machine*; it is
// not byte-identical across architectures, which matters if studio/ ever
// distributes renders over mixed hardware. See docs/KERNEL_V1_PLAN.md §16.
//
// AC3 — dual path, stated plainly: the live canvas keeps its RAF loop for
// interactivity (it needs to respond to the pointer attractor). Both paths
// now run identical, seeded physics, so a bake at step N matches what the
// live loop would show after N steps from the same seed.

import { ParticleSystem } from '../../particles.js';
import { ensureSwarmWasm, getSwarmWasm, runSwarmWasm, resolveWasmParams, wasmBakeEligible, wasmForcedOff } from './swarmWasm.mjs';

// Re-exported so the studio render path can preload the wasm fast path
// without importing the loader module directly.
export { ensureSwarmWasm };

/** Fixed origin for baked time — any constant works; this one is arbitrary
 *  and deliberately not Date.now(). */
export const BAKE_TIME_ORIGIN = 1_000_000;

/** Live loop runs ~60fps; matching it keeps bake and live in step. */
export const BAKE_DT_MS = 1000 / 60;

/**
 * Replay the swarm deterministically and return where it ends up.
 *
 * @param {object}   opts
 * @param {number}   opts.seed
 * @param {number}   opts.count        particle population
 * @param {object}   opts.layoutParams physics knobs (noiseFreq, damping, ...)
 * @param {Array}    opts.activeAssets
 * @param {object}   opts.palette      resolved
 * @param {number}   opts.canvasW
 * @param {number}   opts.canvasH
 * @param {number}   [opts.steps=180]  simulation steps to settle (3s at 60fps)
 * @param {number}   [opts.dt=BAKE_DT_MS]
 * @param {{x:number,y:number}|null} [opts.attractor=null]
 * @param {number}   [opts.maxParticles] quality cap gating breed() growth
 * @param {'auto'|'js'|'wasm'} [opts.engine='auto'] bake engine. 'auto'
 *   uses the Rust/wasm fast path (#175) when it has been preloaded (see
 *   ensureSwarmWasm, called by the studio render path) and the config is in
 *   the wasm scope (cloud swarm, no contacts, no attractor); anything else
 *   — and any load failure — falls back to the JS engine. 'wasm' throws if
 *   the module is unavailable; 'js' forces the JS engine. KC_SWARM_WASM=0
 *   also forces the JS engine.
 * @returns {Array<{x,y,rotation,scale,alpha,color,assetIndex}>}
 */
export function bakeParticles({
  seed,
  count,
  layoutParams,
  activeAssets,
  palette,
  canvasW,
  canvasH,
  steps = 180,
  dt = BAKE_DT_MS,
  attractor = null,
  maxParticles,
  engine = 'auto',
}) {
  const sys = new ParticleSystem();
  sys.init(count, canvasW, canvasH, activeAssets, palette, seed);

  // #167 — the quality cap rides on the params so contact breed() can gate
  // population growth; the bake stays a pure function of its inputs.
  const params = {
    ...layoutParams,
    particleCount: count,
    maxParticles: maxParticles ?? count,
  };

  // #175 — Rust/wasm fast path. Opt-in at the call site via ensureSwarmWasm()
  // preload; scope-gated to the cloud path the wasm module implements.
  let ranWasm = false;
  if (!wasmForcedOff() && engine !== 'js' && wasmBakeEligible({ layoutParams: params, attractor, count: sys.n }).ok) {
    const wasm = getSwarmWasm();
    if (wasm) {
      runSwarmWasm(wasm, sys, {
        n: sys.n,
        steps,
        time0: BAKE_TIME_ORIGIN,
        dt,
        params16: resolveWasmParams(params, canvasW, canvasH),
        seed,
      });
      ranWasm = true;
    } else if (engine === 'wasm') {
      throw new Error(
        'bakeParticles: engine "wasm" requested but the swarm wasm module is not loaded — call ensureSwarmWasm() first.',
      );
    }
  }
  if (!ranWasm) {
    for (let s = 0; s < steps; s++) {
      // Fixed timestep from a fixed origin — the one thing that makes this
      // reproducible. The live loop passes Date.now() here.
      sys.update(params, activeAssets, palette, seed, BAKE_TIME_ORIGIN + s * dt, attractor);
    }
  }
  return sys.getItems(activeAssets);
}

/** Baked items, shaped like the live swarm's render items. */
export function bakeSwarmItems(opts) {
  const items = bakeParticles(opts);
  const swatches = opts.palette?.swatches || [];
  return items.map((item) => {
    const i = swatches.indexOf(item.color);
    return {
      ...item,
      assetId: item.asset?.id,
      accent: swatches[(i + 3) % swatches.length] || swatches[0],
    };
  });
}
