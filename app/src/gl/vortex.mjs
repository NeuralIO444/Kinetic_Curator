/**
 * Vortex-particle fluid (#970, slice 1) — the water under the trails.
 *
 * Gamito / Lopes / Gomes 1995: vortons carry circulation, a fixed-iteration
 * damped Jacobi solve recovers the stream function, velocity is the curl of
 * that stream. Curtis et al. 1997 is the watercolor vocabulary; pigment
 * mixing itself is slice 5 and is not in this module.
 *
 * Pure JS. No GL imports. Slice 2 (blocked on the ACCUM row, #961–#968)
 * uploads `velocityTex` as an *added* advect offset on the existing feed
 * shader, scaled by `advectGain(wetness)`. It must not replace the static
 * curl-noise lookup, and it must not bind the texture when `wetnessStep` is
 * 0 — that is how WETNESS = 0 stays pixel-identical.
 *
 * Thread: step this next to `attachVelocities` on the worker. Freeze skips
 * the step and leaves the last velocity (and the wet mask) bound — dropping
 * them to zero would pop the flow on resume.
 *
 * Live-only. Live ACCUM is 1000×700; a still has no gesture history, so a
 * wet still will not match the live frame. Same class as audio / LFO /
 * Evolve. No studio.py slice in v1.
 *
 * Determinism (#806): fixed dt = 1/60, fixed Jacobi count, splat in
 * `layer|key` order (the same key attachVelocities uses), vortex *pairs*
 * not monopoles, speed capped at SMEAR_MAX_SPEED, seeded RNG for ambient
 * emission. The CPU golden does not cover the feed hook — slice 2 hashes
 * the velocity texture.
 */

import { registerCostTier } from './costTiers.mjs';
import { SMEAR_MAX_SPEED } from './velocitySmear.mjs';
import { mkRng } from '../engine/prng.js';

// Tier 1: sheds with the accum chain once the feed hook exists. Slice 1 does
// not import this from renderer.mjs, so the governor's EXPECTED_TIER1 list
// stays the 8 ACCUM passes until slice 2 adds a measurement and the id.
// timeMs is the selfcheck budget, not a measured fact.
registerCostTier('gl/vortex', {
  tier: 1,
  memoryBytes: 64 * 64 * 4 * 5 + 2048 * 16,
  timeMs: 0.5,
  notes: '#970 vortex-particle core: 64×64 Poisson + ≤2048 vortons, CPU, fixed dt. Slice 2 adds the velocity texture as an offset on the existing feed (never a replacement). Live-only.',
});

export const VORTEX_GRID = 64;
export const VORTEX_MAX = 2048;
export const VORTEX_JACOBI = 30;
export const VORTEX_DT = 1 / 60;
export const VORTEX_RELAX = 2 / 3;
export const VORTEX_DECAY = 0.985;
export const VORTEX_WET_DRY = 0.992;
export const VORTEX_PAIR_SEP = 24;
export const VORTEX_GAMMA_PER_SPEED = 8;
export const VORTEX_GAMMA_FLOOR = 1e-4;

/**
 * Integer gate for the feed hook. 0 or 1 — never a float compare.
 * @param {number} wetness
 * @returns {0|1}
 */
export function wetnessStep(wetness) {
  const w = Number(wetness);
  if (!Number.isFinite(w) || w <= 0) return 0;
  return 1;
}

/**
 * Scale for the *added* advect offset. Exactly 0 when the integer gate is
 * 0, so a dry frame cannot move the feed lookup.
 * @param {number} wetness 0..1
 * @returns {number}
 */
export function advectGain(wetness) {
  if (wetnessStep(wetness) === 0) return 0;
  const w = Number(wetness);
  return w > 1 ? 1 : w;
}

/**
 * @param {{seed?: number, width?: number, height?: number}} [opts]
 */
