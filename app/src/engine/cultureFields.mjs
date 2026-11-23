// cultureFields.mjs — CULTURE Phase 3, slice A: the standing fields of the dish —
// the Queen's fields, and the ferrofluid as a force on bodies (the parent issue
// 2178, world side). Pure: no DOM, no GL, no clock. The world
// (engine/cultureWorld.mjs) feeds it steps; it never reads time, files, or
// globals beyond its arguments.
//
// THE QUEEN OWNS THE FIELDS — spec §4 Q4, Matt's ruling (2026-11-22): "The
// Queen owns the fields. She places and moves the dish's standing fields under
// the Governor's direction; recipes and personas may only request." The chain
// is §2.7's: GOVERNOR manages → QUEEN keeps → creatures live, and the Governor
// never touches the dish himself. In this module that law is structural, not
// etiquette: the fields table has exactly one write path, the Queen's doors in
// cultureWorld.mjs (dealCultureField / moveCultureField / retireCultureField /
// resolveCultureFieldRequest). Direction arrives as calls to those doors —
// there is no other hand to write through, which is what "under the Governor's
// direction" can mean in code. Everyone else — recipes, personas, a later
// phase's systems — gets requestCultureField: an entry in the request log.
// A request deals nothing, moves nothing, and pulls nothing; it stands in the
// log until the Queen's door resolves it (applied — dealt verbatim through
// the same validation as a direct deal — or declined). The asymmetry is the
// ruling, and the suite pins it: a pending request leaves the fields table
// and every body's motion bit-identical to a world that never heard it.
//
// FIELDS ARE FORCES, NEVER BODIES — the performer's-hand ruling's shape (§4
// Q3) and the ferro law (the parent issue): an underneath system is never
// drawn; it is seen only through what it moves. A field has no mass, no disc,
// no velocity of its own; it never enters the contact dealer or the solver
// (the tables it would need do not exist here — no mass column, no radius
// column). It writes exactly one thing: velocity deltas on the body table,
// as a force. The world has no rendering at all, and this module adds none.
//
// THE MAGNET — the one field kind this slice deals, and the ferro's pull on
// bodies. The pull law is Matt's ruling on the parent issue (2026-11-15),
// verbatim in substance: TOWARD THE MAGNET, FIELD-GATED. Direction is the
// unit vector from the body to the magnet — the magnet model the fluid kernel
// already carries (engine/dishFluid.mjs: a placed point the field gathers
// around). Strength gates on the medium: the pull at a body scales with the
// fluid's published density at the body's own cell (cultureWorld's
// cultureFluidDensity — the K1 medium, read at its last completed state, the
// dish's one-step-behind discipline). No fluid, no pull: a body standing in
// a dry cell feels nothing, however strong the magnet, and density that grew
// somewhere no magnet stands pulls nothing either — the force exists only
// where a dealt magnet and the medium meet. The falloff is the kernel's own
// magnet shape, the gaussian exp(−(d/R)²), with R the field's radius (the
// kernel's MAGNET_RADIUS at the dish's width, by default). One dial class
// per force, per the one-force seam: the field's strength is the magnet's
// own, stated in velocity gained per field step at density 1 and falloff 1.
// Acceleration is NOT divided by body mass: the field is the dish's weather,
// not the body's own dynamics — mass speaks through contacts (the solver),
// not through the medium. Multiple magnets compose additively, the kernel's
// own reading ("overlapping magnets add up").
//
// THE STEP — fields act on the swarm's cadence, inside the same world step,
// immediately BEFORE the swarm's integrator: forces first, then the core
// integrates (its damping and speed clamp spend field-given velocity exactly
// like boids-given velocity — no body leaves a world step faster than the
// core allows, whoever pushed it), then the solver resolves the contacts
// that motion produced. One field step per swarm step, counted in
// fields.step — floor(world.step / CULTURE_SWARM_STEP_DIVISOR), always. The
// read of the medium is the published density the world hands in; this
// module never reaches into the fluid itself.
//
// THE KINDS — the kind column and the per-kind dispatch in stepCultureFields
// are the general machinery; the magnet is the only kind this slice's doors
// will deal. The remaining named field is the hand's current (§4 Q3, the
// parent issue 2153): it is Phase 3B's slice, deliberately not dealt here —
// a current dealt by a performer's hand has a writer (the hand) the Queen's
// table does not impersonate. Unknown kinds are refused at the door, loudly.
//
// LAW — the fields are resolver-class, like the solver: CPU JS by the Full
// WebGL program's standing law, a pure function of world state, js-exact,
// and they stamp nothing of their own. The world's law composition is
// unchanged by this phase.
import { MAGNET_RADIUS, MAX_MAGNETS } from './dishFluid.mjs';
import { CULTURE_SWARM_WORLD_W, CULTURE_SWARM_WORLD_H } from './cultureSwarm.mjs';
import { STAGE_COLS, STAGE_ROWS } from './dishLifeStage.mjs';

