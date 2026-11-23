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
//
//   THE BODIES  Phase 1, slice K3 (the parent issue 2188): the swarm/contacts kernel
//               reaches the world's body table. The table gains the swarm's state
//               columns (velocity, mass, disc radius) and stepCultureWorld steps the
//               swarm over the living bodies on the JS reference core
//               (engine/cultureSwarm.mjs — particles.js's cloud core as a pure
//               function) at half the world clock: one swarm step per
//               CULTURE_SWARM_STEP_DIVISOR world steps is one 60 fps frame, the live
//               swarm's tempo, and the step count is again a pure function of the
//               world's step count. The table is also where contact DETECTION reads:
//               cultureSwarmContactPairs deals the pair list in the shipped
//               detector's shape over the living discs (resolution is the Phase 2
//               solver's work, on this same table). Bodies themselves are still
//               nobody's to create — Phase 5 deals the citizens; in this slice the
//               table stands empty in the app (count 0) and the suites prove the
//               engine over dealt test populations. The swarm carries its own stamp
//               door (setCultureSwarmBackend), composed into the world law exactly
//               like the fluid's and the culture's; the GPU mirror is
//               gl/cultureSwarmHost.mjs. Contacts detection runs on the JS
//               predicate in this slice, so the optional contacts kernel stays
//               unnamed in the world's stamp — its door arrives with a GPU producer
//               in the world, the live stage's producer pattern.
//
//   THE SOLVER  Phase 2 (the parent issue 1598): the in-house solver
//               (engine/cultureSolver.mjs) resolves the contacts the swarm's
//               integrator produces — on the swarm's own cadence, inside the
//               same world step, immediately after the swarm step: detect (the
//               K3 pair dealer), impulse (mass-weighted, restitution 0 — the
//               dish clumps, §2.3), project (positional, iterated). The shapes
//               are the parent issue's ruling: the disc is the dynamic shape,
//               and the one static shape is the AABB — scenery at infinite
//               mass, dealt into world.statics, empty until a scene deals one.
//               Distance links (world.links) are the solver's joints: a
//               compound body at this layer is discs plus links (§2.4);
//               assembling them from rigs is Phase 5's dealing, not the
//               solver's. The solver is resolver-class — CPU JS by the Full
//               WebGL program's standing law — and carries NO stamp of its
//               own: it is part of the world's own step, like the scheduler,
//               and the law composition above does not change. With no pairs,
//               no statics, and no links it is a bit-exact no-op (the parent
//               issue's inherited parity law, restated for the world).
//
//   THE FIELDS  Phase 3, slice A (the parent issue 2178, world side): the
//               dish's standing fields (engine/cultureFields.mjs) — forces,
//               never bodies, never drawn. The QUEEN owns them (spec §4 Q4):
//               she places and moves them under the Governor's direction, and
//               the doors below (deal / move / retire / resolve) are the only
//               write path — recipes and personas may only REQUEST, through
//               the request log the Queen's resolution door drains. The one
//               kind dealt in this slice is the magnet, the ferro's pull on
//               bodies under its ruled law (the parent issue, 2026-11-15):
//               toward the magnet, field-gated — the pull at a body scales
//               with the medium's published density at the body's cell, read
//               at the fluid's last completed state like every coupling read
//               in this world. Fields act on the swarm's cadence, inside the
//               same world step, immediately before the swarm's integrator:
//               forces first, then the core integrates, then the solver
//               resolves. The hand's current (the parent issue 2153) is the
//               next slice's field, not this one's. The fields are
//               resolver-class — CPU JS, no stamp of their own; the law
//               composition above does not change. Born empty: no scene has
//               dealt a field yet, and an empty table is the parity position
//               (a field step over no fields moves nothing).
import { STAGE_COLS, STAGE_ROWS } from './dishLifeStage.mjs';
import { createFluid, stepFluid, fluidDensity, fluidHash, fluidSeedKey } from './dishFluid.mjs';
import { createCulture, stepCulture, seedRandom, cultureHash, CULTURE_RULE } from './dishLife.mjs';
import { injectFluidBirths } from './dishFluidCouple.mjs';
import { stepCultureSwarm, cultureContactPairs, cultureSwarmHash } from './cultureSwarm.mjs';
import { stepCultureSolver, createCultureStatics, createCultureLinks, cultureSolverHash } from './cultureSolver.mjs';
import {
  createCultureFields,
  createCultureFieldRequests,
  stepCultureFields,
  cultureFieldsHash,
  normalizeCultureFieldSpec,
  CULTURE_FIELD_KIND_NAMES,
  CULTURE_FIELD_REQUEST_PENDING,
  CULTURE_FIELD_REQUEST_APPLIED,
  CULTURE_FIELD_REQUEST_DECLINED,
} from './cultureFields.mjs';
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

