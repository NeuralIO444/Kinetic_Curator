// dishFluid.mjs — FERROFLUID dish mode (#1997): the pure kernel and the dish's fluid law.
//
// A two-phase Gray-Scott reaction-diffusion field living in the dish, sibling of the DISH LIFE
// culture: seeded, fixed-step on simulation time, governor-sheddable, and coupled to the culture
// both ways through published state read one frame behind. This module is the MATH AUTHORITY —
// the one instance of the kernel lives at the dish grid inside the resolver
// (engine/dishFluidStage.mjs): it is the coupling authority the culture reads AND the field the
// stage's attached matter seats on (engine/dishFluidRender.mjs). The system itself is never
// drawn (Matt's ruling, 2026-11-08): like FLOW's curl field it is an underneath system, and
// what appears on stage as the ferrofluid is a body of ordinary asset instances attached to
// this field. No clock, no Math.random, no globals: a fluid is a pure function of its stamped
// inputs (seed, wake, magnets, dials, the culture field it was handed).
//
//   MAGNETS — placed objects that stay on the dish (stamped state, dish-normalized {x, y},
//   y down like the canvas). A magnet biases the field locally: feed rises and kill falls with
//   the gaussian of distance, so the dark phase grows toward a magnet and stands there — the
//   ferrofluid spike, in reaction-diffusion terms. The hand is never the magnet; placement is a
//   recorded performer act (gl/dishFluidMagnetsDom.mjs → the store → the stamp).
//
//   COUPLING — the culture's published level (read one frame behind, held for the frame's
//   steps) raises the local feed: the fluid grows toward the living culture. The other
//   direction — the fluid biasing the culture's births — lives in engine/dishFluidCouple.mjs
//   and reads this module's published density. Bedrock is never an input here and never an
//   output: the fluid biases births/deaths/activity, never the terrain record.
//
//   DETERMINISM (Matt's ruling, 2026-11-08, on #1997) — magnets, seed and step count are
//   stamped state. Originally the ruling's terms were written for a GPU display instance
//   (same-device exact, cross-device float variance accepted); the presentation rework
//   (2026-11-08, later the same day) removed the GPU instance entirely — the system is
//   invisible and assets attach to it — so the one kernel instance is pure JS over the
//   recorded stream and the attachment seating is a pure function of it: the fluid, its
//   coupling and its visible body are exact on every device, the culture's own terms.

import { hashU01 } from './kernel/rng.js';

/** The dish grid — the coupling resolution, shared with the culture (STAGE_COLS × STAGE_ROWS). */
export const FLUID_GRID_COLS = 96;
export const FLUID_GRID_ROWS = 54;

/**
 * The governor's shed ladder for the fluid, cheapest sacrifice first. The axes, in the order
 * they are spent: TEMPO — the step rate falls 8 → 4 → 2 → 1 (a seamless sacrifice: the fluid
 * just moves slower); SEAT — the attachment body's seating grid coarsens 96 → 64 → 48 → 32
 * cells wide (the attached matter reads chunkier; the kernel itself always runs at the dish
 * grid); MATTER — the attached body's count falls to ½, then ¼ (the field keeps stepping,
 * less of it shows); then the fluid HOLDS (0 steps — its body stands, frozen). Rung 0 is the
 * design point: 8 steps/frame, the body seated at the full dish grid, whole.
 * (`seat` is the seating grid's column count; its rows follow the dish grid's aspect.)
 */
export const FLUID_SHED_RUNGS = Object.freeze([
  Object.freeze({ steps: 8, seat: 96, matter: 1, label: 'full' }),
  Object.freeze({ steps: 4, seat: 96, matter: 1, label: 'FERRO SLOW — the fluid steps 4 a frame' }),
  Object.freeze({ steps: 2, seat: 96, matter: 1, label: 'FERRO SLOWER — the fluid steps 2 a frame' }),
  Object.freeze({ steps: 1, seat: 96, matter: 1, label: 'FERRO TRICKLE — the fluid steps 1 a frame' }),
  Object.freeze({ steps: 1, seat: 64, matter: 1, label: 'FERRO COARSE — the fluid’s body reads at 64 wide' }),
  Object.freeze({ steps: 1, seat: 48, matter: 1, label: 'FERRO COARSER — the fluid’s body reads at 48 wide' }),
  Object.freeze({ steps: 1, seat: 32, matter: 1, label: 'FERRO COARSEST — the fluid’s body reads at 32 wide' }),
  Object.freeze({ steps: 1, seat: 32, matter: 0.5, label: 'FERRO THIN — half the fluid’s body stays' }),
  Object.freeze({ steps: 1, seat: 32, matter: 0.25, label: 'FERRO THINNER — a quarter of the fluid’s body stays' }),
  Object.freeze({ steps: 0, seat: 32, matter: 0.25, label: 'FERRO HELD — the fluid holds still' }),
]);