/** Field kind: the magnet — a point attractor, the ferro's pull. The only kind dealt in this slice. */
export const CULTURE_FIELD_KIND_MAGNET = 0;
/** The kind vocabulary the doors speak, name → kind id. Anything outside it is refused. */
export const CULTURE_FIELD_KINDS = Object.freeze({ magnet: CULTURE_FIELD_KIND_MAGNET });
/** The kind vocabulary by id, id → name: how a stored request names its kind back to the deal door. */
export const CULTURE_FIELD_KIND_NAMES = Object.freeze(['magnet']);

/**
 * Standing-field capacity: fields are sparse, placed things (the kernel's own
 * magnet list caps at 8); 64 leaves the table room to grow kinds without ever
 * being a population.
 */
export const CULTURE_FIELDS_CAP = 64;
/** Request-log capacity: requests are cheap to make and dear to resolve; the log is bounded, loudly. */
export const CULTURE_FIELD_REQUESTS_CAP = 256;

/** Request states: a request is born pending; only the Queen's resolution moves it. */
export const CULTURE_FIELD_REQUEST_PENDING = 0;
export const CULTURE_FIELD_REQUEST_APPLIED = 1;
export const CULTURE_FIELD_REQUEST_DECLINED = 2;

/**
 * A magnet's default reach, in body-space pixels: the fluid kernel's
 * MAGNET_RADIUS (0.085, dish-normalized) at the dish's width — the kernel's
 * magnet shape, restated in the space bodies move in.
 */
export const CULTURE_FIELD_MAGNET_RADIUS = MAGNET_RADIUS * CULTURE_SWARM_WORLD_W;
/**
 * A magnet's default strength: velocity gained per field step at density 1
 * and falloff 1, in body-space pixels per step. A starting constant, tunable
 * in iteration like every phase dial — at the medium's standing densities a
 * dealt magnet gathers a resting body to the core's speed clamp within a
 * second or so of dish time, and no faster (the clamp is the ceiling).
 */
export const CULTURE_FIELD_MAGNET_STRENGTH = 0.3;

/**
 * The standing-fields table: the Queen's placed forces, by dealt index.
 * Indices are never reused or shifted — retiring a field clears its active
 * flag and leaves the slot standing, so a recorded field index can never
 * silently come to name a different field.
 */
export function createCultureFields() {
  const cap = CULTURE_FIELDS_CAP;
  return {
    capacity: cap,
    /** Dealt slots (active + retired). */
    count: 0,
    /** Field steps run: floor(world.step / CULTURE_SWARM_STEP_DIVISOR), the swarm's cadence. */
    step: 0,
    kind: new Uint8Array(cap),
    active: new Uint8Array(cap),
    x: new Float32Array(cap),
    y: new Float32Array(cap),
    strength: new Float32Array(cap),
    radius: new Float32Array(cap),
  };
}

/**
 * The field-request log: what recipes and personas asked for, and what the
 * Queen answered. A request stores the normalized spec it was validated with
 * (defaults already filled), so applying it deals exactly what was asked —
 * the log is the record, not a sketch.
 */
