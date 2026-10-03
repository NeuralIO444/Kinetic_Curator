// kineme.js — KINEME living-motion: the time core (slice 1).
//
// Pure. No React, no store, no GL. Kineme animates EXISTING parameters —
// it never invents render features.
//
// The staged-eval pipeline treats kineme inputs as EPHEMERAL (like
// audioEnergy): they ride the per-frame path and NEVER enter
// geometrySignature, so a living canvas does not bust the geometry cache.
//
// Time model (spec: one clock for phrases, morphs, sequencer, kineme):
//   loopMs  → kinemeLoopSec → driver clock (anchored RATE) → driver time
//   boil drivers read boilSec(driverTime) — time snapped down to the
//   nearest boil frame, the hand-drawn "boil" look.
//   smooth drivers read driver time raw.
//
// The anchored clock is Build A's createKinemeClock (data/kinemes.js),
// reused, not re-derived: rate 1 IS the loop time exactly, rate 0 freezes
// where it is, and a rate change re-anchors instead of jumping.
import { kinemePhase as hashPhase, createKinemeClock } from '../data/kinemes.js';

/** Boil default: the classic hand-drawn rate (Matt decision 2). */
export const BOIL_FPS_DEFAULT = 8;
export const BOIL_FPS_MIN = 6;
export const BOIL_FPS_MAX = 12;

/**
 * Loop ms → loop seconds. The loopClock mirror starts at 0 ("not observed
 * yet") — 0 is unknown, not a stamp, so it maps to 0, never backwards.
 */
export function kinemeLoopSec(loopMs) {
  const ms = Number(loopMs);
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return ms / 1000;
}

/** Boil fps into the exposed 6–12 range; garbage → default. */
export function clampBoilFps(fps) {
  const f = Number(fps);
  if (!Number.isFinite(f)) return BOIL_FPS_DEFAULT;
  return Math.min(BOIL_FPS_MAX, Math.max(BOIL_FPS_MIN, f));
}

/** Which boil frame the loop second sits in. */
export function boilStep(loopSec, fps = BOIL_FPS_DEFAULT) {
  const t = Number(loopSec);
  if (!Number.isFinite(t) || t <= 0) return 0;
  return Math.floor(t * clampBoilFps(fps));
}

/** The loop second snapped down to its boil frame. Holds inside a frame. */
export function boilSec(loopSec, fps = BOIL_FPS_DEFAULT) {
  return boilStep(loopSec, fps) / clampBoilFps(fps);
}

/**
 * Per-instance phase: TWO decorrelated [0,1) values from the seed hash —
 * [0] offsets where in the noise field the mark samples, [1] offsets which
 * boil frame it lands on. Copies never move in lockstep.
 *
 * Sine-free by construction: it reuses Build A's djb2 string hash
 * (kinemePhase), which is pure integer arithmetic, not the classic
 * sine-based hash that degrades on weaker GPUs. Domain-separated keys
 * decorrelate the pair.
 */
export function kinemePhase2(seed, index) {
  return [hashPhase(seed, `n:${index}`), hashPhase(seed, `b:${index}`)];
}

/** The anchored performer clock. One instance per loop owner. */
export function createDriverClock() {
  return createKinemeClock();
}

/** Driver time in seconds: anchored clock over loop ms at the given RATE. */
export function driverTimeSec(clock, loopMs, rate = 1) {
  return clock.at(kinemeLoopSec(loopMs), rate);
}

// ── Driver API (slice 2) ─────────────────────────────────────────────────
// A driver declares: stable id, which existing parameter(s) it animates,
// what its amount means in real units, phase mode, boil vs smooth clock,
// and its cost tier. Kineme never invents render features — it moves knobs
// that already exist.

/**
 * The v1 driver set (Matt decision 6: curated four).
 * amount: 0..1. Amount 0 = today's render exactly (hard gate below).
 */