/** The seating grid's row count for a rung's seat columns (the dish grid's aspect). Pure. */
export function fluidSeatRows(seatCols) {
  const c = Math.max(1, Math.round(Number(seatCols) || FLUID_GRID_COLS));
  return Math.max(1, Math.round((c * FLUID_GRID_ROWS) / FLUID_GRID_COLS));
}

/** A governor rung value, clamped to the ladder; junk reads as 0 (full — the unshed state). */
export function clampFluidRung(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(FLUID_SHED_RUNGS.length - 1, Math.max(0, Math.round(n))) : 0;
}

/** Steps per second on the loop clock at the design point (8 steps/frame at 60 fps). */
export const FLUID_STEPS_PER_SEC = 480;
/** Steps per fluid cycle: 6 s at the design rate, the field culture's own cycle length class. */
export const FLUID_CYCLE_STEPS = 2880;
/**
 * The dish-grid instance steps at 1/FLUID_GRID_STEP_DIVISOR of the stamp rate (60 steps/s):
 * an RD step at 96×54 is culture-priced (≈0.11 ms), and the coupling reads a climate, not a
 * flicker — it does not need the stamp's tempo.
 */
export const FLUID_GRID_STEP_DIVISOR = 8;

// — Gray-Scott kernel constants (the Sims formulation: 9-point laplacian, dt = 1) —
/** Diffusion rate of the ground phase (U). */
export const GS_DU = 0.2097;
/** Diffusion rate of the dark phase (V). */
export const GS_DV = 0.105;
/** Base feed rate — the coral-growth regime: branching veins that keep growing and merging. */
export const FERRO_FEED = 0.0545;
/** Base kill rate, paired with FERRO_FEED. */
export const FERRO_KILL = 0.062;
/** Kill never falls below this under magnet bias — a magnet holds a spike, not a flood. */
export const FERRO_KILL_MIN = 0.045;
/** Feed added at magnet field 1 and full PULL dial: the spike's growth pressure. */
export const MAGNET_FEED_GAIN = 0.03;
/** Kill removed at magnet field 1 and full PULL dial: the spike's persistence. */
export const MAGNET_KILL_DROP = 0.012;
/** Feed added at culture level 1 and full COUPLE dial: the fluid grows toward the living culture. */
export const CULTURE_FEED_GAIN = 0.02;
/**
 * Kill removed at culture level 1 and full COUPLE dial. The culture bias moves feed and kill
 * TOGETHER, the magnet's shape: feed alone is regime-dependent in Gray-Scott (a uniform feed
 * rise can thin the standing phase), while the pair raises the local standing density
 * monotonically — measured in dishFluid.selfcheck (disc density vs bias strength).
 */
export const CULTURE_KILL_DROP = 0.008;
/** Magnet influence radius, in dish-normalized units (gaussian falloff exp(−(d/R)²)). */
export const MAGNET_RADIUS = 0.085;
/** Most magnets the dish holds. */
export const MAX_MAGNETS = 8;
/** The FLOW dial's feed multiplier range: feed × (MIN + (MAX − MIN) × flow). */
export const FLOW_FEED_MIN = 0.5;
export const FLOW_FEED_MAX = 1.5;
/** Inoculation discs seeded at a (re)build: count and radius (cells at the seeding grid). */
export const SEED_BLOBS = 26;
export const SEED_BLOB_RADIUS = 2.5;
/** The dark-phase value an inoculation disc lays down. */
export const SEED_V = 0.85;

/** The fluid's RNG channel (registered 'spatial' in kernel/rng.js, #1238). */
export const FLUID_CHANNEL = 'dish-fluid';

const clamp01 = (v) => (Number.isFinite(Number(v)) ? Math.min(1, Math.max(0, Number(v))) : 0);

/** A dial value for the fluid (flow / pull / couple): clamped 0..1, junk reads as 0 (off). Pure. */
export function clampFluidDial(v) {
  return clamp01(v);
}