export function createVortex(opts = {}) {
  const n = VORTEX_GRID;
  const cells = n * n;
  const width = Number.isFinite(opts.width) && opts.width > 0 ? opts.width : 1000;
  const height = Number.isFinite(opts.height) && opts.height > 0 ? opts.height : 700;
  const seed = (Number(opts.seed) | 0) || 970;
  return {
    n,
    width,
    height,
    h: width / (n - 1),
    hy: height / (n - 1),
    pairSep: VORTEX_PAIR_SEP,
    gammaPerSpeed: VORTEX_GAMMA_PER_SPEED,
    omega: new Float32Array(cells),
    psi: new Float32Array(cells),
    psiNext: new Float32Array(cells),
    vx: new Float32Array(cells),
    vy: new Float32Array(cells),
    wet: new Float32Array(cells),
    wetNext: new Float32Array(cells),
    // ring, insertion order: x, y, gamma, age. head is the next write.
    vortons: new Float32Array(VORTEX_MAX * 4),
    head: 0,
    count: 0,
    rng: mkRng(seed),
    seed,
    steps: 0,
    held: false,
    _scratch: new Float32Array(VORTEX_MAX * 4),
  };
}

function pushVorton(state, x, y, gamma) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(gamma)) return;
  const i = state.head;
  const o = i * 4;
  state.vortons[o] = x;
  state.vortons[o + 1] = y;
  state.vortons[o + 2] = gamma;
  state.vortons[o + 3] = 0;
  state.head = (state.head + 1) % VORTEX_MAX;
  if (state.count < VORTEX_MAX) state.count += 1;
}

function stampWet(state, x, y, amount) {
  const { n, width, height, wet } = state;
  if (x < 0 || y < 0 || x > width || y > height) return;
  const gx = (x / width) * (n - 1);
  const gy = (y / height) * (n - 1);
  const i0 = gx | 0;
  const j0 = gy | 0;
  const tx = gx - i0;
  const ty = gy - j0;
  const a = amount > 1 ? 1 : amount;
  const w00 = (1 - tx) * (1 - ty) * a;
  const w10 = tx * (1 - ty) * a;
  const w01 = (1 - tx) * ty * a;
  const w11 = tx * ty * a;
  const i1 = i0 + 1 < n ? i0 + 1 : i0;
  const j1 = j0 + 1 < n ? j0 + 1 : j0;
  wet[j0 * n + i0] = Math.min(1, wet[j0 * n + i0] + w00);
  wet[j0 * n + i1] = Math.min(1, wet[j0 * n + i1] + w10);
  wet[j1 * n + i0] = Math.min(1, wet[j1 * n + i0] + w01);
  wet[j1 * n + i1] = Math.min(1, wet[j1 * n + i1] + w11);
}

/**
 * Shed a vortex pair per moving mark, in `layer|key` order. Stationary
 * marks still stamp the wet mask (paint landed) but shed nothing.
 * Does not mutate instance order.
 * @param {ReturnType<typeof createVortex>} state
 * @param {Array<{layer?: string, key?: string, x: number, y: number, vx?: number, vy?: number}>} instances
 * @returns {number} vortons emitted
 */
export function emitFromInstances(state, instances) {
  if (!instances || !instances.length) return 0;
  const order = new Array(instances.length);
  for (let i = 0; i < instances.length; i++) order[i] = i;
  order.sort((a, b) => {
    const ka = `${instances[a].layer}|${instances[a].key}`;
    const kb = `${instances[b].layer}|${instances[b].key}`;
    if (ka < kb) return -1;
    if (ka > kb) return 1;
    return a - b;
  });
  let emitted = 0;
  for (let k = 0; k < order.length; k++) {
    const it = instances[order[k]];
    if (!Number.isFinite(it.x) || !Number.isFinite(it.y)) continue;
    let vx = Number(it.vx);
    let vy = Number(it.vy);
    if (!Number.isFinite(vx)) vx = 0;
    if (!Number.isFinite(vy)) vy = 0;
    let speed = Math.hypot(vx, vy);
    stampWet(state, it.x, it.y, speed > 1 ? Math.min(1, speed / 40) : 0.35);
    if (speed < 1e-4) continue;
    if (speed > SMEAR_MAX_SPEED) {
      const f = SMEAR_MAX_SPEED / speed;
      vx *= f;
      vy *= f;
      speed = SMEAR_MAX_SPEED;
    }
    const inv = 1 / speed;
    const px = -vy * inv;
    const py = vx * inv;
    const half = state.pairSep * 0.5;
    const gamma = state.gammaPerSpeed * speed;
    // + then −, perpendicular to motion: a pair, not a monopole.
    pushVorton(state, it.x + px * half, it.y + py * half, gamma);
    pushVorton(state, it.x - px * half, it.y - py * half, -gamma);
    emitted += 2;
  }
  return emitted;
}