export const KINEME_DRIVERS = Object.freeze([
  {
    id: 'breath',
    targets: ['scale'],
    amountMeaning: 'scale swell depth, fraction of mark scale',
    amountRange: [0, 1],
    phaseMode: 'per-instance',
    clock: 'smooth',
    costTier: 'cpu-cheap',
  },
  {
    id: 'drift',
    targets: ['x', 'y'],
    amountMeaning: 'wander reach, fraction of the smaller canvas dimension',
    amountRange: [0, 1],
    phaseMode: 'per-instance',
    clock: 'smooth',
    costTier: 'cpu-cheap',
  },
  {
    id: 'pulse',
    targets: ['scale'],
    amountMeaning: 'scale thump depth, fraction of mark scale',
    amountRange: [0, 1],
    phaseMode: 'per-instance',
    clock: 'smooth',
    costTier: 'cpu-cheap',
  },
  {
    id: 'brush-wobble',
    targets: ['wobbleAmp'],
    amountMeaning: 'boiled wobble reach, fraction of the edge band',
    amountRange: [0, 1],
    phaseMode: 'per-instance',
    clock: 'boil',
    costTier: 'cpu-cheap',
  },
].map(Object.freeze));

const DRIVER_IDS = new Set(KINEME_DRIVERS.map((d) => d.id));

/** The driver declaration for an id, or undefined. */
export function getKinemeDriver(id) {
  return KINEME_DRIVERS.find((d) => d.id === id);
}

/** True when the id names a v1 driver. */
export function isKinemeDriver(id) {
  return DRIVER_IDS.has(id);
}

const TAU = Math.PI * 2;

// Real-unit scales: amount 1.0 → these peaks. Subtle by design.
const BREATH_DEPTH = 0.09; // ±9% scale swell, ~9s period
const BREATH_HZ = 0.11;
const DRIFT_REACH = 0.02; // ±2% of the smaller canvas dimension
const DRIFT_HZ_X = 0.07;
const DRIFT_HZ_Y = 0.083; // decorrelated axis rate
const PULSE_DEPTH = 0.16; // 16% thump at the beat
const PULSE_HZ = 0.5; // 2s period

function num01(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.min(1, n) : 0;
}

/**
 * Evaluate the drivers for every instance. Pure.
 *
 * ctx: {
 *   seed,            // project seed — per-instance phase source
 *   driverSec,       // smooth-driver time (anchored clock seconds)
 *   boilStep,        // boil-driver frame (held by the caller on shed tier 1+)
 *   amounts,         // { breath, drift, pulse, brushWobble } 0..1
 *   canvasW, canvasH // drift units
 * }
 *
 * soa: the stage-C SoA ({ n, index } read; channels written by the applier).
 *
 * Returns { active, dScale, dx, dy, dWobble } — Float64Arrays over slots.
 * active is false when no driver has amount > 0: the applier then skips the
 * SoA entirely, so amount 0 is bit-identical to no kineme (hard gate — the
 * noise math is skipped, not multiplied by zero).
 *
 * dWobble is consumed by applyKinemeDrivers below: the boiled offset rides
 * the trail perpendicular (soa.wobNX/wobNY) written by the brush sampler.
 */
