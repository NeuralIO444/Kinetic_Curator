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
import { createNoise } from './noise.js'; // #1198 — ORGANIC rhythm samples this Perlin field
import { ACCENT_OFFSET } from './kernel/color/index.js';
import { registerCostTier, getCostTier } from './kernel/costRegistry.mjs'; // #1574 — the travel pass declares its cost like every module
import { travelBudgetForDevice } from '../data/quality.js'; // #1574 Q2 — the device-class traveler budgets live with the other device budgets

/** Boil default: the classic hand-drawn rate (Matt decision 2). */
/**
 * #1128 — the DIRECTOR's driver patterns. The Curator's amounts (kinemeBreath/Drift/Pulse) are the scene-level
 * scale; a pattern only RE-WEIGHTS them, it never invents motion a scene did not already have:
 *   DRIFT  the floor: the amounts as set.
 *   SWELL  breath-forward: breath x3 (capped at 1), drift x0.2: the marks visibly breathe and hardly wander.
 *   THUMP  pulse-forward and driven by a REAL beat (audio on): the pulse amount is THUMP_PULSE x the live beat
 *          envelope, so it thumps when the room does and rests between. With no audio it IS DRIFT (a reduction).
 * #1198 — the rhythm family (ORGANIC, CADENCE): these do NOT re-weight the amounts — they switch on the
 * rhythm placement layer (evaluateRhythm/applyRhythm below), a Perlin/sine field over spacing, scale and rotation
 * that breaks grid rigidity. Selecting one activates the layer even when every motion amount is 0.
 * An unknown name is DRIFT. beatDrive is the shaped beat pulse 0..1, or null/undefined when nothing is listening.
 */
export const KINEME_PATTERNS = Object.freeze(['DRIFT', 'SWELL', 'THUMP', 'ORGANIC', 'CADENCE']);
export const THUMP_PULSE = 0.6;
export function patternAmounts(base, pattern, beatDrive) {
  const { breath, drift, pulse } = base;
  if (pattern === 'SWELL') return { breath: Math.min(1, breath * 3), drift: drift * 0.2, pulse };
  if (pattern === 'THUMP' && Number.isFinite(beatDrive)) {
    return { breath, drift, pulse: THUMP_PULSE * Math.min(1, Math.max(0, beatDrive)) };
  }
  return { breath, drift, pulse };
}

// ── Rhythm family (#1198) ────────────────────────────────────────────────
// ORGANIC and CADENCE are placement-layer modulations, not driver
// re-weightings: mathematical functions over each mark's placed position
// modulate spacing (small dx/dy offsets), scale and rotation, breaking grid
// rigidity — repetition you can feel, not a grid you can see. A pattern is
// a routing + a function; the three channels ride one field in v1.
//
// Unlike the drivers, rhythm is STATIC per (seed, placement): the field is
// a function of where the mark landed, not of driver time. The still shows
// the rhythm (the rigidity break must survive printing); the time-based
// drivers compose on top. Deterministic per seed — no Math.random anywhere.

/** True for the rhythm patterns (the placement layer), false for driver patterns. */
export function isRhythmPattern(pattern) {
  return pattern === 'ORGANIC' || pattern === 'CADENCE';
}

/**
 * The rhythm function a pattern selects: 'perlin' for ORGANIC (via the
 * existing createNoise — no new deps), 'sine' for CADENCE, null for every
 * other pattern. livingMotion passes this through as ctx.rhythm.
 */
export function rhythmTypeForPattern(pattern) {
  if (pattern === 'ORGANIC') return 'perlin';
  if (pattern === 'CADENCE') return 'sine';
  return null;
}

// Rhythm real-unit scales. There is no amount knob in v1: the pattern is
// the switch, and the field is small by design — organic rhythm, never
// jitter. Compare: breath ±9% scale, drift ±2% of the small dimension.
export const RHYTHM_SCALE = 0.06; // ±6% uniform scale
export const RHYTHM_ROT = 6; // ±6° rotation (soa.rotation is degrees, SVG convention)
export const RHYTHM_DX = 0.008; // ±0.8% of the smaller canvas dimension
export const RHYTHM_DY = 0.008;
export const RHYTHM_FIELD_FREQ = 2.5; // ORGANIC: noise cycles across the canvas
export const CADENCE_CYCLES = 3; // CADENCE: sine wavefronts across the canvas (diagonal)

// Perlin channel offsets in the noise field's z: one field, four
// decorrelated slices — spacing X, spacing Y, scale and rotation never
// march together.
const RHYTHM_Z = [0, 11.7, 23.4, 35.1];
// CADENCE channel phases (radians): the wave runs diagonally across the
// canvas; each channel rides it at its own phase.
const CADENCE_PHASES = [0, 1.7, 3.4, 5.1];

// One noise instance per seed, bounded like PHASE_CACHE below: the field
// is pure per seed, and rebuilding the permutation table per frame per
// layer is wasted allocation.
const NOISE_CACHE = new Map();
const NOISE_CACHE_MAX = 8;
function noiseFor(seed) {
  let n = NOISE_CACHE.get(seed);
  if (!n) {
    if (NOISE_CACHE.size >= NOISE_CACHE_MAX) NOISE_CACHE.delete(NOISE_CACHE.keys().next().value);
    n = createNoise(seed);
    NOISE_CACHE.set(seed, n);
  }
  return n;
}

/**
 * Evaluate the rhythm field for every instance. Pure.
 *
 * ctx: {
 *   seed,            // the field's seed — deterministic per seed
 *   rhythm,          // { type: 'perlin'|'sine' } — the pattern's function
 *   canvasW, canvasH // spacing offsets scale with the smaller dimension
 * }
 *
 * soa: the stage-C SoA. x/y are READ (the field is sampled at the placed
 * position, so it composes with every sampler); the written channels are
 * the returned deltas.
 *
 * Returns { active, dRot, dx, dy, dScale } — Float64Arrays over slots.
 * active is false unless a rhythm pattern is selected: the pattern is the
 * gate, and motion amounts are irrelevant — selecting ORGANIC with every
 * amount at 0 still turns the layer on.
 */
export function evaluateRhythm(soa, ctx) {
  const n = soa?.n | 0;
  const out = {
    active: false,
    dRot: new Float64Array(n),
    dx: new Float64Array(n),
    dy: new Float64Array(n),
    dScale: new Float64Array(n),
  };
  if (!n || !ctx) return out;
  const type = ctx.rhythm?.type;
  if (type !== 'perlin' && type !== 'sine') return out;
  const W = Number(ctx.canvasW), H = Number(ctx.canvasH);
  const m = Math.min(W, H);
  if (!(m > 0)) return out;
  const seed = ctx.seed | 0;
  out.active = true;

  if (type === 'perlin') {
    const noise = noiseFor(seed);
    const F = RHYTHM_FIELD_FREQ;
    for (let k = 0; k < n; k++) {
      const X = (soa.x[k] / W) * F, Y = (soa.y[k] / H) * F;
      out.dScale[k] = RHYTHM_SCALE * noise.noise3D(X, Y, RHYTHM_Z[0]);
      out.dRot[k] = RHYTHM_ROT * noise.noise3D(X, Y, RHYTHM_Z[1]);
      out.dx[k] = RHYTHM_DX * m * noise.noise3D(X, Y, RHYTHM_Z[2]);
      out.dy[k] = RHYTHM_DY * m * noise.noise3D(X, Y, RHYTHM_Z[3]);
    }
  } else {
    const phase = hashPhase(seed, 'rhythm:cadence'); // [0,1): the wave's seed offset
    for (let k = 0; k < n; k++) {
      const w = TAU * (((soa.x[k] / W) + (soa.y[k] / H)) * 0.5 * CADENCE_CYCLES + phase);
      out.dScale[k] = RHYTHM_SCALE * Math.sin(w + CADENCE_PHASES[0]);
      out.dRot[k] = RHYTHM_ROT * Math.sin(w + CADENCE_PHASES[1]);
      out.dx[k] = RHYTHM_DX * m * Math.sin(w + CADENCE_PHASES[2]);
      out.dy[k] = RHYTHM_DY * m * Math.sin(w + CADENCE_PHASES[3]);
    }
  }
  return out;
}