/**
 * Slice 4 wires MOTION/BEHAVE here. Seeded so a golden can pin it; not
 * called by the feed in slice 1.
 * @param {ReturnType<typeof createVortex>} state
 * @param {number} [pairs]
 */
export function emitAmbient(state, pairs = 4) {
  const n = pairs | 0;
  const rng = state.rng;
  for (let i = 0; i < n; i++) {
    const x = rng() * state.width;
    const y = rng() * state.height;
    const ang = rng() * Math.PI * 2;
    const gamma = 0.4 + rng() * 0.6;
    const c = Math.cos(ang) * state.pairSep * 0.5;
    const s = Math.sin(ang) * state.pairSep * 0.5;
    pushVorton(state, x + c, y + s, gamma);
    pushVorton(state, x - c, y - s, -gamma);
  }
  return n * 2;
}

/** Behave → ambient pair pattern. Unknown names fall back to cruise. */
const AMBIENT = {
  cruise:  { pairs: 1, gamma: 0.35, pattern: 'drift' },
  flock:   { pairs: 2, gamma: 0.45, pattern: 'shear' },
  orbit:   { pairs: 2, gamma: 0.55, pattern: 'orbit' },
  scatter: { pairs: 3, gamma: 0.5, pattern: 'out' },
  mold:    { pairs: 1, gamma: 0.25, pattern: 'drift' },
  levy:    { pairs: 1, gamma: 0.3, pattern: 'stride' },
  lorenz:  { pairs: 2, gamma: 0.4, pattern: 'orbit' },
  seek:    { pairs: 1, gamma: 0.4, pattern: 'in' },
  flee:    { pairs: 1, gamma: 0.5, pattern: 'out' },
};

/**
 * Slice 4. MOTION (wind / breath / flap) and BEHAVE seed ambient pairs.
 * Quieter than a gesture. Seeded, so the same behave and seed match.
 * @param {ReturnType<typeof createVortex>} state
 * @param {{behave?: string, motion?: number}} [opts]
 */
export function emitAmbientFrom(state, { behave = 'cruise', motion = 0 } = {}) {
  const spec = AMBIENT[behave] || AMBIENT.cruise;
  const m = Number.isFinite(Number(motion)) ? Math.min(1, Math.max(0, Number(motion))) : 0;
  const pairs = spec.pairs + (m > 0.5 ? 1 : 0);
  const gamma = spec.gamma * (0.65 + 0.7 * m);
  const rng = state.rng;
  const cx = state.width * 0.5;
  const cy = state.height * 0.5;
  const reach = Math.min(state.width, state.height);
  for (let i = 0; i < pairs; i++) {
    let x;
    let y;
    let ang;
    if (spec.pattern === 'orbit' || spec.pattern === 'in' || spec.pattern === 'out') {
      const t = rng() * Math.PI * 2;
      const rad = (0.22 + rng() * 0.28) * reach;
      x = cx + Math.cos(t) * rad;
      y = cy + Math.sin(t) * rad;
      ang = spec.pattern === 'in' ? t + Math.PI : spec.pattern === 'out' ? t : t + Math.PI / 2;
    } else if (spec.pattern === 'shear') {
      x = rng() * state.width;
      y = (0.3 + i * 0.25) * state.height;
      ang = 0;
    } else {
      x = rng() * state.width;
      y = rng() * state.height;
      ang = rng() * Math.PI * 2;
    }
    const c = Math.cos(ang) * state.pairSep * 0.5;
    const s = Math.sin(ang) * state.pairSep * 0.5;
    pushVorton(state, x + c, y + s, gamma);
    pushVorton(state, x - c, y - s, -gamma);
  }
  return pairs * 2;
}