/** The stamped dial set, every field clamped; junk fields read as their safe direction. Pure. */
export function sanitizeFluidDial(d) {
  const o = d && typeof d === 'object' ? d : {};
  return {
    flow: o.flow === undefined ? 0.5 : clampFluidDial(o.flow),
    pull: o.pull === undefined ? 0.7 : clampFluidDial(o.pull),
    couple: o.couple === undefined ? 0.5 : clampFluidDial(o.couple),
  };
}

/**
 * The stamped magnet list, sanitized: at most MAX_MAGNETS {x, y} points with finite
 * coordinates clamped into the dish (0..1, y down). Non-array junk reads as no magnets. Pure.
 */
export function sanitizeMagnets(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const m of list) {
    if (!m || typeof m !== 'object') continue;
    const x = Number(m.x);
    const y = Number(m.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    out.push({ x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) });
    if (out.length >= MAX_MAGNETS) break;
  }
  return out;
}

/** The seed key a fluid cycle runs under: the project seed mixed with the cycle's wake. Pure. */
export function fluidSeedKey(seed, wakeMs) {
  const s = Number.isFinite(Number(seed)) ? Number(seed) | 0 : 0;
  const w = Number.isFinite(Number(wakeMs)) ? Math.floor(Number(wakeMs)) : 0;
  return (s ^ Math.imul(w + 1, 0x9e3779b9)) >>> 0;
}

/**
 * The magnet field at a dish-normalized point: Σ exp(−(d/R)²) over the magnets, distance
 * aspect-corrected (dy scaled by aspectHW = canvasH/canvasW, so the falloff is round on the
 * canvas). NOT clamped — overlapping magnets add up; the step's gains keep the effect bounded.
 * Pure.
 */
export function magnetFieldAt(magnets, nx, ny, aspectHW = 0.7) {
  if (!magnets || !magnets.length) return 0;
  const r2 = MAGNET_RADIUS * MAGNET_RADIUS;
  let f = 0;
  for (const m of magnets) {
    const dx = nx - m.x;
    const dy = (ny - m.y) * aspectHW;
    f += Math.exp(-(dx * dx + dy * dy) / r2);
  }
  return f;
}

/**
 * Create a fluid field at (cols × rows): U (ground) and V (dark phase) Float32Arrays,
 * double-buffered. The initial condition is a pure function of (seedKey, magnets): U = 1
 * everywhere, V = 0 except SEED_BLOBS inoculation discs dealt from the seeded stream — half
 * of them centred on magnets (cycling through the list) with a seeded jitter, so a re-seeded
 * fluid stands its spikes back up at the magnets first; the rest dealt over the dish.
 */
export function createFluid({ cols, rows, seedKey = 0, magnets = [] } = {}) {
  const w = Math.max(1, cols | 0);
  const h = Math.max(1, rows | 0);
  const n = w * h;
  const f = {
    cols: w,
    rows: h,
    step: 0,
    seedKey: seedKey >>> 0,
    u: new Float32Array(n).fill(1),
    v: new Float32Array(n),
    u2: new Float32Array(n),
    v2: new Float32Array(n),
  };
  const mags = sanitizeMagnets(magnets);
  const key = seedKey >>> 0;
  for (let b = 0; b < SEED_BLOBS; b++) {
    let cx;
    let cy;
    if (mags.length && b % 2 === 0) {
      const m = mags[(b / 2) % mags.length];
      cx = (m.x + (hashU01(key, FLUID_CHANNEL, 200000 + b * 2) - 0.5) * 0.05) * w;
      cy = (m.y + (hashU01(key, FLUID_CHANNEL, 200000 + b * 2 + 1) - 0.5) * 0.05) * h;
    } else {
      cx = hashU01(key, FLUID_CHANNEL, 100000 + b * 2) * w;
      cy = hashU01(key, FLUID_CHANNEL, 100000 + b * 2 + 1) * h;
    }
    const r = SEED_BLOB_RADIUS;
    const x0 = Math.max(0, Math.floor(cx - r));
    const x1 = Math.min(w - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const y1 = Math.min(h - 1, Math.ceil(cy + r));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        if (dx * dx + dy * dy <= r * r) {
          const i = y * w + x;
          f.v[i] = SEED_V;
          f.u[i] = 1 - SEED_V;
        }
      }
  }
  return f;
}