export function createCultureFieldRequests() {
  const cap = CULTURE_FIELD_REQUESTS_CAP;
  return {
    capacity: cap,
    count: 0,
    status: new Uint8Array(cap),
    /** The dealt field's index once applied; −1 while pending or once declined. */
    field: new Int32Array(cap).fill(-1),
    kind: new Uint8Array(cap),
    x: new Float32Array(cap),
    y: new Float32Array(cap),
    strength: new Float32Array(cap),
    radius: new Float32Array(cap),
  };
}

/**
 * Validate and normalize a field spec — the one reading of a spec every door
 * shares (deal, request, and apply all pass through it, so a request can
 * never carry a field the deal door would refuse). Defaults fill: kind the
 * magnet, strength and radius the kind's standing constants. Refusals are
 * loud: an unknown kind, a non-finite position, a negative or non-finite
 * strength (the pull law is toward the magnet — a negative strength is a
 * different field wearing the magnet's name), a non-positive radius.
 * Returns { kind, x, y, strength, radius } with kind as its numeric id.
 */
export function normalizeCultureFieldSpec(spec) {
  const s = spec || {};
  const kindName = s.kind === undefined ? 'magnet' : s.kind;
  if (!Object.hasOwn(CULTURE_FIELD_KINDS, kindName))
    throw new Error(`cultureFields: unknown field kind "${String(kindName)}" — the magnet is the dealt kind`);
  const kind = CULTURE_FIELD_KINDS[kindName];
  const { x, y } = s;
  if (!Number.isFinite(x) || !Number.isFinite(y))
    throw new Error(`cultureFields: bad field position "${String(x)}", "${String(y)}" — finite coordinates`);
  const strength = s.strength === undefined ? CULTURE_FIELD_MAGNET_STRENGTH : s.strength;
  if (!Number.isFinite(strength) || strength < 0)
    throw new Error(`cultureFields: bad field strength "${String(s.strength)}" — finite, zero or more`);
  const radius = s.radius === undefined ? CULTURE_FIELD_MAGNET_RADIUS : s.radius;
  if (!Number.isFinite(radius) || radius <= 0)
    throw new Error(`cultureFields: bad field radius "${String(s.radius)}" — finite, greater than zero`);
  return { kind, x, y, strength, radius };
}

/**
 * One field step over a body table: every active field writes its force into
 * the living bodies' velocities. The medium's published density (a fresh
 * Float32Array over the shared grid) gates the magnet's pull cell by cell —
 * the body reads the density of the cell it stands in, cells being the shared
 * grid laid over body space (the K3 extent identity: 20 px per cell). Fields
 * ascend by dealt index, bodies by index — canonical order, plain IEEE-exact
 * JS arithmetic: same tables and density in, same table out, on any device.
 * Advances fields.step by one (the step counts even over an empty table —
 * the kernel ran). Dead bodies feel nothing; a body exactly on a magnet has
 * no direction to be pulled in and is left alone.
 */
export function stepCultureFields(bodies, fields, density) {
  const { count, alive, x, y, vx, vy } = bodies;
  const cellW = CULTURE_SWARM_WORLD_W / STAGE_COLS;
  const cellH = CULTURE_SWARM_WORLD_H / STAGE_ROWS;
  for (let f = 0; f < fields.count; f++) {
    if (!fields.active[f]) continue;
    // The magnet is the only dealt kind; the dispatch is where a later kind lands.
    if (fields.kind[f] !== CULTURE_FIELD_KIND_MAGNET) continue;
    const fx = fields.x[f];
    const fy = fields.y[f];
    const strength = fields.strength[f];
    const radius = fields.radius[f];
    if (!(strength > 0)) continue;
    for (let i = 0; i < count; i++) {
      if (!alive[i]) continue;
      let cx = Math.floor(x[i] / cellW);
      let cy = Math.floor(y[i] / cellH);
      cx = cx < 0 ? 0 : cx >= STAGE_COLS ? STAGE_COLS - 1 : cx;
      cy = cy < 0 ? 0 : cy >= STAGE_ROWS ? STAGE_ROWS - 1 : cy;
      const gate = density[cy * STAGE_COLS + cx];
      if (!(gate > 0)) continue;
      const dx = fx - x[i];
      const dy = fy - y[i];
      const d2 = dx * dx + dy * dy;
      if (d2 <= 1e-18) continue;
      const d = Math.sqrt(d2);
      const fall = Math.exp(-(d2 / (radius * radius)));
      const a = strength * gate * fall;
      vx[i] += (dx / d) * a;
      vy[i] += (dy / d) * a;
    }
  }
  fields.step += 1;
  return bodies;
}