/**
 * Stage-C applier for the rhythm layer: fold dRot/dScale/dx/dy into the
 * SoA channels. Called after applyAttributes in buildPlacements, BEFORE
 * applyKinemeDrivers — rhythm is the placement layer, the time drivers
 * compose on top. Ephemeral: never enters geometrySignature (same deal as
 * audioEnergy).
 *
 * dRot/dScale ride stage-C channels (rewritten every frame by
 * applyAttributes: no undo). dx/dy touch the CACHED x/y, so the applier
 * hands back an UNDO like the driver applier; buildPlacements undoes the
 * rhythm AFTER the drivers (reverse of application). shedTier >= 3 →
 * identity. !active → identity. still[k] (artist-pinned): the mark keeps
 * its placed everything.
 */
const RHYTHM_BASE_XY = new WeakMap();

/** Applies the rhythm layer; returns a function that restores the cached positions, or null when nothing moved. */
export function applyRhythm(soa, ctx, still = null) {
  if (!soa || !ctx) return null;
  if ((ctx.shedTier | 0) >= 3) return null;
  const r = evaluateRhythm(soa, ctx);
  if (!r.active) return null;
  const n = soa.n | 0;
  let base = RHYTHM_BASE_XY.get(soa);
  if (!base || base.x.length < n) { base = { x: new Float64Array(n), y: new Float64Array(n) }; RHYTHM_BASE_XY.set(soa, base); }
  for (let k = 0; k < n; k++) { base.x[k] = soa.x[k]; base.y[k] = soa.y[k]; }
  for (let k = 0; k < n; k++) {
    if (still && still[k]) continue;
    // #1202 — scale AND scaleY: rhythm dScale is uniform scale modulation;
    // touching only soa.scale would shear linked marks (scaleY is bit-equal
    // to scale when X/Y are linked).
    const sMul = 1 + r.dScale[k];
    soa.scale[k] *= sMul;
    soa.scaleY[k] *= sMul;
    soa.rotation[k] += r.dRot[k];
    soa.x[k] += r.dx[k];
    soa.y[k] += r.dy[k];
  }
  return () => {
    for (let k = 0; k < n; k++) { soa.x[k] = base.x[k]; soa.y[k] = base.y[k]; }
  };
}

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

