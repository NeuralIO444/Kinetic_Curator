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
//
//   THE MEDIUM  Phase 1, slice K1 (the parent issue 2186): the dish fluid — the Gray-Scott
//               kernel of engine/dishFluid.mjs, the codebase's math authority — lives in the
//               world at the shared grid (the stage grid IS the fluid grid: 96×54 both, so
//               the medium maps onto the soil cell-for-cell with no resampling; that identity
//               is the resolution choice for this slice, and it is what the next kernel, K2,
//               couples to in shader space). The world steps the fluid from its own fixed
//               clock: one fluid step per CULTURE_FLUID_STEP_DIVISOR world steps, which at
//               120 Hz is 60 steps/s — the exact tempo the live dish-grid instance already
//               runs at (the 480 steps/s stamp rate over FLUID_GRID_STEP_DIVISOR). The fluid
//               invents no clock of its own: its step count is a pure function of the
//               world's step count. In this slice the medium stands unbiased — no magnets,
//               no culture coupling: the dish's fields are Phase 3, the soil coupling is K2.
//               BACKENDS — the fluid carries its own kernel stamp from the simBackends
//               vocabulary: 'js.gs.v1' while the JS reference steps it (this module), or
//               'gpu.gs.v1' when the GPU kernel host (gl/cultureFluidHost.mjs) drives it.
//               The GPU kernel is Tier S (device-dependent, spec §5.4 as ruled for the Full
//               WebGL program): the moment the fluid's backend is a gpu.* id, the world's
//               law is 'decisions-exact', never 'js-exact' — setCultureFluidBackend is the
//               only door, and it recomputes the law through simLawFor so the stamp cannot
//               drift from the backend it names.
//
//   THE SOIL    Phase 1, slice K2 (the parent issue 2187): the DISH LIFE culture — the
//               Generations automaton of engine/dishLife.mjs under its pickup rule
//               (CULTURE_RULE) — grows in the world on the same shared grid, seeded from
//               the world seed alone through the core's own 'dish-life' channel
//               (seedRandom). It steps from the world's clock at the tempo the issue
//               states for the kernel today: 8 generations/second, one generation per
//               CULTURE_LIFE_STEP_DIVISOR world steps — again a pure function of the
//               world step count, no clock of its own. This is the §5.2 soil: Life is
//               never drawn, it computes underneath; Phase 4 reads its published field
//               (cultureLifeField) as the ground the ecology stands on.
//               COUPLING — the fluid biases the culture's births, the established #1997
//               seam (engine/dishFluidCouple.mjs): before each generation, the medium's
//               published density (cultureFluidDensity — the fluid's last completed
//               state, the dish's one-step-behind read discipline) deals births into
//               dead cells at the world's standing coupling strength, from the seeded
//               stream at the world seed. The deal is a pure function of (culture,
//               density, strength, seed), so the JS path stays js-exact. The reverse
//               direction — the culture's level biasing the fluid's feed, which the
//               live stage carries in stepFluid — is NOT wired in this slice: the
//               world's medium keeps the exact character K1 proved, and wiring the
//               level in is a later slice's work (it needs the level published to the
//               fluid's readers with its own parity proof). The GPU mirror
//               (gl/cultureLifeHost.mjs) deals the same births in shader space from
//               the fluid mirror's texture — both fields GPU-resident, no readback —
//               which is the parent issue's coupling shape. The culture carries its
//               own stamp door (setCultureLifeBackend), composed into the world law
//               exactly like the fluid's.
import { STAGE_COLS, STAGE_ROWS } from './dishLifeStage.mjs';
import { createFluid, stepFluid, fluidDensity, fluidHash, fluidSeedKey } from './dishFluid.mjs';
import { createCulture, stepCulture, seedRandom, cultureHash, CULTURE_RULE } from './dishLife.mjs';
import { injectFluidBirths } from './dishFluidCouple.mjs';
import { simLawFor, KNOWN_SIM_BACKENDS, DEFAULT_SIM_BACKENDS } from './kernel/simBackends.js';

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

/**
 * World steps per fluid step: at the 120 Hz world clock the medium steps at 60 steps/s —
 * the tempo the live dish-grid fluid instance already runs at (480 steps/s stamp rate over
 * FLUID_GRID_STEP_DIVISOR 8). The fluid's step count is floor(world.step / this), always.
 */