/**
 * Advance the fluid one Gray-Scott step, in place. `opts`:
 *   magnets    — the stamped magnet list (dish-normalized); pull scales their bias.
 *   pull       — the PULL dial 0..1 (magnet strength).
 *   flow       — the FLOW dial 0..1 (global feed multiplier).
 *   couple     — the COUPLE dial 0..1 (how hard the culture field biases the feed).
 *   culture    — the culture's published level as { cols, rows, level } at any grid, or null:
 *                sampled nearest at each fluid cell (identity when the grids match).
 *   aspectHW   — canvasH/canvasW for the magnet falloff (default the 1000×700 stage).
 * The bias directions are the pinned law: magnet field RAISES feed and LOWERS kill (growth
 * toward the magnet, persistence at it); culture level does the same at its own gains (growth
 * toward the living culture, standing where it lives). Rim cells read their missing neighbours
 * as ground (U=1, V=0) — the dish wall.
 */
export function stepFluid(f, opts = {}) {
  const { cols: w, rows: h, u, v, u2, v2 } = f;
  const magnets = opts.magnets && opts.magnets.length ? opts.magnets : null;
  const pull = clampFluidDial(opts.pull === undefined ? 0.7 : opts.pull);
  const flow = opts.flow === undefined ? 0.5 : clampFluidDial(opts.flow);
  const couple = clampFluidDial(opts.couple === undefined ? 0.5 : opts.couple);
  const culture = opts.culture && opts.culture.level ? opts.culture : null;
  const aspectHW = Number.isFinite(Number(opts.aspectHW)) && Number(opts.aspectHW) > 0 ? Number(opts.aspectHW) : 0.7;
  const feedBase = FERRO_FEED * (FLOW_FEED_MIN + (FLOW_FEED_MAX - FLOW_FEED_MIN) * flow);
  const cw = culture ? culture.cols | 0 : 0;
  const ch = culture ? culture.rows | 0 : 0;
  const cLevel = culture ? culture.level : null;
  for (let y = 0; y < h; y++) {
    const yu = y > 0 ? y - 1 : -1;
    const yd = y < h - 1 ? y + 1 : -1;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const xl = x > 0 ? x - 1 : -1;
      const xr = x < w - 1 ? x + 1 : -1;
      let lapU = -u[i];
      let lapV = -v[i];
      // edge neighbours (weight 0.2); a missing neighbour is ground (U 1, V 0)
      lapU += 0.2 * (xl >= 0 ? u[y * w + xl] : 1) + 0.2 * (xr >= 0 ? u[y * w + xr] : 1);
      lapV += 0.2 * (xl >= 0 ? v[y * w + xl] : 0) + 0.2 * (xr >= 0 ? v[y * w + xr] : 0);
      lapU += 0.2 * (yu >= 0 ? u[yu * w + x] : 1) + 0.2 * (yd >= 0 ? u[yd * w + x] : 1);
      lapV += 0.2 * (yu >= 0 ? v[yu * w + x] : 0) + 0.2 * (yd >= 0 ? v[yd * w + x] : 0);
      // corner neighbours (weight 0.05)
      lapU +=
        0.05 * (yu >= 0 && xl >= 0 ? u[yu * w + xl] : 1) +
        0.05 * (yu >= 0 && xr >= 0 ? u[yu * w + xr] : 1) +
        0.05 * (yd >= 0 && xl >= 0 ? u[yd * w + xl] : 1) +
        0.05 * (yd >= 0 && xr >= 0 ? u[yd * w + xr] : 1);
      lapV +=
        0.05 * (yu >= 0 && xl >= 0 ? v[yu * w + xl] : 0) +
        0.05 * (yu >= 0 && xr >= 0 ? v[yu * w + xr] : 0) +
        0.05 * (yd >= 0 && xl >= 0 ? v[yd * w + xl] : 0) +
        0.05 * (yd >= 0 && xr >= 0 ? v[yd * w + xr] : 0);
      let feed = feedBase;
      let kill = FERRO_KILL;
      if (magnets && pull > 0) {
        const mf = magnetFieldAt(magnets, (x + 0.5) / w, (y + 0.5) / h, aspectHW);
        if (mf > 0.001) {
          feed += MAGNET_FEED_GAIN * pull * mf;
          kill = Math.max(FERRO_KILL_MIN, kill - MAGNET_KILL_DROP * pull * mf);
        }
      }
      if (cLevel && couple > 0) {
        const cx = Math.min(cw - 1, Math.floor(((x + 0.5) / w) * cw));
        const cy = Math.min(ch - 1, Math.floor(((y + 0.5) / h) * ch));
        const cl = cLevel[cy * cw + cx];
        if (cl > 0) {
          feed += CULTURE_FEED_GAIN * couple * cl;
          kill = Math.max(FERRO_KILL_MIN, kill - CULTURE_KILL_DROP * couple * cl);
        }
      }
      const U = u[i];
      const V = v[i];
      const uvv = U * V * V;
      let nu = U + (GS_DU * lapU - uvv + feed * (1 - U));
      let nv = V + (GS_DV * lapV + uvv - (feed + kill) * V);
      u2[i] = nu < 0 ? 0 : nu > 1 ? 1 : nu;
      v2[i] = nv < 0 ? 0 : nv > 1 ? 1 : nv;
    }
  }
  f.u = u2;
  f.u2 = u;
  f.v = v2;
  f.v2 = v;
  f.step++;
  return f;
}