/**
 * World steps per swarm step: at the 120 Hz world clock the swarm runs at 60 steps/s —
 * one swarm step is one 60 fps frame (the reference core's dtFrames = 1), the tempo the
 * live swarm steps at. The swarm's step count is floor(world.step / this), always.
 */
export const CULTURE_SWARM_STEP_DIVISOR = 2;
/** The swarm kernel's JS backend id (simBackends vocabulary): the reference core in cultureSwarm.mjs. */
export const CULTURE_SWARM_BACKEND = 'js.swarm.v1';
/** The swarm kernel's GPU backend id (simBackends vocabulary): gl/swarmSim.mjs, Tier S device-dependent. */
export const CULTURE_SWARM_GPU_BACKEND = 'gpu.swarm.v1';

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
    /** Which kernel steps the swarm — a simBackends swarm id. JS at birth, always. */
    swarmBackend: CULTURE_SWARM_BACKEND,
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
      /** Whole swarm steps run over this table (Phase 1 K3): floor(world.step / CULTURE_SWARM_STEP_DIVISOR). */
      step: 0,
      alive: new Uint8Array(cap),
      x: new Float32Array(cap),
      y: new Float32Array(cap),
      /** The swarm's velocity columns (Phase 1 K3): the kernel's state channels beside position. */
      vx: new Float32Array(cap),
      vy: new Float32Array(cap),
      /** Per-body mass (Phase 1 K3): the kernel's static channel, 1 at birth — a dealt body may carry its own. */
      mass: new Float32Array(cap).fill(1),
      /** Per-body contact disc radius (Phase 1 K3): 0 at birth — no disc, no contact pair (the dish law). */
      radius: new Float32Array(cap),
    },
    /**
     * The static scenery (Phase 2): AABB boxes at infinite mass — the parent
     * issue's one added shape. Empty at birth: no scene has dealt a box yet,
     * and an empty table is the parity position (the solver reads it as air).
     */
    statics: createCultureStatics(),
    /**
     * The solver's joints (Phase 2): distance links between body indices.
     * Empty at birth — compound bodies are dealt by their assemblers
     * (Phase 5), never born linked.
     */
    links: createCultureLinks(),
    /** The solver's own step counter: floor(world.step / CULTURE_SWARM_STEP_DIVISOR), the swarm's cadence. */
    solver: { step: 0 },
    /**
     * The standing fields (Phase 3, slice A): the Queen's placed forces —
     * magnets in this slice. Empty at birth: no scene has dealt a field yet.
     * Written only through the Queen's doors below.
     */
    fields: createCultureFields(),
    /**
     * The field-request log (Phase 3, slice A): what recipes and personas
     * have asked the Queen for, and what she answered. Born empty; a request
     * stands here until the Queen's resolution door applies or declines it.
     */
    fieldRequests: createCultureFieldRequests(),
  };
}

/** Sim time, in seconds: exactly the whole steps run, never the fed wall time. */
export function cultureWorldSimTimeS(world) {
  return world.step * CULTURE_STEP_S;
}