export const CULTURE_FLUID_STEP_DIVISOR = 2;
/** The fluid kernel's JS backend id (simBackends vocabulary): the reference kernel in dishFluid.mjs. */
export const CULTURE_FLUID_BACKEND = 'js.gs.v1';
/** The fluid kernel's GPU backend id (simBackends vocabulary): gl/fluidSim.mjs, Tier S device-dependent. */
export const CULTURE_FLUID_GPU_BACKEND = 'gpu.gs.v1';

/**
 * World steps per culture generation: at the 120 Hz world clock the soil runs at
 * 8 generations/second — the tempo the parent issue (2187) states for the DISH LIFE
 * kernel today. The culture's generation is floor(world.step / this), always.
 */
export const CULTURE_LIFE_STEP_DIVISOR = 15;
/** The culture kernel's JS backend id (simBackends vocabulary): the reference core in dishLife.mjs. */
export const CULTURE_LIFE_BACKEND = 'js.life.v1';
/** The culture kernel's GPU backend id (simBackends vocabulary): gl/cultureSim.mjs. */
export const CULTURE_LIFE_GPU_BACKEND = 'gpu.life.v1';
/**
 * The density the world's culture is seeded at: seedRandom's own default, the density
 * class the #1923 spike proved the pickup rule (CULTURE_RULE) grows from.
 */
export const CULTURE_LIFE_SEED_DENSITY = 0.3;
/**
 * The world's standing coupling strength (0..1): how hard the medium's density deals
 * births into the culture. On the live stage one COUPLE dial drives the coupling and
 * the kernel sanitizes an unspecified dial to 0.5 (stepFluid); the world has no
 * performer dial yet, so it stands at that same 0.5 until a later phase hands it one.
 */
export const CULTURE_COUPLING = 0.5;

/** Is the dish gate on in a store state or a project document? Only exactly `true` is on. */
export function cultureDishOn(holder) {
  return !!holder && holder[CULTURE_DISH_FIELD] === true;
}

/**
 * Create the world. The grid is the shared Life stage grid, all dead (0) at birth — the
 * soil face Phase 4 reads; the culture itself (Phase 1 K2) lives in `life` below and
 * publishes through its field, the dishLife contract every consumer already reads. The
 * body table is allocated at full capacity with count 0: capacity is a ceiling, not a
 * population.
 *
 * @param {{ seed?: number }} opts
 */