/**
 * The pull dial the world's medium reads its magnet bias at: the kernel's own
 * standing default (the sanitizeFluidDial / stepFluid default, 0.7), so a
 * default-strength field biases the medium's growth exactly as a stage magnet
 * at the dial's standing position. The per-field variation rides in each
 * magnet's weight (below), not in the dial — the world has no PULL dial, the
 * field's dealt strength is its pull (slice A's design call, carried through).
 */
export const CULTURE_FIELD_FLUID_PULL = 0.7;

/**
 * The fields table read as the fluid kernel's magnet list — the magnet growth
 * bias (Phase 3B; the parent issue's stage law: stamped magnets bias feed/kill
 * so the dark phase grows toward a magnet). Active magnet fields, in dealt
 * order, at most the kernel's own MAX_MAGNETS (the ceiling its GPU mirror's
 * uniform array is sized by — the bias reads the first magnets dealt, the
 * kernel's reading everywhere). Each entry is dish-normalized { x, y, w }:
 * the position in the kernel's space, and the weight w = the field's strength
 * over the standing default strength, so a default-strength field weighs
 * exactly 1 — a stage magnet. A zero-strength field is inert here as it is in
 * the body pull, and a retired field biases nothing. A fresh list each call —
 * read it the step you get it. Pure.
 */
export function cultureFieldMagnets(fields) {
  const out = [];
  for (let f = 0; f < fields.count && out.length < MAX_MAGNETS; f++) {
    if (!fields.active[f] || fields.kind[f] !== CULTURE_FIELD_KIND_MAGNET) continue;
    const strength = fields.strength[f];
    if (!(strength > 0)) continue;
    out.push({
      x: fields.x[f] / CULTURE_SWARM_WORLD_W,
      y: fields.y[f] / CULTURE_SWARM_WORLD_H,
      w: strength / CULTURE_FIELD_MAGNET_STRENGTH,
    });
  }
  return out;
}

const _f64 = new DataView(new ArrayBuffer(8));

/**
 * A canonical hash of the Queen's standing state: the fields table (step,
 * count, then each dealt slot's kind, active flag, and spec, floats
 * bit-exact) and the request log (count, then each entry's status, dealt
 * field, and stored spec). A pending request is state — two worlds that
 * differ only in what the Queen has been asked are different worlds. Same
 * tables => same hash, on any device. FNV-1a, the cultureSolverHash
 * discipline — the world hash folds this in whole.
 */
export function cultureFieldsHash(fields, requests) {
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
  const mixFloat = (v) => {
    _f64.setFloat64(0, v);
    for (let i = 0; i < 8; i++) mix(_f64.getUint8(i));
  };
  mixU32(fields.step);
  mixU32(fields.count);
  for (let f = 0; f < fields.count; f++) {
    mix(fields.kind[f]);
    mix(fields.active[f]);
    mixFloat(fields.x[f]);
    mixFloat(fields.y[f]);
    mixFloat(fields.strength[f]);
    mixFloat(fields.radius[f]);
  }
  mixU32(requests.count);
  for (let r = 0; r < requests.count; r++) {
    mix(requests.status[r]);
    mixU32(requests.field[r]);
    mix(requests.kind[r]);
    mixFloat(requests.x[r]);
    mixFloat(requests.y[r]);
    mixFloat(requests.strength[r]);
    mixFloat(requests.radius[r]);
  }
  return h >>> 0;
}
