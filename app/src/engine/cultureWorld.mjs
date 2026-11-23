// cultureWorld.mjs — CULTURE Phase 0: the gate and the empty dish.
// Pure: no DOM, no GL, no clock. The module is fed time; it never reads it.
//
// CULTURE is the physics-creature foundation (docs/design/physics-creature-foundation-spec.md):
// one shared top-down 2-D world in the dish, grown BEHIND A GATE (Matt's ruling, 2026-11-22) —
// citizens immigrate slice by slice and the live stage is untouched until takeover. Phase 0 is
// only the gate and the empty world behind it: no bodies, no solver, no rendering. The parent
// umbrella (1183) stays open; this module is the foundation its physics arm grows on.
//
//   THE GATE    the project document carries `cultureDish` only while ON (the #2108
//               constructLead discipline, projectDocument.js): absent = off, and a gate-off
//               project serializes byte-identically to before the gate existed. The store
//               field of the same name defaults false; the shell (hooks/useCultureWorld.js)
//               creates and feeds a world only while the gate is on. Off, this module is
//               never imported into a frame: no world exists, nothing steps, nothing costs.
//
//   THE WORLD   one state object: the shared grid the dish grows in — the Life stage grid
//               (STAGE_COLS x STAGE_ROWS from dishLifeStage.mjs; the spec's §5.2 ruling is
//               that Life IS the soil this world grows in) — an empty body table whose
//               capacity is the 2,048-body contacts ceiling already on main (K3 cap ladder
//               step 2, data/quality.js), and the fixed-timestep scheduler below.
//
//   THE CLOCK   §3.5's fixed timestep, at 120 Hz (two substeps per 60 Hz frame): the sim
//               advances ONLY in whole CULTURE_STEP_S increments, driven by accumulated
//               frame time handed to advanceCultureWorld — never by raw per-frame dt.
//               The remainder is carried, so a take's step count means the same thing on
//               a 60 Hz and a 120 Hz display. One feed call runs at most
//               CULTURE_MAX_STEPS_PER_ADVANCE steps; whole steps beyond the bound are
//               counted in `droppedSteps`, never silently swallowed.
//
//   SIM LAW     this world steps on the CPU in JS: deterministic, js-exact (spec §5.4).
//               Its stamp vocabulary is the codebase's (engine/kernel/simBackends.js):
//               backend 'js.cultureWorld.v1', law 'js-exact'. No GPU anything is claimed;
//               when a later phase wires the world into the resolver, the stamp rides the
//               take header through the OPTIONAL_SIM_KERNELS pattern (the contacts
//               precedent: absent = the JS-era header, byte-for-byte).
import { STAGE_COLS, STAGE_ROWS } from './dishLifeStage.mjs';

/** The backend id this world stamps, in the simBackends vocabulary: JS, versioned. */
export const CULTURE_WORLD_BACKEND = 'js.cultureWorld.v1';
/** The law the stamp implies: every step ran in JS, so the world replays bit-exactly. */
export const CULTURE_WORLD_SIM_LAW = 'js-exact';
/** The gate's document/store field name. Absent (or not exactly true) = off. */
export const CULTURE_DISH_FIELD = 'cultureDish';

/** Fixed simulation rate: 120 Hz — two substeps per 60 Hz frame (spec §3.5). */
export const CULTURE_STEP_HZ = 120;
/** One fixed step, in seconds. */
export const CULTURE_STEP_S = 1 / CULTURE_STEP_HZ;
/** Body-table capacity: the 2,048-body contacts ceiling already on main (K3 ladder step 2). */
export const CULTURE_BODY_CAP = 2048;
/** Most steps one advance call may run (2 s of sim); whole steps past it are dropped + counted. */
export const CULTURE_MAX_STEPS_PER_ADVANCE = 240;

/** Is the dish gate on in a store state or a project document? Only exactly `true` is on. */
export function cultureDishOn(holder) {
  return !!holder && holder[CULTURE_DISH_FIELD] === true;
}

/**
 * Create the empty world. The grid is the shared Life stage grid, all dead (0) at birth —
 * Phase 0 grows nothing in it; later phases couple the soil and the citizens. The body
 * table is allocated at full capacity with count 0: capacity is a ceiling, not a population.
 *
 * @param {{ seed?: number }} opts
 */
