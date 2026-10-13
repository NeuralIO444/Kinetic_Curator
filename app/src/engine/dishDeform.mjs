/**
 * dishDeform.mjs — petri dish B1 (#1410): impact deform. Contacts stop
 * being billiard balls: a body that gets hit (or pressed by a crowd)
 * squashes along the collision axis, bulges across it, and springs back.
 *
 * The law, end to end:
 *
 *   FEED — both contact passes already compute everything needed: the
 *   bounce impulse (per-body Δv along the pair normal) and the
 *   depenetration overlap. feedDishDeform() turns a resolved pair into a
 *   dent target per body — max(impact, pressure), never a sum, so a body
 *   pressed from three sides takes its worst dent, not an unbounded one —
 *   and raises the body's spring state to it (a weaker later hit never
 *   erases a stronger dent mid-recovery; the strongest current push owns
 *   the axis). Feed is state only: it writes no position, no velocity.
 *
 *   SPRING — recovery runs on the Spine C (#389) critically-damped law,
 *   the same exp-damp step the heading spring uses:
 *       amt *= exp(-lambda * dt),  lambda = 10 (Spine C's base lambda).
 *   Exponential decay is monotone by construction: the dent settles to
 *   rest with no overshoot and no sign flip, ever. No second spring was
 *   invented; this is that law, aimed at zero.
 *
 *   WOBBLE — at rest a body is not still: a low-amplitude membrane wobble
 *   (the ORGANIC character) rides on top of the spring state, a pure
 *   function of the step counter and the body's own #558 uniqueness
 *   columns (phase / seedOffset / speedMul), so it is deterministic per
 *   step count and bake-identical. Amplitude scales with liveness
 *   (energy). Wobble and impact combine as vectors in squash space and
 *   the rendered (axis, amount) is their sum's direction and magnitude.
 *
 *   RENDER ATTRIBUTE ONLY — the step writes three render columns
 *   (deformAmt, deformAxisX/Y). getItems forwards them when non-zero;
 *   the scene contract carries them as `deform: [ax, ay, amt]`; QUAD_VS
 *   squashes the quad along that world axis, area-preserving. Nothing in
 *   this module reads or writes x/y/vx/vy, so the simulation is
 *   byte-identical with deform on or off — contacts.selfcheck pins it.
 *
 *   STILLNESS — under reduced-motion the rendered amount is 0 at every
 *   step: no wobble, and an impact dent resolves to rest and holds (the
 *   spring state still decays underneath, so a mid-performance exit from
 *   reduced-motion never pops a stale dent). Physics is untouched.
 *
 *   GOVERNOR — deform is a cost tier, shed on the spec §7 ladder after
 *   the tier-1 finishes and before radius fidelity / body counts (see
 *   the registration below and dishDeformShed in sceneContract.js, which
 *   applies the shed at contract build; stills/exports never shed).
 *
 * Columns live on the ParticleSystem (allocated beside the other SoA
 * state in particles.js): deformMem/deformMemX/deformMemY are the spring
 * state; deformAmt/deformAxisX/deformAxisY are the rendered result.
 * Zero per-frame allocation: feed and step write columns in place.
 */

import { registerCostTier } from '../gl/costTiers.mjs';

// Tier 2: after the tier-1 finishes (the ACCUM chain, mirror/gloss — spec
// §7 "shed FX finishes first"), before radius fidelity and body counts,
// which have no cheaper rung left to give. CPU bookkeeping per contact
// pair + per body per step; the GPU side is a gated branch in the
// existing QUAD_VS (a few ALU per vertex, skipped at amount 0).
registerCostTier('engine/dish-deform', {
  tier: 2,
  memoryBytes: 0,
  timeMs: 0.03,
  notes:
    '#1410 petri dish B1: impact deform. Feed = a few flops per resolved ' +
    'contact pair; step = one exp-damp + one wobble evaluation per body; ' +
    'render = one gated anisotropic squash in QUAD_VS (location 7). No ' +
    'passes, no textures. Shed at contract build when perfTier1 is on ' +
    'and quality has stepped to performance (dishDeformShed).',
});

/** The deepest dent a body can take: 45% squash along the axis (the
 *  shader bulges across by 1/(1-amt), so the area — the membrane's
 *  volume — is preserved). */
export const DEFORM_MAX = 0.45;
/** Spine C's base lambda (#389): the recovery rate of the dent spring. */
export const DEFORM_SPRING_LAMBDA = 10;
/** Squash per unit of normal Δv the impulse handed this body. The
 *  canonical head-on (Δv 4) dents 0.24 — clearly visible, far from cap. */