/**
 * One fixed step. The medium moves, the soil grows, and the bodies swim: on every
 * CULTURE_FLUID_STEP_DIVISOR-th world step the dish fluid takes one Gray-Scott step
 * (its own step counter is world.fluid.step); on every CULTURE_LIFE_STEP_DIVISOR-th
 * world step the culture takes one generation — the medium's published density first
 * deals its births into the culture (the #1997 seam, read at the fluid's last
 * completed state), then the rule steps; and on every CULTURE_SWARM_STEP_DIVISOR-th
 * world step the swarm takes one step over the living bodies (its own step counter
 * is world.bodies.step — over an empty table the step still counts: the kernel ran)
 * and the solver immediately resolves the contacts that step produced (its own
 * step counter is world.solver.step, the same cadence — a solver step per swarm
 * step, never a stale or skipped snapshot). On that same cadence, immediately
 * before the swarm's integrator, the standing fields write their forces into
 * the bodies' velocities (their own step counter is world.fields.step — forces
 * first, then the core integrates, then the solver resolves; the fields read
 * the medium's published density at its last completed state). The scheduler
 * law around all of this does not change.
 */
export function stepCultureWorld(world) {
  world.step += 1;
  if (world.step % CULTURE_FLUID_STEP_DIVISOR === 0) stepFluid(world.fluid);
  if (world.step % CULTURE_LIFE_STEP_DIVISOR === 0) {
    injectFluidBirths(world.life, cultureFluidDensity(world), CULTURE_COUPLING, world.seed);
    stepCulture(world.life);
  }
  if (world.step % CULTURE_SWARM_STEP_DIVISOR === 0) {
    stepCultureFields(world.bodies, world.fields, cultureFluidDensity(world));
    stepCultureSwarm(world.bodies);
    stepCultureSolver(world.bodies, world.statics, world.links);
    world.solver.step += 1;
  }
  return world;
}

/**
 * Deal one static AABB into the world — the ONLY door for scenery, in the stamp
 * doors' refuse-loudly idiom: a non-finite or inverted box is refused, and so is
 * a box past the table's ceiling. Returns the box's index. Scenery is dealt by
 * scenes (a later phase's call); the world is born with none.
 */
export function addCultureStatic(world, box) {
  const statics = world.statics;
  if (statics.count >= statics.capacity) throw new Error(`cultureWorld: statics table full (${statics.capacity})`);
  const { minX, minY, maxX, maxY } = box || {};
  if (![minX, minY, maxX, maxY].every(Number.isFinite) || minX > maxX || minY > maxY)
    throw new Error(`cultureWorld: bad static box "${JSON.stringify(box)}" — finite corners, min no greater than max`);
  const i = statics.count;
  statics.minX[i] = minX;
  statics.minY[i] = minY;
  statics.maxX[i] = maxX;
  statics.maxY[i] = maxY;
  statics.count += 1;
  return i;
}

/**
 * Deal one distance link between two dealt bodies — the ONLY door for joints.
 * `rest` defaults to the bodies' current distance (a link dealt at rest length
 * holds the shape it was dealt in). A self-link, an endpoint outside the dealt
 * population, a negative or non-finite rest, and a link past the table's
 * ceiling are all refused, loudly. Returns the link's index.
 */
export function addCultureLink(world, a, b, rest) {
  const links = world.links;
  if (links.count >= links.capacity) throw new Error(`cultureWorld: links table full (${links.capacity})`);
  const n = world.bodies.count;
  if (!Number.isInteger(a) || !Number.isInteger(b) || a === b || a < 0 || b < 0 || a >= n || b >= n)
    throw new Error(`cultureWorld: bad link endpoints "${a}", "${b}" — two distinct dealt bodies`);
  const r =
    rest === undefined
      ? Math.sqrt((world.bodies.x[b] - world.bodies.x[a]) ** 2 + (world.bodies.y[b] - world.bodies.y[a]) ** 2)
      : rest;
  if (!Number.isFinite(r) || r < 0)
    throw new Error(`cultureWorld: bad link rest "${String(rest)}" — a finite length, zero or more`);
  const i = links.count;
  links.a[i] = a;
  links.b[i] = b;
  links.rest[i] = r;
  links.count += 1;
  return i;
}

