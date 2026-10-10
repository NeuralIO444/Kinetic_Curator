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
// #1240 — opt-in deterministic trig: bakeParticles({ trig: 'det' }) swaps
// the engine's trig source to the polynomial implementation in
// kernel/trig.mjs (same bits on x64 and arm64). Default trig: 'native'
// keeps the exact Math.* calls — byte-identical to today, provably.
//
// AC3 — dual path, stated plainly: the live canvas keeps its RAF loop for
// interactivity (it needs to respond to the pointer attractor). Both paths
// now run identical, seeded physics, so a bake at step N matches what the
// live loop would show after N steps from the same seed.

import { ParticleSystem } from '../../particles.js';
import { ensureSwarmWasm, getSwarmWasm, runSwarmWasm, resolveWasmParams, wasmBakeEligible, wasmForcedOff, contactsActive } from './swarmWasm.mjs';
import { noiseSeedFor } from '../rng.js';
import { TRIG_NATIVE, TRIG_DET } from '../trig.mjs'; // #1240 — opt-in deterministic trig
import { ACCENT_OFFSET } from '../color/index.js';
// #1237 — the accent offset is kernel-local (kernel/color); bake reuses it so
// bake and the live path derive accents from the same slot arithmetic. No
// bake → panel import: kernel/color only pulls in the colour engine + rng.

// Re-exported so the studio render path can preload the wasm fast path
// without importing the loader module directly.
export { ensureSwarmWasm };

/**
 * #814 — contacts bake policy: the live gate for "bake the state or refuse
 * the still". Contacts are live-only (JS `_contactPass` in particles.js;
 * the wasm module has no contact solver), so a contact-active config bakes
 * on the JS integrator — bit-for-bit with the live ticks — and the wasm
 * fast path refuses it (reason 'contacts') rather than rendering a
 * contact-less flock. `bakeParticles` consults this before attempting the
 * wasm path, so the policy is the decision, not a comment.
 */