/** Mean dark-phase density over the whole field (the "how much fluid" read). */
export function fluidMeanDensity(f) {
  let t = 0;
  for (let i = 0; i < f.v.length; i++) t += f.v[i];
  return f.v.length ? t / f.v.length : 0;
}

/**
 * The published density at the dish grid (FLUID_GRID_COLS × FLUID_GRID_ROWS): the V field
 * box-averaged down (identity — a copy — when the fluid already runs at the dish grid). This
 * is what the culture reads (engine/dishFluidCouple.mjs) and what a snapshot's consumers see.
 * A fresh Float32Array each call — read it the frame you get it.
 */
export function fluidDensity(f) {
  const { cols: w, rows: h, v } = f;
  if (w === FLUID_GRID_COLS && h === FLUID_GRID_ROWS) return Float32Array.from(v);
  const out = new Float32Array(FLUID_GRID_COLS * FLUID_GRID_ROWS);
  for (let gy = 0; gy < FLUID_GRID_ROWS; gy++) {
    const y0 = Math.floor((gy / FLUID_GRID_ROWS) * h);
    const y1 = Math.max(y0 + 1, Math.floor(((gy + 1) / FLUID_GRID_ROWS) * h));
    for (let gx = 0; gx < FLUID_GRID_COLS; gx++) {
      const x0 = Math.floor((gx / FLUID_GRID_COLS) * w);
      const x1 = Math.max(x0 + 1, Math.floor(((gx + 1) / FLUID_GRID_COLS) * w));
      let t = 0;
      let c = 0;
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) {
          t += v[y * w + x];
          c++;
        }
      out[gy * FLUID_GRID_COLS + gx] = c ? t / c : 0;
    }
  }
  return out;
}

/** FNV-1a over both phases (quantized) — the golden fingerprint, like cultureHash. */
export function fluidHash(f) {
  let hsh = 0x811c9dc5;
  const mix = (arr) => {
    for (let i = 0; i < arr.length; i++) {
      hsh ^= (Math.round(arr[i] * 1e6) & 0xffff) ^ ((Math.round(arr[i] * 1e6) >>> 16) & 0xff);
      hsh = Math.imul(hsh, 0x01000193) >>> 0;
    }
  };
  mix(f.u);
  mix(f.v);
  return hsh >>> 0;
}

/**
 * The fluid stamp for loop time `loopMs` — the cycle clock, the field culture's shape. Pure.
 *   { mode:'fluid', wakeMs, step, cycleSteps, shed }
 * wakeMs is the cycle's start on the loop clock (the fluid re-seeds when it changes); step is
 * the step target inside the cycle; shed is the governor's rung (clampFluidRung applied by
 * the stage, which owns the ladder). Steps are counted on SIMULATION time: the loop clock
 * does not advance while PERF PAUSED or hidden, so the fluid stills with everything else.
 */
export function fluidStamp(loopMs, { shed = 0 } = {}) {
  const t = Number.isFinite(Number(loopMs)) && loopMs > 0 ? Number(loopMs) : 0;
  const cycleMs = (FLUID_CYCLE_STEPS / FLUID_STEPS_PER_SEC) * 1000;
  const cycle = Math.floor(t / cycleMs);
  const wakeMs = cycle * cycleMs;
  const step = Math.min(FLUID_CYCLE_STEPS - 1, Math.floor(((t - wakeMs) / 1000) * FLUID_STEPS_PER_SEC));
  return { mode: 'fluid', wakeMs, step, cycleSteps: FLUID_CYCLE_STEPS, shed: shed | 0 };
}