/**
 * THE QUEEN'S DOORS — the only write path to the standing fields (spec §4
 * Q4). The Queen deals, moves, and retires fields under the Governor's
 * direction; direction arrives as calls here, because there is no other hand
 * to write through. Every door validates in the stamp doors' refuse-loudly
 * idiom, through the one spec reading (normalizeCultureFieldSpec) the deal,
 * request, and apply paths all share.
 */

/**
 * Deal one standing field into the world — the Queen's hand. The spec is
 * validated and normalized (defaults filled) before anything is written; a
 * field past the table's ceiling is refused. Returns the field's index,
 * which names this field for its whole life (indices are never reused).
 */
export function dealCultureField(world, spec) {
  const fields = world.fields;
  if (fields.count >= fields.capacity) throw new Error(`cultureWorld: fields table full (${fields.capacity})`);
  const s = normalizeCultureFieldSpec(spec);
  const i = fields.count;
  fields.kind[i] = s.kind;
  fields.active[i] = 1;
  fields.x[i] = s.x;
  fields.y[i] = s.y;
  fields.strength[i] = s.strength;
  fields.radius[i] = s.radius;
  fields.count += 1;
  return i;
}

/**
 * Move one standing field — the Queen's hand again. The field must be dealt
 * and standing (a retired field is gone; it does not move), and the
 * destination must be finite. Returns the field's index.
 */
export function moveCultureField(world, index, to) {
  const fields = world.fields;
  if (!Number.isInteger(index) || index < 0 || index >= fields.count || !fields.active[index])
    throw new Error(`cultureWorld: no standing field at index "${String(index)}" — a dealt, unretired field`);
  const { x, y } = to || {};
  if (!Number.isFinite(x) || !Number.isFinite(y))
    throw new Error(`cultureWorld: bad field move "${String(x)}", "${String(y)}" — finite coordinates`);
  fields.x[index] = x;
  fields.y[index] = y;
  return index;
}

/**
 * Retire one standing field — the Queen removes it from the dish. The slot
 * stands (its index is never reused or shifted); the field simply exerts
 * nothing from this step on. Returns the field's index.
 */
export function retireCultureField(world, index) {
  const fields = world.fields;
  if (!Number.isInteger(index) || index < 0 || index >= fields.count || !fields.active[index])
    throw new Error(`cultureWorld: no standing field at index "${String(index)}" — a dealt, unretired field`);
  fields.active[index] = 0;
  return index;
}

/**
 * Request a field — the ONLY door recipes and personas get (spec §4 Q4: they
 * may only request). The spec is validated exactly as a deal would be (the
 * log holds no request the Queen could not deal), normalized, and entered in
 * the request log as pending. A request writes NOTHING to the fields table:
 * no field exists, no body feels anything, until the Queen resolves it.
 * Returns the request's index in the log.
 */
export function requestCultureField(world, spec) {
  const requests = world.fieldRequests;
  if (requests.count >= requests.capacity)
    throw new Error(`cultureWorld: field request log full (${requests.capacity})`);
  const s = normalizeCultureFieldSpec(spec);
  const i = requests.count;
  requests.status[i] = CULTURE_FIELD_REQUEST_PENDING;
  requests.field[i] = -1;
  requests.kind[i] = s.kind;
  requests.x[i] = s.x;
  requests.y[i] = s.y;
  requests.strength[i] = s.strength;
  requests.radius[i] = s.radius;
  requests.count += 1;
  return i;
}

/**
 * Resolve one pending request — the Queen's answer, and the only path from
 * request to field. With `apply` true, the requested field is dealt verbatim
 * (through dealCultureField, so a fields table that filled since the request
 * refuses loudly and the request stays pending); with `apply` false, the
 * request is declined and deals nothing. Resolving a request that is not
 * pending is refused. Returns the dealt field's index, or −1 when declined.
 */