/** 0..1 from the motion knobs. Wind is 0..3, the others 0..1. */
export function motionAmount(layout) {
  const lp = layout || {};
  const wind = Math.min(1, Math.max(0, (Number(lp.wind) || 0) / 3));
  const breath = Math.min(1, Math.max(0, Number(lp.breath) || 0));
  const flap = Math.min(1, Math.max(0, Number(lp.flap) || 0));
  return Math.max(wind, breath, flap);
}

function splat(state) {
  const { n, omega, vortons, width, height, h, hy } = state;
  omega.fill(0);
  const area = h * hy;
  const start = (state.head - state.count + VORTEX_MAX) % VORTEX_MAX;
  for (let k = 0; k < state.count; k++) {
    const i = (start + k) % VORTEX_MAX;
    const o = i * 4;
    const gamma = vortons[o + 2];
    if (gamma === 0) continue;
    const x = vortons[o];
    const y = vortons[o + 1];
    if (x < 0 || y < 0 || x > width || y > height) continue;
    const gx = (x / width) * (n - 1);
    const gy = (y / height) * (n - 1);
    const i0 = gx | 0;
    const j0 = gy | 0;
    const tx = gx - i0;
    const ty = gy - j0;
    const dens = gamma / area;
    const i1 = i0 + 1 < n ? i0 + 1 : i0;
    const j1 = j0 + 1 < n ? j0 + 1 : j0;
    omega[j0 * n + i0] += (1 - tx) * (1 - ty) * dens;
    omega[j0 * n + i1] += tx * (1 - ty) * dens;
    omega[j1 * n + i0] += (1 - tx) * ty * dens;
    omega[j1 * n + i1] += tx * ty * dens;
  }
}

function poisson(state) {
  const { n, omega, psi, psiNext } = state;
  const h2 = state.h * state.hy;
  const relax = VORTEX_RELAX;
  const keep = 1 - relax;
  const jac = relax * 0.25;
  psi.fill(0);
  psiNext.fill(0);
  let read = psi;
  let write = psiNext;
  for (let iter = 0; iter < VORTEX_JACOBI; iter++) {
    for (let j = 1; j < n - 1; j++) {
      const row = j * n;
      const up = (j - 1) * n;
      const dn = (j + 1) * n;
      for (let i = 1; i < n - 1; i++) {
        const nb = read[row + i - 1] + read[row + i + 1] + read[up + i] + read[dn + i];
        const next = nb + h2 * omega[row + i];
        write[row + i] = keep * read[row + i] + jac * next;
      }
    }
    const swap = read;
    read = write;
    write = swap;
  }
  if (read !== psi) psi.set(read);
}

function velocityFromPsi(state) {
  const { n, psi, vx, vy, h, hy } = state;
  vx.fill(0);
  vy.fill(0);
  const inv2hx = 1 / (2 * h);
  const inv2hy = 1 / (2 * hy);
  for (let j = 1; j < n - 1; j++) {
    const row = j * n;
    const up = (j - 1) * n;
    const dn = (j + 1) * n;
    for (let i = 1; i < n - 1; i++) {
      // u = ∂ψ/∂y, v = −∂ψ/∂x
      vx[row + i] = (psi[dn + i] - psi[up + i]) * inv2hy;
      vy[row + i] = -(psi[row + i + 1] - psi[row + i - 1]) * inv2hx;
    }
  }
}

function sampleV(state, x, y) {
  const { n, width, height, vx, vy } = state;
  const gx = (x / width) * (n - 1);
  const gy = (y / height) * (n - 1);
  const i0 = Math.max(0, Math.min(n - 2, gx | 0));
  const j0 = Math.max(0, Math.min(n - 2, gy | 0));
  const tx = gx - i0;
  const ty = gy - j0;
  const i1 = i0 + 1;
  const j1 = j0 + 1;
  const row0 = j0 * n;
  const row1 = j1 * n;
  const u = (1 - tx) * (1 - ty) * vx[row0 + i0]
    + tx * (1 - ty) * vx[row0 + i1]
    + (1 - tx) * ty * vx[row1 + i0]
    + tx * ty * vx[row1 + i1];
  const v = (1 - tx) * (1 - ty) * vy[row0 + i0]
    + tx * (1 - ty) * vy[row0 + i1]
    + (1 - tx) * ty * vy[row1 + i0]
    + tx * ty * vy[row1 + i1];
  return [u, v];
}