export function evaluateKineme(soa, ctx) {
  const n = soa?.n | 0;
  const out = {
    active: false,
    dScale: new Float64Array(n),
    dx: new Float64Array(n),
    dy: new Float64Array(n),
    dWobble: new Float64Array(n),
  };
  if (!n || !ctx) return out;
  const t = Number(ctx.driverSec);
  if (!Number.isFinite(t)) return out;
  const step = ctx.boilStep | 0;
  const amounts = ctx.amounts || {};
  const seed = ctx.seed | 0;

  const breath = num01(amounts.breath);
  if (breath > 0) {
    out.active = true;
    for (let k = 0; k < n; k++) {
      const [uN] = kinemePhase2(seed, soa.index[k]);
      out.dScale[k] += breath * BREATH_DEPTH * Math.sin(TAU * (BREATH_HZ * t + uN));
    }
  }

  const drift = num01(amounts.drift);
  if (drift > 0) {
    out.active = true;
    const m = Math.min(Number(ctx.canvasW) || 0, Number(ctx.canvasH) || 0);
    const reach = drift * DRIFT_REACH * m;
    if (reach > 0) {
      for (let k = 0; k < n; k++) {
        const [uN, uB] = kinemePhase2(seed, soa.index[k]);
        out.dx[k] += reach * Math.sin(TAU * (DRIFT_HZ_X * t + uN));
        out.dy[k] += reach * Math.sin(TAU * (DRIFT_HZ_Y * t + uB));
      }
    }
  }

  const pulse = num01(amounts.pulse);
  if (pulse > 0) {
    out.active = true;
    for (let k = 0; k < n; k++) {
      const [uN] = kinemePhase2(seed, soa.index[k]);
      const ph = (((PULSE_HZ * t + uN) % 1) + 1) % 1;
      const thump = (1 - ph) * (1 - ph) * (1 - ph);
      out.dScale[k] += pulse * PULSE_DEPTH * thump;
    }
  }

  const wobble = num01(amounts.brushWobble);
  if (wobble > 0) {
    out.active = true;
    for (let k = 0; k < n; k++) {
      // Boiled value noise: one hash per (frame, slot), snapped to the
      // boil frame — the line holds, then jumps. Sine-free (djb2).
      const w = hashPhase(step, `wb:${soa.index[k]}`);
      out.dWobble[k] += wobble * 2 * (w - 0.5);
    }
  }

  return out;
}

/**
 * Stage-C applier: fold driver deltas into the SoA channels. Called after
 * applyAttributes in buildPlacements. Ephemeral input — never enters
 * geometrySignature (same deal as audioEnergy).
 *
 * ctx.shedTier >= 3 (pin-to-rest / zero-amounts) → identity, channels
 * untouched. !active → identity, channels untouched (the hard gate).
 *
 * Brush-line boil: the boiled wobble (dWobble, ±amount edge-band fraction)
 * rides the trail perpendicular stored in geometry (soa.wobNX/wobNY), scaled
 * by ctx.wobbleAmp (px). The normals are (0,0) off brush mode, so this is a
 * natural no-op everywhere else; wobbleAmp 0 means no wobble character to
 * boil. Freeze holds boilStep upstream, so the pose holds here for free.
 */
export function applyKinemeDrivers(soa, ctx) {
  if (!soa || !ctx) return;
  if ((ctx.shedTier | 0) >= 3) return;
  const d = evaluateKineme(soa, ctx);
  if (!d.active) return;
  const n = soa.n | 0;
  // Brush-line boil (wired): the boiled offset rides the geometry normals.
  // Guarded for hand-rolled SoAs (selfchecks) that lack the channels.
  const reach = Number(ctx.wobbleAmp) || 0;
  const wnx = soa.wobNX, wny = soa.wobNY;
  const boil = reach > 0 && wnx && wny;
  for (let k = 0; k < n; k++) {
    soa.scale[k] *= 1 + d.dScale[k];
    soa.x[k] += d.dx[k];
    soa.y[k] += d.dy[k];
    if (boil) {
      const w = d.dWobble[k] * reach;
      soa.x[k] += w * wnx[k];
      soa.y[k] += w * wny[k];
    }
  }
}

/**
 * Seed-derived still instant (Matt decision 5): hash the project seed into
 * a moment within one boil period. Same seed → same printed frame, always;
 * reseed → a new (equally good) moment.
 */
export function kinemeStillSec(seed, fps = BOIL_FPS_DEFAULT) {
  const u = hashPhase(seed | 0, 'still');
  return u / clampBoilFps(fps);
}