export const DEFORM_IMPACT_GAIN = 0.06;
/** Squash per unit of overlap fraction (overlap / rsum): a pair pressed
 *  a quarter into each other dents 0.125 before any impulse speaks. */
export const DEFORM_PRESSURE_GAIN = 0.5;
/** Membrane wobble ceiling (before the liveness scale). */
export const WOBBLE_MAX = 0.05;
/** Wobble phase advance per step at speedMul 1: a full cycle ≈ 2.3 s. */
const WOBBLE_STEP = 0.045;
const TAU = Math.PI * 2;

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Feed one resolved contact pair into both bodies' deform springs.
 * Called from the two contact passes (call sites only — the law lives
 * here). (nx, ny) is the pair normal pointing from body i to body j;
 * dvI/dvJ are the normal velocity changes the impulse (bounce + repel)
 * actually handed each body this resolution (0 when none did); overlap
 * and rsum are the depenetration figures. A system whose deform switch
 * is off (sys._deformOn === false) is skipped per body.
 */
export function feedDishDeform(sysI, i, sysJ, j, nx, ny, dvI, dvJ, overlap, rsum) {
  const press = rsum > 0 ? Math.min(DEFORM_MAX, (overlap / rsum) * DEFORM_PRESSURE_GAIN) : 0;
  if (sysI._deformOn !== false) {
    const t = Math.max(dvI * DEFORM_IMPACT_GAIN, press);
    if (t > sysI.deformMem[i]) {
      sysI.deformMem[i] = Math.min(DEFORM_MAX, t);
      sysI.deformMemX[i] = nx;
      sysI.deformMemY[i] = ny;
    }
  }
  if (sysJ._deformOn !== false) {
    const t = Math.max(dvJ * DEFORM_IMPACT_GAIN, press);
    if (t > sysJ.deformMem[j]) {
      sysJ.deformMem[j] = Math.min(DEFORM_MAX, t);
      sysJ.deformMemX[j] = nx;
      sysJ.deformMemY[j] = ny;
    }
  }
}

/** A body's deform state starts clean (breed, respawn). */
export function clearDishDeform(sys, i) {
  sys.deformMem[i] = 0;
  sys.deformMemX[i] = 1;
  sys.deformMemY[i] = 0;
  sys.deformAmt[i] = 0;
}

/**
 * Advance every body's deform by one step: spring recovery (Spine C
 * exp-damp), then compose the rendered (axis, amount) from spring +
 * wobble. opts.reducedMotion renders rest unconditionally (the stillness
 * law). A system with its deform switch off renders nothing and its
 * spring state is cleared, so re-enabling never resurrects a stale dent.
 */
export function stepDishDeform(sys, dtSec, opts = {}) {
  const n = sys.n;
  if (!n) return;
  const MEM = sys.deformMem; const MX = sys.deformMemX; const MY = sys.deformMemY;
  const AMT = sys.deformAmt; const AX = sys.deformAxisX; const AY = sys.deformAxisY;
  const ALIVE = sys.alive; const ENERGY = sys.energy;
  const PHASE = sys.phase; const SOFF = sys.seedOffset; const SMUL = sys.speedMul;
  const on = sys._deformOn !== false;
  const still = !on || !!opts.reducedMotion;
  // Spine C (#389): amt *= exp(-lambda * dt) — the critically-damped step,
  // monotone to rest, no overshoot. Identical law to the heading spring.
  const keep = Math.exp(-DEFORM_SPRING_LAMBDA * dtSec);
  const step = sys._step;
  for (let i = 0; i < n; i++) {
    if (!ALIVE[i]) { MEM[i] = 0; AMT[i] = 0; continue; }
    let s = MEM[i] * keep;
    if (s < 1e-4) s = 0; // settled: exact rest, not an asymptote
    MEM[i] = on ? s : 0;
    if (still) { AMT[i] = 0; continue; }
    // Membrane wobble: signed, per-body decorrelated (#558 columns), a
    // pure function of the step counter — same steps, same wobble, in
    // the live loop and in the bake alike.
    const liv = 0.25 + 0.75 * clamp01(ENERGY[i]);
    const wa = WOBBLE_MAX * liv
      * Math.sin(step * WOBBLE_STEP * (SMUL[i] || 1) + PHASE[i] * TAU + SOFF[i] * TAU);
    const wang = (SOFF[i] + PHASE[i]) * TAU;
    const dx = MX[i] * s + wa * Math.cos(wang);
    const dy = MY[i] * s + wa * Math.sin(wang);
    const m = Math.sqrt(dx * dx + dy * dy);
    if (m < 1e-5) { AMT[i] = 0; continue; }
    AMT[i] = Math.min(DEFORM_MAX, m);
    AX[i] = dx / m;
    AY[i] = dy / m;
  }
}