export function createCultureWorld({ seed = 0 } = {}) {
  const cap = CULTURE_BODY_CAP;
  return {
    seed: seed >>> 0,
    backend: CULTURE_WORLD_BACKEND,
    simLaw: CULTURE_WORLD_SIM_LAW,
    /** Whole fixed steps run since birth. Sim time is exactly step * CULTURE_STEP_S. */
    step: 0,
    /** Carried remainder: fed time not yet a whole step, always in [0, CULTURE_STEP_S). */
    accS: 0,
    /** Whole steps a single over-long feed call dropped past the per-call bound (never silent). */
    droppedSteps: 0,
    grid: { cols: STAGE_COLS, rows: STAGE_ROWS, cells: new Uint8Array(STAGE_COLS * STAGE_ROWS) },
    bodies: {
      capacity: cap,
      count: 0,
      alive: new Uint8Array(cap),
      x: new Float32Array(cap),
      y: new Float32Array(cap),
    },
  };
}

/** Sim time, in seconds: exactly the whole steps run, never the fed wall time. */
export function cultureWorldSimTimeS(world) {
  return world.step * CULTURE_STEP_S;
}

/**
 * One fixed step. Phase 0's world is empty — no bodies to move, no soil to grow — so a
 * step advances the world's clock and nothing else. Later phases put the solver here;
 * the scheduler law around it does not change.
 */
export function stepCultureWorld(world) {
  world.step += 1;
  return world;
}

/**
 * Feed the world accumulated frame time (seconds). Runs whole fixed steps only and
 * carries the remainder. Returns how many steps ran. A non-finite or non-positive
 * feed is a no-op: the live shell's clock can stutter, the sim's law cannot.
 */
export function advanceCultureWorld(world, dtS) {
  if (!world || !Number.isFinite(dtS) || dtS <= 0) return 0;
  world.accS += dtS;
  let ran = 0;
  while (world.accS >= CULTURE_STEP_S && ran < CULTURE_MAX_STEPS_PER_ADVANCE) {
    world.accS -= CULTURE_STEP_S;
    stepCultureWorld(world);
    ran += 1;
  }
  if (world.accS >= CULTURE_STEP_S) {
    // The feed carried more whole steps than one call may run: drop them, count them,
    // and keep only the fractional remainder, so the accumulator itself never drifts.
    const dropped = Math.floor(world.accS / CULTURE_STEP_S);
    world.droppedSteps += dropped;
    world.accS -= dropped * CULTURE_STEP_S;
  }
  return ran;
}

const _f64 = new DataView(new ArrayBuffer(8));
function mixFloat(mix, v) {
  _f64.setFloat64(0, v);
  for (let i = 0; i < 8; i++) mix(_f64.getUint8(i));
}

/**
 * A canonical hash of everything that makes this world THIS world: seed, stamp, step
 * count, carried remainder (bit-exact), dropped count, the soil grid, and the body
 * table's living prefix. Same feed sequence => same hash, on any device (all arithmetic
 * here is IEEE-exact JS). FNV-1a, the dishWet.selfcheck precedent.
 */
export function cultureWorldHash(world) {
  let h = 0x811c9dc5;
  const mix = (byte) => {
    h ^= byte;
    h = Math.imul(h, 0x01000193) >>> 0;
  };
  const mixU32 = (v) => {
    mix(v & 255);
    mix((v >>> 8) & 255);
    mix((v >>> 16) & 255);
    mix((v >>> 24) & 255);
  };
  const mixStr = (s) => {
    for (let i = 0; i < s.length; i++) mix(s.charCodeAt(i) & 255);
    mix(0);
  };
  mixStr(world.backend);
  mixStr(world.simLaw);
  mixU32(world.seed);
  mixU32(world.step);
  mixFloat(mix, world.accS);
  mixU32(world.droppedSteps);
  const cells = world.grid.cells;
  for (let i = 0; i < cells.length; i++) mix(cells[i]);
  mixU32(world.bodies.count);
  const n = Math.min(world.bodies.count, world.bodies.capacity);
  for (let i = 0; i < n; i++) {
    mix(world.bodies.alive[i]);
    mixFloat(mix, world.bodies.x[i]);
    mixFloat(mix, world.bodies.y[i]);
  }
  return h >>> 0;
}

// The standing world: the one the shell is feeding while the gate is on, registered for
// later phases (and debugging) to reach. Null whenever the gate is off — Phase 0's whole
// point is that an off gate means no world exists anywhere.
let standingWorld = null;
export function setStandingCultureWorld(world) {
  standingWorld = world || null;
  return standingWorld;
}
export function standingCultureWorld() {
  return standingWorld;
}