export function createCultureWorld({ seed = 0 } = {}) {
  const cap = CULTURE_BODY_CAP;
  const seedU = seed >>> 0;
  return {
    seed: seedU,
    backend: CULTURE_WORLD_BACKEND,
    simLaw: CULTURE_WORLD_SIM_LAW,
    /**
     * The dish fluid (Phase 1 K1): the Gray-Scott field the citizens will live in, born
     * seeded from the world seed alone (fluidSeedKey(seed, 0) — no wake, no magnets) and
     * stepped by stepCultureWorld at the cadence above. Its phases ARE world state: the
     * world hash covers them.
     */
    fluid: createFluid({ cols: STAGE_COLS, rows: STAGE_ROWS, seedKey: fluidSeedKey(seedU, 0) }),
    /** Which kernel steps the fluid — a simBackends fluid id. JS at birth, always. */
    fluidBackend: CULTURE_FLUID_BACKEND,
    /**
     * The DISH LIFE culture (Phase 1 K2): the soil the dish grows in, born seeded from
     * the world seed alone through the core's 'dish-life' channel (seedRandom at
     * CULTURE_LIFE_SEED_DENSITY) under the pickup rule (CULTURE_RULE), no mask and no
     * bedrock — the world has no terrain yet (the dish's fields are Phase 3). Stepped
     * by stepCultureWorld at the cadence above, coupled to the medium through the
     * birth seam. Its state IS world state: the world hash covers it.
     */
    life: createCulture({
      cols: STAGE_COLS,
      rows: STAGE_ROWS,
      rule: CULTURE_RULE,
      seed: seedRandom(STAGE_COLS, STAGE_ROWS, seedU, CULTURE_LIFE_SEED_DENSITY),
    }),
    /** Which kernel steps the culture — a simBackends culture id. JS at birth, always. */
    lifeBackend: CULTURE_LIFE_BACKEND,
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
 * One fixed step. No bodies exist yet to move, but the medium moves and the soil grows:
 * on every CULTURE_FLUID_STEP_DIVISOR-th world step the dish fluid takes one Gray-Scott
 * step (its own step counter is world.fluid.step), and on every
 * CULTURE_LIFE_STEP_DIVISOR-th world step the culture takes one generation — the
 * medium's published density first deals its births into the culture (the #1997 seam,
 * read at the fluid's last completed state), then the rule steps. Later phases put the
 * solver here; the scheduler law around it does not change.
 */
export function stepCultureWorld(world) {
  world.step += 1;
  if (world.step % CULTURE_FLUID_STEP_DIVISOR === 0) stepFluid(world.fluid);
  if (world.step % CULTURE_LIFE_STEP_DIVISOR === 0) {
    injectFluidBirths(world.life, cultureFluidDensity(world), CULTURE_COUPLING, world.seed);
    stepCulture(world.life);
  }
  return world;
}

/**
 * The law this world's stamps honestly carry, composed through the codebase's own
 * simLawFor over the kernel backends the world runs: the fluid and the culture under
 * their recorded backends, the swarm kernel still JS (it is not in the world yet).
 * 'js-exact' while every kernel is a js.* id; 'decisions-exact' the moment one is not.
 */
export function cultureWorldSimLaw(world) {
  return simLawFor({ ...DEFAULT_SIM_BACKENDS, fluid: world.fluidBackend, culture: world.lifeBackend });
}

/**
 * Record which kernel backend steps the world's fluid — the ONLY door for that change,
 * so the backend and the law stamped on the world can never disagree. A GPU host that
 * takes the medium over (gl/cultureFluidHost.mjs) names 'gpu.gs.v1' here and the world's
 * law becomes 'decisions-exact' in the same motion; handing it back to the JS reference
 * restores 'js-exact'. An id the simBackends vocabulary does not know is refused.
 */
export function setCultureFluidBackend(world, backend) {
  if (!KNOWN_SIM_BACKENDS.fluid.includes(backend))
    throw new Error(`cultureWorld: unknown fluid backend "${String(backend)}"`);
  world.fluidBackend = backend;
  world.simLaw = cultureWorldSimLaw(world);
  return world;
}

/**
 * Record which kernel backend steps the world's culture — the ONLY door for that
 * change, the fluid door's twin: a GPU host that takes the soil over
 * (gl/cultureLifeHost.mjs) names 'gpu.life.v1' here and the world's law becomes
 * 'decisions-exact' in the same motion; handing it back to the JS reference restores
 * 'js-exact' (provided the fluid is also JS). An id the simBackends vocabulary does
 * not know is refused.
 */
export function setCultureLifeBackend(world, backend) {
  if (!KNOWN_SIM_BACKENDS.culture.includes(backend))
    throw new Error(`cultureWorld: unknown culture backend "${String(backend)}"`);
  world.lifeBackend = backend;
  world.simLaw = cultureWorldSimLaw(world);
  return world;
}

/**
 * The medium's published face: the dark-phase density at the shared grid (a fresh
 * Float32Array, read it the step you get it) — what the culture coupling reads on the
 * live stage today, and what K2 will read in this world next.
 */
export function cultureFluidDensity(world) {
  return fluidDensity(world.fluid);
}

/**
 * The soil's published face: the culture's field ({ cols, rows, gen, level, activity })
 * — level 1 where the ground lives, easing to 0 through the decay states; activity how
 * recently each cell changed. This is the read the #2152 force and Phase 4's ecology
 * stand on (Life is never drawn; consumers read the field). The dishLife contract
 * applies: the arrays are the culture's own, reused in place — read them the step you
 * get them, never hold them across steps.
 */
export function cultureLifeField(world) {
  return world.life.field;
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
 * count, carried remainder (bit-exact), dropped count, the soil grid, the fluid medium
 * (its backend id and the kernel's own quantized fingerprint), the culture (its backend
 * id and the core's own state fingerprint), and the body table's living prefix. Same
 * feed sequence => same hash, on any device (all arithmetic here is IEEE-exact JS).
 * FNV-1a, the dishWet.selfcheck precedent.
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
  mixStr(world.fluidBackend);
  mixU32(fluidHash(world.fluid));
  mixStr(world.lifeBackend);
  mixU32(cultureHash(world.life));
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