// #1128 — the per-instance phases are a pure function of (seed, index) and the live path asks for them for every
// instance on every frame: building two djb2 strings per instance per frame is wasted allocation at 800 marks. Cache
// them per seed (a handful of seeds, a bounded map); the values are bit-identical to kinemePhase2.
const PHASE_CACHE = new Map();
const PHASE_CACHE_MAX = 8;
function phasesFor(seed, index) {
  let c = PHASE_CACHE.get(seed);
  if (!c) {
    if (PHASE_CACHE.size >= PHASE_CACHE_MAX) PHASE_CACHE.delete(PHASE_CACHE.keys().next().value);
    c = { n: new Float64Array(0), b: new Float64Array(0), have: new Uint8Array(0) };
    PHASE_CACHE.set(seed, c);
  }
  if (index >= c.have.length) {
    const len = Math.max(index + 1, c.have.length * 2, 64);
    const grow = (a, T) => { const o = new T(len); o.set(a); return o; };
    c.n = grow(c.n, Float64Array); c.b = grow(c.b, Float64Array); c.have = grow(c.have, Uint8Array);
  }
  if (!c.have[index]) { const p = kinemePhase2(seed, index); c.n[index] = p[0]; c.b[index] = p[1]; c.have[index] = 1; }
  return c;
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
  {
    id: 'palette-breath', // #1151 — per-instance palette sweep (Davis colorOsc, homage)
    targets: ['paletteShift'],
    amountMeaning: 'palette sweep reach, fraction of palette length',
    amountRange: [0, 1],
    phaseMode: 'per-instance',
    clock: 'smooth',
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
const PALETTE_HZ = 0.04; // #1151 — ~25s color breath; Davis's freq-5 cycling is the FULL BURN setting, not the default

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
 *   amounts,         // { breath, drift, pulse, brushWobble, paletteBreath } 0..1
 *   canvasW, canvasH // drift units
 *   palette,         // #1151 — { swatches }; palette-breath reach scales in slots of its length
 *   anchored,        // #1128: every driver is measured FROM its rest pose: at driver time 0 each delta is exactly 0,
 *                    // so a still (time 0) is byte-identical to a scene with no drivers, and a living canvas leaves
 *                    // its placed position instead of starting off it
 * }
 *
 * soa: the stage-C SoA ({ n, index } read; channels written by the applier).
 *
 * Returns { active, dScale, dx, dy, dWobble, dPalette } — Float64Arrays over
 * slots. dPalette is the palette-slot offset (signed, in slots); the applier
 * rounds and wraps it modulo palette length.
 * active is false when no driver has amount > 0: the applier then skips the
 * SoA entirely, so amount 0 is bit-identical to no kineme (hard gate — the
 * noise math is skipped, not multiplied by zero).
 *
 * dWobble is computed but has no stage-C consumer until brush mode lands
 * (#894/#897): on main it is evaluated, tested, and left unapplied.
 */
export function evaluateKineme(soa, ctx) {
  const n = soa?.n | 0;
  const out = {
    active: false,
    dScale: new Float64Array(n),
    dx: new Float64Array(n),
    dy: new Float64Array(n),
    dWobble: new Float64Array(n),
    dPalette: new Float64Array(n),
  };
  if (!n || !ctx) return out;
  const t = Number(ctx.driverSec);
  if (!Number.isFinite(t)) return out;
  const step = ctx.boilStep | 0;
  const amounts = ctx.amounts || {};
  const seed = ctx.seed | 0;
  const anchored = !!ctx.anchored;

  const breath = num01(amounts.breath);
  if (breath > 0) {
    out.active = true;
    for (let k = 0; k < n; k++) {
      const uN = phasesFor(seed, soa.index[k]).n[soa.index[k]];
      const s = Math.sin(TAU * (BREATH_HZ * t + uN));
      out.dScale[k] += breath * BREATH_DEPTH * (anchored ? s - Math.sin(TAU * uN) : s);
    }
  }

  const drift = num01(amounts.drift);
  if (drift > 0) {
    out.active = true;
    const m = Math.min(Number(ctx.canvasW) || 0, Number(ctx.canvasH) || 0);
    const reach = drift * DRIFT_REACH * m;
    if (reach > 0) {
      for (let k = 0; k < n; k++) {
        const ph = phasesFor(seed, soa.index[k]); const uN = ph.n[soa.index[k]]; const uB = ph.b[soa.index[k]];
        const sx = Math.sin(TAU * (DRIFT_HZ_X * t + uN)); const sy = Math.sin(TAU * (DRIFT_HZ_Y * t + uB));
        out.dx[k] += reach * (anchored ? sx - Math.sin(TAU * uN) : sx);
        out.dy[k] += reach * (anchored ? sy - Math.sin(TAU * uB) : sy);
      }
    }
  }

  const pulse = num01(amounts.pulse);
  if (pulse > 0) {
    out.active = true;
    for (let k = 0; k < n; k++) {
      const uN = phasesFor(seed, soa.index[k]).n[soa.index[k]];
      const ph = (((PULSE_HZ * t + uN) % 1) + 1) % 1;
      const thump = (1 - ph) * (1 - ph) * (1 - ph);
      const rph = ((uN % 1) + 1) % 1; // the phase at driver time 0, written exactly as above so the difference is exactly 0
      const rest = (1 - rph) * (1 - rph) * (1 - rph);
      out.dScale[k] += pulse * PULSE_DEPTH * (anchored ? thump - rest : thump);
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

  // #1151 — palette-breath: per-instance oscillator sweeping the palette
  // sampling position (Davis colorOsc, homage — the principle, not his
  // code). Traveling color waves via the same index-phase trick as breath:
  // copies never move in lockstep. Reach is in slots: amount 1 sweeps the
  // whole palette, the default (~0.12) shimmers ±a few slots. The applier
  // rounds and wraps modulo palette length, so a palette switch never pops —
  // the offset is relative and the phase is continuous.
  const paletteBreath = num01(amounts.paletteBreath);
  if (paletteBreath > 0) {
    const swatches = ctx.palette?.swatches;
    const len = Array.isArray(swatches) ? swatches.length : 0;
    const reach = paletteBreath * len;
    if (reach > 0) {
      out.active = true;
      for (let k = 0; k < n; k++) {
        const uN = phasesFor(seed, soa.index[k]).n[soa.index[k]];
        const s = Math.sin(TAU * (PALETTE_HZ * t + uN));
        out.dPalette[k] += reach * (anchored ? s - Math.sin(TAU * uN) : s);
      }
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
 * #1151 — palette-breath additionally shifts the per-instance palette slot.
 * It needs ctx.palette = { swatches }, ctx.colorArrays = { colors, accents }
 * (the bind-cache arrays, mutated in place and restored by the undo) and
 * soa.palSlot[k] = the base slot assignColor chose. The new slot wraps
 * modulo palette length; accents re-derive from the shifted slot exactly
 * like assignColor. Still-marked instances keep their placed color.
 */
// #1128 — x and y live in the CACHED geometry SoA (stage C rewrites scale, rotation and alpha every frame, but never
// the positions). A driver that nudged them in place nudged the cache: every frame stacked on the last, and the
// placed picture walked away for good (found the first time the drivers were wired live: x 133, 142, 151 on three
// identical frames, and still displaced with the drivers off). So the applier hands back an UNDO that puts the
// cached positions back; buildPlacements calls it once the frame's items have been built.
const BASE_XY = new WeakMap();

/** Applies the drivers; returns a function that restores the cached positions, or null when nothing moved. */
export function applyKinemeDrivers(soa, ctx, still = null) {
  if (!soa || !ctx) return null;
  if ((ctx.shedTier | 0) >= 3) return null;
  const d = evaluateKineme(soa, ctx);
  if (!d.active) return null;
  const n = soa.n | 0;
  let base = BASE_XY.get(soa);
  if (!base || base.x.length < n) { base = { x: new Float64Array(n), y: new Float64Array(n) }; BASE_XY.set(soa, base); }
  for (let k = 0; k < n; k++) { base.x[k] = soa.x[k]; base.y[k] = soa.y[k]; }
  for (let k = 0; k < n; k++) {
    if (still && still[k]) continue; // #1128: pinned still by the artist: this mark stays where it was placed
    soa.scale[k] *= 1 + d.dScale[k];
    soa.x[k] += d.dx[k];
    soa.y[k] += d.dy[k];
  }

  // #1151 — palette-breath: shift the palette sampling slot, wrapped modulo
  // palette length. Amount 0 / no palette / shed tier ≥ 3 never reach here
  // (hard gate above). The undo re-derives base colors from the base slots,
  // so the bind-cached arrays are always base-valued on entry — the shift
  // never accumulates across frames, and a palette switch never pops (the
  // offset is relative, the phase continuous).
  let palUndo = null;
  const swatches = ctx.palette?.swatches;
  const colorArrays = ctx.colorArrays;
  if (num01(ctx.amounts?.paletteBreath) > 0 && Array.isArray(swatches) && swatches.length > 0
      && colorArrays?.colors && colorArrays?.accents && soa.palSlot) {
    const len = swatches.length;
    const { colors, accents } = colorArrays;
    const palSlot = soa.palSlot;
    for (let k = 0; k < n; k++) {
      if (still && still[k]) continue;
      const b = palSlot[k] | 0;
      if (b < 0 || b >= len) continue;
      const s = (((b + Math.round(d.dPalette[k])) % len) + len) % len;
      colors[k] = swatches[s];
      accents[k] = swatches[(s + ACCENT_OFFSET) % len] || swatches[0];
    }
    palUndo = () => {
      for (let k = 0; k < n; k++) {
        const b = palSlot[k] | 0;
        if (b < 0 || b >= len) continue;
        colors[k] = swatches[b];
        accents[k] = swatches[(b + ACCENT_OFFSET) % len] || swatches[0];
      }
    };
  }

  return () => {
    for (let k = 0; k < n; k++) { soa.x[k] = base.x[k]; soa.y[k] = base.y[k]; }
    if (palUndo) palUndo();
  };
  // dWobble: no consumer on main — brush mode (#894/#897) applies it when
  // it lands. Evaluated and tested here, wired defensively (no-op absent).
}

// ── Travel kinemes P1 (#1574) — the transport core ──────────────────────
// FLOW transport: marks leave home, roam the curl of the shared noise
// field, and are held by a leash. This is the production build of the
// #1573 spike's verdict (KEEP, Matt 2026-10-16), written in this family's
// own style — the spike branch is evidence, not a source.
//
// The sim differs from every driver above in one way: it has STATE.
// Per-instance { ox, oy, vx, vy } lives in a store the CALLER owns
// (liveResolve creates one per resolver), keyed by scene identity +
// instance index + seed, so it survives placement rebuilds — the
// geometry/bind caches may come and go, the roam continues. Base
// placement is HOME: the presented position is home + offset, and the
// offset is folded into the SoA exactly like the drivers above (an undo
// restores the cached positions once the frame's items are built).
//
// Replay law (creatures-spec §2, applied to a sim): nothing reads a
// clock or a random source. Integration runs on the spine-A dt clock at
// a LOCKED step, accumulated from the frame time the resolver hands in;
// the field's time is the step count, never a timestamp. Same seed +
// same step count = same positions, bit for bit — takeHash exactness is
// a gate (engine/travel.selfcheck.mjs), not a goal.
//
// PARITY: transport 'still' (the layout default) or a leash of 0 never
// reaches this code — buildPlacements gates on both — so an off scene
// produces a bit-identical SoA to the pre-#1574 pipeline.
// P1 ships FLOW only. PATH (P2) and SURGE (P3) are not built here.
// Q2 (the traveler budget) was RULED 2026-10-20 — governor-selected within
// a device-class cap — and its mechanism is built below (selectTravelers):
// on the desktop class the cap is the full 800-mark placement cap, so a
// desktop scene travels exactly as P1 built it; tighter classes travel a
// deterministic subset. See STAGING-REPORT.md.

/** The transport vocabulary: 'still' (the default — home is home), 'flow'
 *  (P1's curl-field roam) and 'path' (P2 #1575's pure-function anchors). */
export const TRANSPORT_MODES = Object.freeze(['still', 'flow', 'path']);

/** The PATH families (#1575): the anchor as a pure function of (t, seed, params). */
export const PATH_FAMILIES = Object.freeze(['orbit', 'spiral', 'sweep', 'lissajous']);

// ── Family assignment (#1575, Q1 — RULED by Matt, 2026-10-14) ──────────
// Linework and glyphs roam by default (FLOW/PATH as the family declares);
// heavy solids anchor (still). The #1434 pattern: the family table is a
// deterministic function of the asset record — no ML, no taste verdicts —
// and the artist's per-mark override tames it (the assetStill pin, which
// buildPlacements already feeds the transport pass: a pinned mark of any
// family stays home). A family earns a default by being named here, not
// by analogy: unnamed families return null (no declaration) and follow
// the stratum's own transport word, exactly as P1 shipped.
//
//   linework  → 'flow'  (the curl field suits strokes: they bend as they roam)
//   glyphs    → 'path'  (stamps/letters/type travel dealt lanes and orbits)
//   heavy solid (weight 'heavy' AND density 'solid' — the org_blob class)
//             → 'still' (anchored, whatever the stratum's word — see
//               isFamilyAnchored; the artist's pin is the taming override
//               in the other direction for every other family)
const GLYPH_TAGS = new Set(['glyph', 'letter', 'type']);

/** True when the asset is a heavy solid — the anchored family class. */
export function isFamilyAnchored(asset) {
  return !!asset && asset.weight === 'heavy' && asset.density === 'solid';
}

/**
 * The transport mode one asset's family declares, or null when its family
 * declares nothing. Heavy solids declare 'still' (checked first: a heavy
 * solid glyph still anchors — the anchor class is the ruling's own words).
 */
export function familyDefaultTransport(asset) {
  if (!asset) return null;
  if (isFamilyAnchored(asset)) return 'still';
  if (asset.category === 'linework') return 'flow';
  const tags = Array.isArray(asset.tags) ? asset.tags : [];
  if (asset.category === 'stamps' || tags.some((t) => GLYPH_TAGS.has(t))) return 'path';
  return null;
}

/**
 * The family default for a whole cast (the stratum block chip's readout):
 * the most-declared roam mode among the cast (ties break in declaration
 * order flow → path, deterministically), 'still' when the cast declares
 * nothing or anchors only.
 */
export function defaultTransportForCast(assets) {
  if (!Array.isArray(assets) || !assets.length) return 'still';
  const counts = { flow: 0, path: 0 };
  for (const a of assets) {
    const d = familyDefaultTransport(a);
    if (d === 'flow' || d === 'path') counts[d]++;
  }
  if (!counts.flow && !counts.path) return 'still';
  return counts.flow >= counts.path ? 'flow' : 'path';
}

/** The mode chip's cycle: still → flow → path → still. Unknown reads as still (so it cycles to flow). */
export function nextTransportMode(mode) {
  const i = TRANSPORT_MODES.indexOf(mode);
  return TRANSPORT_MODES[((i < 0 ? 0 : i) + 1) % TRANSPORT_MODES.length];
}

/** The stratum chip's one line: the stratum's mode + the family default shown. */
export function transportChipLabel(mode, familyDefault) {
  const m = TRANSPORT_MODES.includes(mode) ? mode : 'still';
  const f = TRANSPORT_MODES.includes(familyDefault) ? familyDefault : 'still';
  return `travel ${m} · fam ${f}`;
}

/** The locked integration step (spine-A): 60 steps per sim second. */
export const TRAVEL_STEP_SEC = 1 / 60;
/** Steps banked per presented frame at most; a longer hitch drops the
 *  excess instead of spiralling (the spike's law, and liveLoop clamps
 *  frame dt to 50 ms, so a live frame never legitimately needs > 3). */
export const TRAVEL_MAX_STEPS = 8;

const TRAVEL_FLOW_FREQ = 2.5; // noise cycles across the canvas (the rhythm layer's scale, the spike's field)
const TRAVEL_FLOW_TIME = 0.5; // field z advance per sim second — fast enough that a mark parked at a shell equilibrium (outward curl cancelling the spring) is un-parked within seconds as the field turns; the spike masked the same trap with its phase machine's ≤3 s re-picks. Bench: at 0.12 the outer-10px shell held 62% of roam time; at 0.5 it holds 27% and the radius distribution spreads (p50 91 px at L = 112)
const TRAVEL_SPEED = 0.11; // cruise speed at flow strength 1, fraction of the smaller dimension / s
const TRAVEL_STEER_TAU = 0.28; // s — velocity eases toward the flow target (the ease-in IS the arc)
const TRAVEL_DAMP_TAU = 1.1; // s — velocity damping: the lag cuts corners across the field's streamlines, so marks wander through the interior instead of locking onto one contour at the leash shell
const TRAVEL_SPRING_HZ = 1.3; // leash spring natural frequency — stiff enough that its underdamped return survives the steer ease's velocity damping (measured: at 0.85 Hz a mark released at r=200 crossed only to r=107; at 1.3 Hz it crosses to r=75.5 and settles inside at rest)
const TRAVEL_SPRING_ZETA = 0.3; // < 1 → the anime-timing overshoot on return
const TRAVEL_SETTLE_TAU = 0.25; // s — the governor shed's settle-home decay

/**
 * The travel store: one per resolver (the caller owns it; buildPlacements
 * never allocates one). scenes: sceneId → { seed, acc, steps, states },
 * states: instance index → { ox, oy, vx, vy }. A scene whose seed changes
 * starts over — the roam belongs to the seed that dealt the homes.
 */
export function createTravelStore() {
  return { scenes: new Map() };
}

/** Drop scenes the document no longer has (liveResolve's prune law). */
export function pruneTravelStore(store, keepSceneIds) {
  if (!store || !(store.scenes instanceof Map)) return;
  for (const k of [...store.scenes.keys()]) if (!keepSceneIds.has(k)) store.scenes.delete(k);
}

/** A scene's sim record for tests/debug: { seed, steps, states } with the
 *  states sorted by instance index, or null when the scene never travelled. */
export function travelSceneSnapshot(store, sceneId) {
  const sc = store && store.scenes instanceof Map ? store.scenes.get(sceneId) : null;
  if (!sc) return null;
  return {
    seed: sc.seed,
    steps: sc.steps,
    states: [...sc.states.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([index, s]) => ({ index, ox: s.ox, oy: s.oy, vx: s.vx, vy: s.vy })),
  };
}

const TRAVEL_TMP = { x: 0, y: 0 }; // curl scratch — one call at a time, never re-entered
const TRAVEL_CURL_EPS = 0.35; // finite-difference step in field units

/**
 * The curl of the shared noise field at (x, y, z): finite differences of
 * the same single-level noise the rhythm layer samples (noise.js's curl2
 * runs a 3-octave fBm — four 3-octave evaluations per mark per step
 * measured ~0.93 ms at the 800-mark cap; the single-level field is the
 * shared field's own grain and measures ~3× cheaper, see the cost block).
 * Divergence-free by construction: (∂N/∂y, −∂N/∂x).
 */
function travelCurl(noise, x, y, z, out) {
  const e = TRAVEL_CURL_EPS;
  const n1 = noise.noise3D(x, y + e, z);
  const n2 = noise.noise3D(x, y - e, z);
  const n3 = noise.noise3D(x + e, y, z);
  const n4 = noise.noise3D(x - e, y, z);
  out.x = (n1 - n2) / (2 * e);
  out.y = (n4 - n3) / (2 * e);
  return out;
}

function stepTravelMark(s, hx, hy, env) {
  if (env.shed) {
    // The governor's travel shed: velocities zero, marks settle home.
    // What remains on screen is the placed picture, honestly at rest —
    // never a roam frozen mid-stride.
    s.vx = 0; s.vy = 0;
    const d = Math.exp(-TRAVEL_STEP_SEC / TRAVEL_SETTLE_TAU);
    s.ox *= d; s.oy *= d;
    if (Math.abs(s.ox) < 0.01) s.ox = 0;
    if (Math.abs(s.oy) < 0.01) s.oy = 0;
    return;
  }
  // FLOW: steer toward the curl of the shared noise field, sampled at the
  // mark's CURRENT position every step, so the path bends with the field.
  travelCurl(env.noise,
    ((hx + s.ox) / env.W) * TRAVEL_FLOW_FREQ,
    ((hy + s.oy) / env.H) * TRAVEL_FLOW_FREQ,
    env.simSec * TRAVEL_FLOW_TIME, TRAVEL_TMP);
  const mag = Math.hypot(TRAVEL_TMP.x, TRAVEL_TMP.y);
  let tvx = 0, tvy = 0;
  if (mag > 1e-6) {
    // Target speed scales with the field's strength at the mark: strong
    // currents carry, slack water dawdles — no floor, so the roam's
    // density varies with the field instead of saturating at the leash.
    const f = Math.min(1, mag) * env.cruise;
    tvx = (TRAVEL_TMP.x / mag) * f;
    tvy = (TRAVEL_TMP.y / mag) * f;
  }
  const a = 1 - Math.exp(-TRAVEL_STEP_SEC / TRAVEL_STEER_TAU);
  s.vx += (tvx - s.vx) * a;
  s.vy += (tvy - s.vy) * a;
  const damp = Math.exp(-TRAVEL_STEP_SEC / TRAVEL_DAMP_TAU);
  s.vx *= damp; s.vy *= damp;
  // The leash: no home force inside radius L; outside it a spring toward
  // the leash circle, damped along the radial velocity only — slightly
  // underdamped, so a returning mark overshoots home before it settles.
  const r = Math.hypot(s.ox, s.oy);
  if (r > env.leash) {
    const wn = 2 * Math.PI * TRAVEL_SPRING_HZ;
    const nx = s.ox / r, ny = s.oy / r;
    const pull = wn * wn * (r - env.leash);
    const vr = s.vx * nx + s.vy * ny;
    const c = 2 * TRAVEL_SPRING_ZETA * wn;
    s.vx += (-pull * nx - c * vr * nx) * TRAVEL_STEP_SEC;
    s.vy += (-pull * ny - c * vr * ny) * TRAVEL_STEP_SEC;
  }
  s.ox += s.vx * TRAVEL_STEP_SEC;
  s.oy += s.vy * TRAVEL_STEP_SEC;
}

const TRAVEL_BASE_XY = new WeakMap();

// #1575 — the PATH present's offset scratch: grown to the largest
// placement set seen and reused (the airFade scratch discipline in
// buildPlacements). Fully rewritten for k < n on every path present
// before anything reads it, and applyTransport never re-enters itself.
let _pathOffX = new Float64Array(0);
let _pathOffY = new Float64Array(0);
function pathOffScratch(n) { if (_pathOffX.length < n) _pathOffX = new Float64Array(n); return _pathOffX; }
function pathOffScratchY(n) { if (_pathOffY.length < n) _pathOffY = new Float64Array(n); return _pathOffY; }

// ── PATH transport (#1575 P2) ───────────────────────────────────────────
// The anchor as a PURE function of (t, seed, params): no state, no store
// entries per mark — the same step count always deals the same anchor, so
// replay exactness is by construction, not by discipline. Per-instance
// phase/speed come from the instance seed (the kinemePhase hash family,
// domain-separated 'path:' keys — copies never move in lockstep).
//
// The anime timing law (Matt, 2026-10-14) is in the shapes themselves:
//   arcs            — orbit/spiral/lissajous ARE arcs; sweep's lane bows
//                     (a sine arc across the crossing, never a straight glide)
//   anticipation    — every family leans back against its departure for
//                     the first ~0.45 s (orbit/spiral: a counter-angle dip;
//                     sweep: a backward dip at each cycle's departure;
//                     lissajous: a lean opposite the initial velocity)
//   held extremes   — sinusoidal/eased progress: velocity falls to zero
//                     at the extremes instead of reversing at full speed
//                     (sweep's progress is p − sin(2πp)/2π, derivative 0
//                     at both lane ends — no linear CG glide anywhere)
//   depart ease     — orbit/spiral angles integrate a departure envelope
//                     (θ grows through te(t) = t − τ(1−e^(−t/τ))), so a
//                     mark leaves home slowly and settles into its rate.
//
// Families (params: radius = px amplitude, speed = rate multiplier):
//   orbit     the home ROTATES around the dish centre (the canvas centre
//             in placement coordinates — the default centre the issue
//             names): the mark keeps its own radius, so the composition
//             turns instead of collapsing onto a shared ring.
//   spiral    the same centre, the radius BREATHING by ±radius px on a
//             slow sine while the angle drifts — a breathing spiral.
//   sweep     a cross-canvas lane with wrap: x runs the eased lane at the
//             mark's own home y, bowed by an arc; the phase deals where
//             in the lane each mark starts.
//   lissajous a two-sine weave around home (decorrelated axis rates and
//             phases), anchored: offset(t=0) is exactly 0, like every
//             kineme driver.
// Orbit/spiral/lissajous are anchored at t=0 (anchor = home); sweep is
// phase-dealt (its lane position at t=0 is the deal, like a placement).

const PATH_ORBIT_HZ = 0.05; // revolutions per sim second at speed 1 — stately, a 20 s turn
const PATH_SPIRAL_HZ = 0.07; // breathing cycles per sim second at speed 1
const PATH_SWEEP_RATE = 0.08; // lane cycles per sim second at speed 1 (~12.5 s a crossing)
const PATH_LISS_HZ_X = 0.21;
const PATH_LISS_HZ_Y = 0.29; // decorrelated from X — the weave never closes into a line
const PATH_DEPART_TAU = 0.45; // s — the departure envelope's time constant
const PATH_LEAN_SEC = 0.45; // s — the anticipation window at a departure
const PATH_LEAN_RAD = 0.05; // orbit/spiral anticipation dip, radians
const PATH_LEAN_PX = 10; // sweep anticipation dip, px
const PATH_LEAN_WEAVE_PX = 6; // lissajous anticipation lean, px

const departEnv = (t) => (t <= 0 ? 0 : 1 - Math.exp(-t / PATH_DEPART_TAU));
const departTime = (t) => (t <= 0 ? 0 : t - PATH_DEPART_TAU * (1 - Math.exp(-t / PATH_DEPART_TAU)));
const leanAmt = (t) => (t <= 0 || t >= PATH_LEAN_SEC ? 0 : Math.sin(Math.PI * (t / PATH_LEAN_SEC)));

/**
 * The PATH anchor for one mark at sim time tSec. Pure.
 *
 * home: { x, y } the presented placement (the mark's home).
 * opts: { family, seed, index, canvasW, canvasH, radius, speed, lean }
 *   radius — px amplitude (spiral breathing / sweep arc / lissajous reach)
 *   speed  — rate multiplier (0 freezes the path at its t=0 anchor)
 *   lean   — anticipation scale, 1 by default (tests turn it off to
 *            measure the lean itself; not a recipe key)
 * Returns { x, y } — a fresh object per call (the caller is hot-path
 * aware: applyTransport reuses one scratch per mark present).
 */
export function pathAnchor(home, tSec, opts) {
  const W = Number(opts?.canvasW), H = Number(opts?.canvasH);
  const t = Math.max(0, Number(tSec) || 0);
  const seed = opts?.seed | 0;
  const index = opts?.index | 0;
  const speedMul = 0.75 + 0.5 * hashPhase(seed, `path:v:${index}`);
  const speed = (Number(opts?.speed) || 0) * speedMul;
  const radius = Math.max(0, Number(opts?.radius) || 0);
  const lean = opts?.lean === undefined ? 1 : Number(opts.lean) || 0;
  const family = opts?.family;
  const cx = W / 2, cy = H / 2;

  if (family === 'orbit' || family === 'spiral') {
    if (t <= 0) return { x: home.x, y: home.y }; // the anchored deal is home, bit-exact (no polar round-trip)
    const vx = home.x - cx, vy = home.y - cy;
    const r0 = Math.hypot(vx, vy);
    if (!(r0 > 0.5)) return { x: home.x, y: home.y };
    const ang0 = Math.atan2(vy, vx);
    const dir = hashPhase(seed, `path:s:${index}`) > 0.5 ? -1 : 1;
    const driftHz = family === 'orbit' ? PATH_ORBIT_HZ : PATH_ORBIT_HZ * 0.6;
    let ang = ang0 + dir * TAU * driftHz * speed * departTime(t);
    ang -= dir * PATH_LEAN_RAD * lean * leanAmt(t); // anticipation: lean back against the turn
    let r = r0;
    if (family === 'spiral') {
      const ph = hashPhase(seed, `path:b:${index}`);
      r = r0 + radius * (Math.sin(TAU * (PATH_SPIRAL_HZ * speed * t) + TAU * ph) - Math.sin(TAU * ph)) * departEnv(t);
      if (r < 0) r = 0;
    }
    return { x: cx + r * Math.cos(ang), y: cy + r * Math.sin(ang) };
  }

  if (family === 'sweep') {
    const ph = hashPhase(seed, `path:w:${index}`);
    const cyc = t * PATH_SWEEP_RATE * speed + ph;
    const p = cyc - Math.floor(cyc);
    const pe = p - Math.sin(TAU * p) / TAU; // eased progress: held at both lane ends
    let x = -0.05 * W + pe * 1.1 * W;
    if (p < 0.07) x -= PATH_LEAN_PX * lean * Math.sin(Math.PI * (p / 0.07)); // anticipation at each departure
    const phY = hashPhase(seed, `path:y:${index}`);
    const y = home.y + radius * 0.35 * Math.sin(TAU * p + TAU * phY);
    return { x, y };
  }

  // lissajous (the default family for an unknown name — the weave is the
  // gentlest path, and an unknown family name must never throw mid-frame)
  const ux = hashPhase(seed, `path:x:${index}`);
  const uy = hashPhase(seed, `path:y:${index}`);
  const raw = (tt) => [
    radius * (Math.sin(TAU * (PATH_LISS_HZ_X * speed * tt) + TAU * ux) - Math.sin(TAU * ux)),
    radius * 0.7 * (Math.sin(TAU * (PATH_LISS_HZ_Y * speed * tt) + TAU * uy) - Math.sin(TAU * uy)),
  ];
  const [ox, oy] = raw(t);
  const env = departEnv(t);
  let lx = 0, ly = 0;
  const la = leanAmt(t) * lean;
  if (la > 0) {
    const [dx, dy] = raw(0.05); // the initial departure direction
    const dl = Math.hypot(dx, dy);
    if (dl > 1e-9) { lx = -(dx / dl) * PATH_LEAN_WEAVE_PX * la; ly = -(dy / dl) * PATH_LEAN_WEAVE_PX * la; }
  }
  return { x: home.x + ox * env + lx, y: home.y + oy * env + ly };
}

// ── Stretch along velocity (#1575) ───────────────────────────────────────
// Where the deform channel (a_def) can express it: a fast mark elongates
// ALONG its travel direction. The a_def shader squashes along its axis
// and bulges across it by the reciprocal (area-preserving, dishDeform's
// law), so the axis that elongates a mark along its velocity is the
// PERPENDICULAR of the velocity — buildPlacements stamps
// { deformAmt, deformAxisX/Y = perp(v) } on the item and the scene
// contract carries it as `deform`, exactly like a dish dent. Capped at
// TRAVEL_STRETCH_CAP; below TRAVEL_STRETCH_MIN_SPEED nothing is stamped
// (a slow mark is a round mark, and an unstamped item is bit-identical
// to today). Off when it fights the mark's own deform: buildPlacements
// never overwrites an item that already carries deformAmt > 0.
export const TRAVEL_STRETCH_CAP = 0.3;
export const TRAVEL_STRETCH_MIN_SPEED = 45; // px/s — below this, no stretch

/** The stretch amount for a speed in px/s: 0 under the floor, capped. */
export function travelStretchAmount(speedPxSec) {
  const s = Number(speedPxSec);
  if (!Number.isFinite(s) || s <= TRAVEL_STRETCH_MIN_SPEED) return 0;
  return Math.min(TRAVEL_STRETCH_CAP, (s - TRAVEL_STRETCH_MIN_SPEED) / 600);
}

/**
 * Stage-C applier for FLOW transport: advance the scene's sim by the
 * frame time accumulated since the last call, then fold each mark's
 * offset into the SoA. Called last in buildPlacements (after rhythm,
 * drivers and the ground nudge), so home is the presented placement.
 *
 * ctx.travel: {
 *   mode,            // 'flow' | 'path' — anything else is identity (the gate)
 *   leash,           // px; <= 0 is identity. #1575 Q4 (ruled 2026-10-20):
 *                    // PER-STRATUM — this is the calling stratum's own
 *                    // leash (its recipe value, threaded per scene by
 *                    // buildPlacements); no scene-wide leash exists.
 *   flow,            // 0..1 strength (recipe data, from layoutParams)
 *   path,            // #1575: the PATH family ('orbit'|'spiral'|'sweep'|'lissajous')
 *   speed, radius,   // #1575: PATH rate multiplier / px amplitude (recipe data)
 *   deform,          // #1575: optional stretch scratch { amt, ax, ay } sized to n
 *   store,           // createTravelStore() — caller-owned, required
 *   sceneId,         // the scene identity half of the state key
 *   frameMs,         // spine-A frame time to accumulate (0 on a held frame)
 *   shed,            // governor travel shed: settle home, no drive
 *   ipadClass,       // #1574 Q2 — the device class the traveler budget reads
 *                    // (machine state, resolver input travelIpadClass);
 *                    // absent/false = desktop class = the P1 behaviour
 * }
 * ctx also carries { seed, canvasW, canvasH } like the driver ctx.
 *
 * Returns an undo restoring the cached positions, or null when nothing
 * is displaced. still[k] marks (artist-pinned) neither step nor displace:
 * their state holds exactly where the artist left it.
 */
export function applyTransport(soa, ctx, still = null) {
  if (!soa || !ctx) return null;
  const tr = ctx.travel;
  if (!tr || !tr.store || !(tr.store.scenes instanceof Map)) return null;
  if (tr.mode !== 'flow' && tr.mode !== 'path') return null;
  const leash = Number(tr.leash);
  if (!(leash > 0)) return null;
  const W = Number(ctx.canvasW), H = Number(ctx.canvasH);
  const m = Math.min(W, H);
  if (!(m > 0)) return null;
  const seed = ctx.seed | 0;
  const sceneId = String(tr.sceneId ?? '');
  let sc = tr.store.scenes.get(sceneId);
  if (!sc) {
    sc = { seed, acc: 0, steps: 0, states: new Map() };
    tr.store.scenes.set(sceneId, sc);
  } else if (sc.seed !== seed) {
    sc.seed = seed; sc.acc = 0; sc.steps = 0; sc.states.clear();
  }
  const flowRaw = Number(tr.flow);
  const flow = Number.isFinite(flowRaw) ? Math.min(1, Math.max(0, flowRaw)) : 0;
  const n = soa.n | 0;
  // #1575 — the stretch scratch the caller hands in (tr.deform = { amt,
  // ax, ay }, sized to n): zeroed on entry, filled at present time for
  // marks fast enough to stretch. Absent → no stretch is computed.
  const deform = tr.deform && tr.deform.amt && tr.deform.amt.length >= n ? tr.deform : null;
  if (deform) { deform.amt.fill(0); if (deform.ax) deform.ax.fill(0); if (deform.ay) deform.ay.fill(0); }

  // #1575 — PATH shed: the governor's travel shed presents home and the
  // path clock FREEZES (steps do not advance), so a shed path resumes
  // where it left instead of jumping to where its clock would have been.
  // (FLOW shed differs by design: its sim keeps stepping and settles.)
  if (tr.mode === 'path' && tr.shed) return null;

  // #1574 Q2 — the governor's traveler selection for this scene: a FLOW
  // scene requests travel for every placed mark (the authored ceiling);
  // the selection is the effective amount the device-class budget affords.
  // Marks are selected by instance index, ascending — the index is the
  // identity the store already keys state by, so the selection is stable
  // across placement rebuilds. A mark beyond the selection never travels:
  // no state is created for it, and any state it already holds (the budget
  // shrank under it — a class change, or a count change that moved the
  // selection) is dropped, so it presents exactly at home, the 'still'
  // parity position. On the desktop class the cap is the full placement
  // cap (800), so nothing is pruned and the sim is P1's, bit for bit.
  const nAll = soa.n | 0;
  const travelers = selectTravelers({ requested: nAll, ipadClass: tr.ipadClass }).travelers;
  if (travelers < nAll) {
    for (const idx of [...sc.states.keys()]) if (idx >= travelers) sc.states.delete(idx);
  }


  // Fixed-step accumulation on the spine-A clock: bank the frame time,
  // spend whole steps, never bank a spiral of death.
  const frameMs = Number(tr.frameMs);
  if (Number.isFinite(frameMs) && frameMs > 0) sc.acc += frameMs * 0.001;
  let stepsDue = Math.floor(sc.acc / TRAVEL_STEP_SEC);
  if (stepsDue > TRAVEL_MAX_STEPS) stepsDue = TRAVEL_MAX_STEPS;
  if (stepsDue > 0) {
    sc.acc -= stepsDue * TRAVEL_STEP_SEC;
    if (sc.acc > TRAVEL_STEP_SEC) sc.acc = 0;
    if (tr.mode === 'path') {
      // Stateless: the steps are the clock, nothing per mark is stepped.
      sc.steps += stepsDue;
    } else {
      const env = {
        shed: !!tr.shed,
        noise: noiseFor(seed),
        W, H, leash,
        cruise: TRAVEL_SPEED * m * flow,
        simSec: 0,
      };
      for (let sIdx = 0; sIdx < stepsDue; sIdx++) {
        env.simSec = sc.steps * TRAVEL_STEP_SEC;
        for (let k = 0; k < n; k++) {
          if (still && still[k]) continue;
          const index = soa.index ? soa.index[k] : k;
          if (index >= travelers) continue; // #1574 Q2 — beyond the budget: not a traveler, no state
          let s = sc.states.get(index);
          if (!s) { s = { ox: 0, oy: 0, vx: 0, vy: 0 }; sc.states.set(index, s); }
          if (!env.shed && flow <= 0 && s.ox === 0 && s.oy === 0 && s.vx === 0 && s.vy === 0) continue;
          stepTravelMark(s, soa.x[k], soa.y[k], env);
        }
        sc.steps++;
      }
    }
  }

  if (tr.mode === 'path') {
    // Present: the anchor is a pure function of the step count. The leash
    // caps the offset of the centred/weave families (orbit/spiral/
    // lissajous) radially, as it caps FLOW's roam; sweep's lane IS its
    // geometry (a radial cap would plateau the wrap), so the leash caps
    // only its arc (the y offset). Q4 leash scope is RULED (Matt,
    // 2026-10-20): PER-STRATUM — the leash arriving here is the calling
    // stratum's own (buildPlacements threads that stratum's recipe per
    // scene), and both sub-calls are KEPT under that scope: the cap
    // semantics are the family's geometry, not the leash's provenance,
    // so scope changes which value caps, never how it caps.
    const tSec = sc.steps * TRAVEL_STEP_SEC;
    if (!(tSec > 0)) return null;
    const pathOpts = {
      family: PATH_FAMILIES.includes(tr.path) ? tr.path : 'orbit',
      seed, canvasW: W, canvasH: H,
      radius: Number(tr.radius), speed: Number(tr.speed),
    };
    let any = false;
    const offX = pathOffScratch(n), offY = pathOffScratchY(n);
    const homeScratch = { x: 0, y: 0 };
    for (let k = 0; k < n; k++) {
      if (still && still[k]) continue;
      const index = soa.index ? soa.index[k] : k;
      homeScratch.x = soa.x[k]; homeScratch.y = soa.y[k];
      const a = pathAnchor(homeScratch, tSec, { ...pathOpts, index });
      let ox = a.x - soa.x[k], oy = a.y - soa.y[k];
      if (pathOpts.family === 'sweep') {
        if (oy > leash) oy = leash; else if (oy < -leash) oy = -leash;
      } else {
        const r = Math.hypot(ox, oy);
        if (r > leash) { const f = leash / r; ox *= f; oy *= f; }
      }
      offX[k] = ox; offY[k] = oy;
      if (ox !== 0 || oy !== 0) any = true;
      if (deform) {
        // Velocity by finite difference of the pure function itself —
        // pure in, pure out, no state to disagree with the anchor.
        const prev = pathAnchor(homeScratch, Math.max(0, tSec - TRAVEL_STEP_SEC), { ...pathOpts, index });
        const vx = (a.x - prev.x) / TRAVEL_STEP_SEC, vy = (a.y - prev.y) / TRAVEL_STEP_SEC;
        const sp = Math.hypot(vx, vy);
        const amt = travelStretchAmount(sp);
        if (amt > 0 && sp > 1e-9) { deform.amt[k] = amt; deform.ax[k] = -vy / sp; deform.ay[k] = vx / sp; }
      }
    }
    if (!any) return null;
    let base = TRAVEL_BASE_XY.get(soa);
    if (!base || base.x.length < n) { base = { x: new Float64Array(n), y: new Float64Array(n) }; TRAVEL_BASE_XY.set(soa, base); }
    for (let k = 0; k < n; k++) { base.x[k] = soa.x[k]; base.y[k] = soa.y[k]; }
    for (let k = 0; k < n; k++) { soa.x[k] += offX[k]; soa.y[k] += offY[k]; }
    return () => {
      for (let k = 0; k < n; k++) { soa.x[k] = base.x[k]; soa.y[k] = base.y[k]; }
    };
  }

  // Present: home + offset. Nothing displaced → no undo, channels untouched.
  // Non-travelers hold no state (pruned above), so they present at home.
  let any = false;
  for (let k = 0; k < n; k++) {
    if (still && still[k]) continue;
    const s = sc.states.get(soa.index ? soa.index[k] : k);
    if (s && (s.ox !== 0 || s.oy !== 0)) { any = true; break; }
  }
  if (!any) return null;
  let base = TRAVEL_BASE_XY.get(soa);
  if (!base || base.x.length < n) { base = { x: new Float64Array(n), y: new Float64Array(n) }; TRAVEL_BASE_XY.set(soa, base); }
  for (let k = 0; k < n; k++) { base.x[k] = soa.x[k]; base.y[k] = soa.y[k]; }
  for (let k = 0; k < n; k++) {
    if (still && still[k]) continue;
    const s = sc.states.get(soa.index ? soa.index[k] : k);
    if (!s) continue;
    soa.x[k] += s.ox;
    soa.y[k] += s.oy;
    if (deform && !tr.shed) {
      const sp = Math.hypot(s.vx, s.vy);
      const amt = travelStretchAmount(sp);
      if (amt > 0 && sp > 1e-9) { deform.amt[k] = amt; deform.ax[k] = -s.vy / sp; deform.ay[k] = s.vx / sp; }
    }
  }
  return () => {
    for (let k = 0; k < n; k++) { soa.x[k] = base.x[k]; soa.y[k] = base.y[k]; }
  };
}

// The travel pass's declared cost (the governor thesis: no module runs
// undeclared). Tier 0 — structural, never shed by the effect ladder: the
// pass adds NO GPU pass, shader or FBO (its marks ride the structural
// item pass), and it sheds by the governor's own travel rung
// (hooks/governorCuts.js cut 1.6), the creature-citizen doctrine. Tier 0
// is exempt from the measured-costs sweep by contract (that sweep times
// FX shader passes); timeMs here is the MEASURED resolver-CPU figure:
// applyTransport at the 800-mark cap, one locked step + present, median
// of 7 runs × 200 calls, sandbox node 2026-10-20 —
// engine/travel.selfcheck.mjs re-measures it on every run and prints it.
// Sandbox-indicative only; real hardware authoritative.
registerCostTier('travel/flow', {
  tier: 0,
  memoryBytes: 0,
  timeMs: 0.39,
  notes: '#1574 P1 — FLOW transport: fixed-step curl-flow sim + leash on the resolver CPU; no GPU pass (marks ride the structural item pass). timeMs MEASURED sandbox CPU at the 800-mark cap (see block comment); sheds by the governor travel cut (1.6), never the effect ladder.',
});

// #1575 P2 — PATH transport's declared cost, same doctrine as FLOW's:
// tier 0 (structural — no GPU pass; marks ride the structural item pass),
// sheds by the governor's travel rung (cut 1.6). timeMs is the MEASURED
// resolver-CPU figure (path present at the 800-mark cap, sandbox node
// 2026-10-20; engine/travel.selfcheck.mjs re-measures it on every run).
registerCostTier('travel/path', {
  tier: 0,
  memoryBytes: 0,
  timeMs: 0.66,
  notes: '#1575 P2 — PATH transport: pure-function anchors on the step-count clock + leash cap + stretch finite-difference, resolver CPU; no GPU pass (marks ride the structural item pass). timeMs MEASURED sandbox CPU at the 800-mark cap (see block comment); sheds by the governor travel cut (1.6), never the effect ladder.',
});

// ── #1574 Q2 — the traveler budget: governor-selected within a device-class cap ──
//
// Ruled by Matt, 2026-10-20: the governor picks the scene's travel amount,
// bounded by a hard per-device-class cap; the author sets the ceiling, not
// the amount. The mechanism is THIS selection, and nothing else: there is
// no panel control for it and no new surface — the Directors motion-group
// controls stay exactly as P1 shipped them, and their values (transport /
// transportLeash / transportFlow, plus the scene's mark count) are the
// ceiling/request the selection reads.

/** The mark count the travel/flow cost declaration was measured at (the
 *  800-mark placement cap — see the registration above and quality.js). */
export const TRAVEL_COST_REFERENCE_MARKS = 800;

/**
 * The governor's traveler selection: the EFFECTIVE number of a scene's
 * placed marks that may travel.
 *
 *   travelers = min(requested, the device-class cap's maxTravelers)
 *
 * bounded in cost terms by construction: the cap's timeMs (quality.js
 * TRAVEL_BUDGETS) is the desktop-measured cost equivalence of its traveler
 * count against the declared travel/flow cost (0.39 ms at the 800-mark
 * reference), so a scene at the selection spends at most
 * travelers × (declared / reference) ≤ the class's timeMs of travel cost.
 *
 * Replay safety (the #1367 contract): the selection is a pure function of
 * recorded/resolver state, and of nothing else —
 *   requested:  the scene's placed-mark count — census/geometry state the
 *               recipe dealt (applyTransport reads soa.n; a take's inputs
 *               carry the layout params that deal it);
 *   ipadClass:  the recording machine's device class, a MACHINE key (the
 *               performanceFile doctrine: detail is per machine) carried
 *               on the resolver input as travelIpadClass and recorded in
 *               the take's input log like every resolver input; absent —
 *               every pre-Q2 take — it reads as the desktop class, whose
 *               cap is the full placement cap, i.e. P1's behaviour exactly.
 * No wall-clock time, no live performance readings, no Math.random: the
 * live-pressure mechanism remains the governor's cut 1.6 shed, unchanged.
 * Same inputs → same selection, on any run, on any machine of the class.
 *
 * Runs once per scene per resolve (scalar arithmetic), never per mark per
 * frame; applyTransport calls it beside its store lookup.
 */
export function selectTravelers({ requested, ipadClass } = {}) {
  const req = Number.isFinite(requested) ? Math.max(0, Math.floor(Number(requested))) : 0;
  const budget = travelBudgetForDevice(!!ipadClass);
  const travelers = Math.min(req, budget.maxTravelers);
  const declared = getCostTier('travel/flow');
  const perMarkMs = declared && declared.timeMs > 0 ? declared.timeMs / TRAVEL_COST_REFERENCE_MARKS : 0;
  return {
    travelers,
    requested: req,
    capTravelers: budget.maxTravelers,
    budgetMs: budget.timeMs,
    estimatedMs: travelers * perMarkMs,
  };
}

// The selection's own declared cost, per the house pattern. Tier 0 —
// structural, like travel/flow: it is scalar arithmetic at the resolver's
// scene seam, no GPU pass, and it sheds nothing itself (the budget is a
// ceiling, not a rung). timeMs is 0 as the honest figure: the selection
// measures in the low hundreds of ns per call in node (the travel suite
// re-measures it on every run and prints it), below the registry's ms
// currency; the budget's real cost control is the cap it enforces on
// travel/flow's measured cost, declared above.
registerCostTier('travel/budget', {
  tier: 0,
  memoryBytes: 0,
  timeMs: 0,
  notes: '#1574 Q2 — the governor traveler selection (min of requested marks vs the device-class cap in data/quality.js TRAVEL_BUDGETS): scalar arithmetic once per scene/resolve, measured in the low hundreds of ns/call (sandbox node) — 0 is the honest figure at the registry\'s ms scale. Structural; the cost it controls is travel/flow\'s, declared above.',
});

/**
 * Seed-derived still instant (Matt decision 5): hash the project seed into
 * a moment within one boil period. Same seed → same printed frame, always;
 * reseed → a new (equally good) moment.
 */
export function kinemeStillSec(seed, fps = BOIL_FPS_DEFAULT) {
  const u = hashPhase(seed | 0, 'still');
  return u / clampBoilFps(fps);
}