/**
 * Semi-Lagrangian advection of the wet mask through this frame's velocity
 * field, then the multiplicative dry. #998: the mask used to fade in place,
 * so the edge rims and granulation gating it drives read as frozen
 * splotches. Now blooms drift, stretch, and swirl with the fluid.
 *
 * `disp` scales the backtrace displacement (scene units per unit velocity).
 * The live path passes the wet amount, so the mask moves at the same rate
 * as the feed shader's wet UV offset (tuv += (v/32) * amount*32/w — the w
 * cancels, leaving v*amount). Deterministic: fixed order, no RNG. Freeze
 * skips this (stepVortex returns early), so a held frame keeps the last mask.
 * @param {ReturnType<typeof createVortex>} state
 * @param {number} [disp]
 */
function advectWet(state, disp = 1) {
  const { n, wet, wetNext, vx, vy, width, height, h, hy } = state;
  const dry = VORTEX_WET_DRY;
  const gxScale = (n - 1) / width;
  const gyScale = (n - 1) / height;
  for (let j = 0; j < n; j++) {
    const y = j * hy;
    for (let i = 0; i < n; i++) {
      const x = i * h;
      const k = j * n + i;
      // Backtrace through the velocity field, scaled so the mask keeps pace
      // with the feed shader's wet offset.
      let xb = x - vx[k] * disp;
      let yb = y - vy[k] * disp;
      if (xb < 0) xb = 0; else if (xb > width) xb = width;
      if (yb < 0) yb = 0; else if (yb > height) yb = height;
      let i0 = (xb * gxScale) | 0;
      let j0 = (yb * gyScale) | 0;
      if (i0 < 0) i0 = 0; else if (i0 > n - 2) i0 = n - 2;
      if (j0 < 0) j0 = 0; else if (j0 > n - 2) j0 = n - 2;
      const tx = xb * gxScale - i0;
      const ty = yb * gyScale - j0;
      const i1 = i0 + 1;
      const j1 = j0 + 1;
      const r0 = j0 * n;
      const r1 = j1 * n;
      wetNext[k] = ((wet[r0 + i0] * (1 - tx) + wet[r0 + i1] * tx) * (1 - ty)
        + (wet[r1 + i0] * (1 - tx) + wet[r1 + i1] * tx) * ty) * dry;
    }
  }
  wet.set(wetNext);
}

function advect(state, disp) {
  const { vortons, width, height, wet } = state;
  const dt = VORTEX_DT;
  const start = (state.head - state.count + VORTEX_MAX) % VORTEX_MAX;
  // Compact survivors back into insertion order, starting at index 0.
  const scratch = state._scratch;
  let kept = 0;
  for (let k = 0; k < state.count; k++) {
    const i = (start + k) % VORTEX_MAX;
    const o = i * 4;
    let gamma = vortons[o + 2] * VORTEX_DECAY;
    if (Math.abs(gamma) < VORTEX_GAMMA_FLOOR) continue;
    const [u, v] = sampleV(state, vortons[o], vortons[o + 1]);
    const x = vortons[o] + u * dt;
    const y = vortons[o + 1] + v * dt;
    if (x < 0 || y < 0 || x > width || y > height) continue;
    const d = kept * 4;
    scratch[d] = x;
    scratch[d + 1] = y;
    scratch[d + 2] = gamma;
    scratch[d + 3] = vortons[o + 3] + 1;
    kept += 1;
  }
  vortons.set(scratch.subarray(0, kept * 4));
  state.head = kept % VORTEX_MAX;
  state.count = kept;
  advectWet(state, disp);
}

/**
 * One fixed-dt step. Freeze holds velocity, wet mask, and vortons — the
 * last texture stays bound.
 * @param {ReturnType<typeof createVortex>} state
 * @param {{freeze?: boolean, wetAdvect?: number}} [opts] wetAdvect scales the
 * wet-mask backtrace so the mask keeps pace with the feed shader's wet
 * offset (live path passes the wet amount; default 1 is the physical rate).
 */
