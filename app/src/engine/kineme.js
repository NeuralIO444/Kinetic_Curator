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
import { ACCENT_OFFSET } from './kernel/color/index.js';

/** Boil default: the classic hand-drawn rate (Matt decision 2). */
/**
 * #1128 — the DIRECTOR's driver patterns. The Curator's amounts (kinemeBreath/Drift/Pulse) are the scene-level
 * scale; a pattern only RE-WEIGHTS them, it never invents motion a scene did not already have:
 *   DRIFT  the floor: the amounts as set.
 *   SWELL  breath-forward: breath x3 (capped at 1), drift x0.2: the marks visibly breathe and hardly wander.
 *   THUMP  pulse-forward and driven by a REAL beat (audio on): the pulse amount is THUMP_PULSE x the live beat
 *          envelope, so it thumps when the room does and rests between. With no audio it IS DRIFT (a reduction).
 * An unknown name is DRIFT. beatDrive is the shaped beat pulse 0..1, or null/undefined when nothing is listening.
 */
export const KINEME_PATTERNS = Object.freeze(['DRIFT', 'SWELL', 'THUMP']);
export const THUMP_PULSE = 0.6;
export function patternAmounts(base, pattern, beatDrive) {
  const { breath, drift, pulse } = base;
  if (pattern === 'SWELL') return { breath: Math.min(1, breath * 3), drift: drift * 0.2, pulse };
  if (pattern === 'THUMP' && Number.isFinite(beatDrive)) {
    return { breath, drift, pulse: THUMP_PULSE * Math.min(1, Math.max(0, beatDrive)) };
  }
  return { breath, drift, pulse };
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

/**
 * Seed-derived still instant (Matt decision 5): hash the project seed into
 * a moment within one boil period. Same seed → same printed frame, always;
 * reseed → a new (equally good) moment.
 */
export function kinemeStillSec(seed, fps = BOIL_FPS_DEFAULT) {
  const u = hashPhase(seed | 0, 'still');
  return u / clampBoilFps(fps);
}