/**
 * Seed-derived still boil frame (slice 5): the boiled drivers' drawing at
 * print time. Same seed → same drawing; reseed → a new one. Any
 * non-negative int is a valid frame — the wobble hash is keyed on it.
 */
export function kinemeStillStep(seed) {
  return Math.floor(hashPhase(seed | 0, 'still-boil') * 4096);
}

/**
 * Assemble the per-frame kineme ctx for buildPlacements (slice 3).
 *
 * driverSec is the ANCHORED driver time (the same kinemeTime the GPU
 * contract carries for Build A): freeze holds it, resume continues it, and
 * a RATE change re-anchors instead of jumping — the whole pose contract
 * rides one value.
 *
 * boilStep is caller-computed (slice 4): the live resolver holds it across
 * frames on governor shed tier 1+, so the boil freezes pose instead of
 * stepping. Stills compute it once from the seed-derived instant.
 *
 * wobbleAmp rides the ctx so the stage-C applier can scale the boiled brush
 * offset in px (fraction of the edge band, per the spec).
 *
 * Returns null when every amount is 0: the pipeline then skips kineme
 * entirely (zero cost when the artist hasn't turned it on). Garbage time
 * → null, never NaN into the pipeline.
 */
export function buildKinemeCtx({ layoutParams, driverSec, boilStep, seed, canvasW, canvasH, shedTier = 0 }) {
  const lp = layoutParams || {};
  const amounts = {
    breath: num01(lp.kinemeBreath),
    drift: num01(lp.kinemeDrift),
    pulse: num01(lp.kinemePulse),
    brushWobble: num01(lp.kinemeBrushWobble),
  };
  if (!(amounts.breath > 0 || amounts.drift > 0 || amounts.pulse > 0 || amounts.brushWobble > 0)) {
    return null;
  }
  const t = Number(driverSec);
  if (!Number.isFinite(t)) return null;
  const step = boilStep | 0;
  return {
    driverSec: t,
    boilStep: step,
    seed: seed | 0,
    amounts,
    canvasW,
    canvasH,
    shedTier: shedTier | 0,
    // Brush-line boil reach (px): the brush's own wobbleAmp. The boil is a
    // fraction of the edge band (spec) — no wobble character, nothing to boil.
    wobbleAmp: Math.max(0, Number(lp.wobbleAmp) || 0),
  };
}

/** Governor shed-tier labels (slice 4) — TE-terse, for the badge/event log. */
export const KINEME_SHED_LABELS = Object.freeze({
  1: 'BOIL HELD',
  2: 'LIVING MOTION HELD',
  3: 'MOTION PINNED TO REST',
  4: 'LIVING MOTION OFF',
});

/**
 * Governor shed hold logic (slice 4). Pure.
 *
 * tier 1: hold the boil — boil drivers freeze pose, smooth drivers live on.
 * tier 2: hold all kineme — driver time and boil both freeze.
 * tier 3/4: identity — pin to rest / zero amounts (the hard gate in
 *   applyKinemeDrivers leaves the channels untouched).
 *
 * held is the caller's stored frame ({ driverSec, boilStep } | null).
 * Recovery resumes from the held pose: held values persist until the tier
 * clears, and seed/phase are never touched, so nothing re-anchors.
 */
export function holdKinemeTimes(held, tier, driverSec, boilStep) {
  const next = {
    driverSec: held?.driverSec ?? null,
    boilStep: held?.boilStep ?? null,
  };
  let t = driverSec;
  let b = boilStep;
  if (tier >= 2) {
    if (next.driverSec == null) next.driverSec = driverSec;
    t = next.driverSec;
  } else {
    next.driverSec = null;
  }
  if (tier >= 1) {
    if (next.boilStep == null) next.boilStep = boilStep;
    b = next.boilStep;
  } else {
    next.boilStep = null;
  }
  return { held: next, driverSec: t, boilStep: b };
}