export function stepVortex(state, opts = {}) {
  if (opts.freeze) {
    state.held = true;
    return state;
  }
  state.held = false;
  splat(state);
  poisson(state);
  velocityFromPsi(state);
  advect(state, Number.isFinite(opts.wetAdvect) ? opts.wetAdvect : 1);
  state.steps += 1;
  return state;
}

/** FNV-1a over the velocity field, quantized so the golden is stable. */
export function hashVelocity(state) {
  let h = 2166136261;
  const { vx, vy } = state;
  for (let i = 0; i < vx.length; i++) {
    h ^= Math.round(vx[i] * 1e5) | 0;
    h = Math.imul(h, 16777619);
    h ^= Math.round(vy[i] * 1e5) | 0;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** RG float velocity, ready for the slice-2 texture upload. Not bound at wetness 0. */
export function velocityTex(state) {
  return { vx: state.vx, vy: state.vy, n: state.n };
}

/** Scene units that pack to the ends of the velocity texture. */
export const VORTEX_VEL_PACK = 32;

function packByte(t) {
  return Math.max(0, Math.min(255, Math.round(t * 255)));
}

/**
 * RG velocity for the feed hook. Centered at 128. LINEAR upload so the
 * 64×64 field bilinear-upsamples. Not bound when wetnessStep is 0.
 * @param {ReturnType<typeof createVortex>} state
 */
export function packVelocity(state, pack = VORTEX_VEL_PACK) {
  const n = state.n;
  const rgba = new Uint8Array(n * n * 4);
  const { vx, vy } = state;
  for (let i = 0; i < n * n; i++) {
    rgba[i * 4] = packByte(vx[i] / pack * 0.5 + 0.5);
    rgba[i * 4 + 1] = packByte(vy[i] / pack * 0.5 + 0.5);
    rgba[i * 4 + 3] = 255;
  }
  return { n, rgba, pack };
}

/** R wet mask, 0..1. LINEAR upload — nearest would read as blocks. */
export function packWet(state) {
  const n = state.n;
  const rgba = new Uint8Array(n * n * 4);
  for (let i = 0; i < n * n; i++) {
    rgba[i * 4] = packByte(state.wet[i]);
    rgba[i * 4 + 3] = 255;
  }
  return { n, rgba };
}

/** FNV-1a over the packed RG velocity. Slice 2 hashes the texture, not just the field. */
export function hashPacked(packed) {
  let h = 2166136261;
  const b = packed.rgba;
  for (let i = 0; i < b.length; i += 4) {
    h ^= b[i];
    h = Math.imul(h, 16777619);
    h ^= b[i + 1];
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * One live frame of the wet hook. Freeze holds the last field (do not
 * zero it — resume would pop). Wetness 0 does not step and returns a
 * gain of exactly 0 so the feed hook does not bind the texture.
 * `slot` is caller-owned `{ vortex }`.
 */
export function noteWetFrame(slot, { wetness, freeze, seed, width, height, instances, behave, motion }) {
  const step = wetnessStep(wetness);
  if (step === 0) return { wetStep: 0, wetGain: 0, wetAmount: 0, wetVel: null, wetMask: null };
  const w = width > 0 ? width : 1000;
  const h = height > 0 ? height : 700;
  const s = (Number(seed) | 0) || 970;
  if (!slot.vortex || slot.seed !== s || slot.width !== w || slot.height !== h) {
    slot.vortex = createVortex({ seed: s, width: w, height: h });
    slot.seed = s;
    slot.width = w;
    slot.height = h;
  }
  if (freeze) stepVortex(slot.vortex, { freeze: true });
  else {
    emitFromInstances(slot.vortex, instances || []);
    emitAmbientFrom(slot.vortex, { behave, motion });
    // #998: the wet mask advects at the same rate as the feed shader's wet
    // offset, so the splotch rims travel with the smeared trails.
    stepVortex(slot.vortex, { wetAdvect: advectGain(wetness) });
  }
  const amount = advectGain(wetness);
  return {
    wetStep: 1,
    wetGain: amount * (VORTEX_VEL_PACK / w),
    wetAmount: amount,
    wetVel: packVelocity(slot.vortex),
    wetMask: packWet(slot.vortex),
  };
}