export function resolveCultureFieldRequest(world, requestIndex, apply) {
  const requests = world.fieldRequests;
  if (
    !Number.isInteger(requestIndex) ||
    requestIndex < 0 ||
    requestIndex >= requests.count ||
    requests.status[requestIndex] !== CULTURE_FIELD_REQUEST_PENDING
  )
    throw new Error(`cultureWorld: no pending field request at index "${String(requestIndex)}"`);
  if (!apply) {
    requests.status[requestIndex] = CULTURE_FIELD_REQUEST_DECLINED;
    return -1;
  }
  const fieldIndex = dealCultureField(world, {
    kind: CULTURE_FIELD_KIND_NAMES[requests.kind[requestIndex]],
    x: requests.x[requestIndex],
    y: requests.y[requestIndex],
    strength: requests.strength[requestIndex],
    radius: requests.radius[requestIndex],
  });
  requests.status[requestIndex] = CULTURE_FIELD_REQUEST_APPLIED;
  requests.field[requestIndex] = fieldIndex;
  return fieldIndex;
}

/**
 * The law this world's stamps honestly carry, composed through the codebase's own
 * simLawFor over the kernel backends the world runs: the fluid, the culture, and the
 * swarm under their recorded backends (the optional contacts kernel stays unnamed —
 * its detection runs on the JS predicate in this slice, which is the absent = JS
 * reading simLawFor already gives it). 'js-exact' while every kernel is a js.* id;
 * 'decisions-exact' the moment one is not.
 */
export function cultureWorldSimLaw(world) {
  return simLawFor({
    ...DEFAULT_SIM_BACKENDS,
    fluid: world.fluidBackend,
    culture: world.lifeBackend,
    swarm: world.swarmBackend,
  });
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
 * Record which kernel backend steps the world's swarm — the ONLY door for that
 * change, the fluid and culture doors' twin: a GPU host that takes the bodies over
 * (gl/cultureSwarmHost.mjs) names 'gpu.swarm.v1' here and the world's law becomes
 * 'decisions-exact' in the same motion (the swarm is Tier S — its outcomes are the
 * recording device's own); handing it back to the JS reference restores 'js-exact'
 * (provided the fluid and the culture are also JS). An id the simBackends
 * vocabulary does not know is refused — including the contacts kernel's ids: that
 * kernel is not the swarm, and its stamp is not this door's to give.
 */
export function setCultureSwarmBackend(world, backend) {
  if (!KNOWN_SIM_BACKENDS.swarm.includes(backend))
    throw new Error(`cultureWorld: unknown swarm backend "${String(backend)}"`);
  world.swarmBackend = backend;
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
 * The bodies' published face for contacts: the touching pairs over the world's
 * living discs right now, in the shipped detector's shape and canonical order
 * (engine/cultureSwarm.mjs cultureContactPairs — detection only; a fresh list,
 * read it the step you get it). This is the read the Phase 2 solver resolves and
 * a GPU detection producer would one day record, exactly as the stage records
 * its pair lists as inputs.
 */
export function cultureSwarmContactPairs(world) {
  return cultureContactPairs(world.bodies);
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
 * id and the core's own state fingerprint), the body table (its count, the swarm's
 * backend id, and the swarm core's own fingerprint of the dealt prefix — step, alive,
 * position, velocity, mass, radius), the solver's standing state (its step count
 * and the solver core's fingerprint of the statics and links), and the Queen's
 * standing state (the fields core's fingerprint of the fields table and the
 * request log). Same feed sequence =>
 * same hash, on any device (all arithmetic here is IEEE-exact JS). FNV-1a, the
 * dishWet.selfcheck precedent.
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
  mixStr(world.swarmBackend);
  mixU32(world.bodies.count);
  mixU32(cultureSwarmHash(world.bodies));
  mixU32(world.solver.step);
  mixU32(cultureSolverHash(world.statics, world.links));
  mixU32(cultureFieldsHash(world.fields, world.fieldRequests));
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