export function contactsBakePolicy(layoutParams = {}) {
  if (!contactsActive(layoutParams)) return { contacts: false, engine: 'auto' };
  return { contacts: true, engine: 'js', reason: 'contacts' };
}

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
 * @param {object}   [opts.seedOffsets] sub-seed stream offsets (#305)
 * @param {'auto'|'js'|'wasm'} [opts.engine='auto'] bake engine. 'auto'
 *   uses the Rust/wasm fast path (#175) when it has been preloaded (see
 *   ensureSwarmWasm, called by the studio render path) and the config is in
 *   the wasm scope (cloud swarm, no contacts, no attractor); anything else
 *   — and any load failure — falls back to the JS engine. 'wasm' throws if
 *   the module is unavailable; 'js' forces the JS engine. KC_SWARM_WASM=0
 *   also forces the JS engine.
 * @param {'native'|'det'} [opts.trig='native'] #1240 — trig source for the
 *   bake. 'native' (default) is the exact Math.sin/cos/atan2 calls the engine
 *   has always used — byte-identical to today, on this machine. 'det' opts
 *   into the deterministic polynomial trig (kernel/trig.mjs): same bits on
 *   x64 and arm64, at the cost of ~1e-11 absolute deviation from Math.*.
 *   The opt-in forces the JS engine — the wasm module has its own trig, out
 *   of scope — and throws honestly if combined with engine:'wasm'.
 * @returns {Array<{x,y,rotation,scale,alpha,color,assetIndex}>}
 */
export function bakeParticles({
  seed,
  seedOffsets = null,
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
  trig = TRIG_NATIVE,
}) {
  const sys = new ParticleSystem();
  // #287 — the voice-level grazer fraction rides into init (and into the
  // update() re-init path via params below).
  // #1240 — the trig opt-in rides into init the same way, so init-time trig
  // (spawn angles) uses the deterministic source too.
  sys.init(count, canvasW, canvasH, activeAssets, palette, seed, seedOffsets, { graze: layoutParams.graze || 0, trig });

  // #167 — the quality cap rides on the params so contact breed() can gate
  // population growth; the bake stays a pure function of its inputs.
  const params = {
    ...layoutParams,
    particleCount: count,
    maxParticles: maxParticles ?? count,
  };

  // #175 — Rust/wasm fast path. Opt-in at the call site via ensureSwarmWasm()
  // preload; scope-gated to the cloud path the wasm module implements.
  // #814 — the contacts policy gates first: a contact-active config bakes
  // on the JS integrator below (bit-for-bit with the live ticks); the wasm
  // path refuses it rather than rendering a contact-less flock. Forcing
  // engine:'wasm' on such a config throws honestly — no silent fallback.
  const policy = contactsBakePolicy(params);
  // #1240 — deterministic trig is a JS-engine-only opt-in (the wasm module
  // has its own trig, out of scope). Same honest-throw pattern as the
  // contacts policy: forcing engine:'wasm' with trig:'det' throws rather
  // than silently rendering on a different trig source.
  const detForced = trig === TRIG_DET;
  if (engine === 'wasm' && (policy.engine === 'js' || detForced)) {
    throw new Error(
      `bakeParticles: engine "wasm" cannot bake this config (${detForced && policy.engine !== 'js' ? 'det-trig' : policy.reason})`,
    );
  }
  let ranWasm = false;
  if (!wasmForcedOff() && engine !== 'js' && policy.engine !== 'js' && !detForced) {
    const gate = wasmBakeEligible({ layoutParams: params, attractor, count: sys.n });
    if (engine === 'wasm' && !gate.ok) {
      throw new Error(`bakeParticles: engine "wasm" cannot bake this config (${gate.reason})`);
    }
    if (gate.ok) {
    const wasm = getSwarmWasm();
    if (wasm) {
      runSwarmWasm(wasm, sys, {
        n: sys.n,
        steps,
        time0: BAKE_TIME_ORIGIN,
        dt,
        params16: resolveWasmParams(params, canvasW, canvasH),
        // #305 — the wasm noise init must see the same derived seed as the
        // JS path's createNoise; zero offsets → exactly `seed || 444`.
        seed: noiseSeedFor(seed, seedOffsets),
      });
      ranWasm = true;
    } else if (engine === 'wasm') {
      throw new Error(
        'bakeParticles: engine "wasm" requested but the swarm wasm module is not loaded — call ensureSwarmWasm() first.',
      );
    }
    }
  }
  if (!ranWasm) {
    for (let s = 0; s < steps; s++) {
      // Fixed timestep from a fixed origin — the one thing that makes this
      // reproducible. The live loop passes loopTimeMs here.
      sys.update(params, activeAssets, palette, seed, BAKE_TIME_ORIGIN + s * dt, attractor, seedOffsets);
    }
  }
  return sys.getItems(activeAssets);
}

/** Baked items, shaped like the live swarm's render items. */
export function bakeSwarmItems(opts) {
  const items = bakeParticles(opts);
  const swatches = opts.palette?.swatches || [];
  // #287 — grazers are stamped in the palette bg, same as the live loop:
  // the ACCUM over-composite erases beneath them.
  const bg = opts.palette?.bg;
  return items.map((item) => {
    // #1237 — derive the accent from the particle's palette SLOT, the same
    // derivation the live path uses (kernel/color assignColor). The old
    // swatches.indexOf(item.color) was O(items·swatches) per still and, on
    // duplicate hexes, silently returned the first slot — every duplicate
    // got the wrong accent. The swarm system threads colorSlot through
    // getItems; the indexOf fallback only covers foreign items that never
    // rode through it.
    const slot = Number.isInteger(item.colorSlot)
      ? item.colorSlot
      : swatches.indexOf(item.color);
    return {
      ...item,
      assetId: item.asset?.id,
      accent: item.graze ? bg : (swatches[(slot + ACCENT_OFFSET) % swatches.length] || swatches[0]),
      color: item.graze ? bg : item.color,
    };
  });
}
