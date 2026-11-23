// cultureHand.mjs — CULTURE Phase 3, slice B: the performer's hand as a current
// in the dish (the parent issue 2153, dish-side consumption). Pure: no DOM, no
// GL, no clock. The world (engine/cultureWorld.mjs) feeds it steps; it never
// reads time, files, or globals beyond its arguments.
//
// THE HAND IS A FORCE, NEVER A BODY — spec §4 Q3, Matt's ruling (2026-11-22):
// "The hand stirs and scatters; finger painting (#2153) enters the dish as a
// current the creatures feel, not as a physical object they collide with."
// And the parent issue's own shape: the finger paints into the dish — painting
// the wet field, laying scent and trails, pushing marks. This slice is the
// dish-side consumption of that input only: what a stroke DOES to the world
// once it arrives. The device side (MediaPipe tracking in the WebView, camera
// permission, the take's input-stream recording the issue's answered questions
// describe) is the shell's and Matt's proof, not this module's — the world is
// still gated and unpopulated, and the shell seam stays a seam: a door here, a
// suite proving it, no live wiring.
//
// THE HAND IS THE PERFORMER'S OWN — the hand does not go through the Queen's
// doors and it is not a persona request. The standing fields are the Queen's
// (cultureFields.mjs) and their table does not impersonate this writer: the
// user's own hand outranks personas, the override law KC-1 holds everywhere
// (a user change beats LOIS/DAVIS in real time). So the current lives in its
// own table, dealt only through the world's performer door
// (dealCultureHandCurrent), and the Queen's spec normalizer still refuses the
// 'current' kind by name — nothing half-deals the hand through her table, and
// nothing the hand does needs her resolution.
//
// A CURRENT IS A GESTURE, NOT A STANDING FIELD — it is dealt with a position,
// a flow (direction and speed in one vector: the stroke's own motion), a
// reach, a strength, and a SHORT LIFE, after which it retires itself. While
// it lives it travels: its centre advects with its flow each step, a gust
// moving through the dish the way the fingertip moved. Bodies in its reach
// gain velocity ALONG THE FLOW'S DIRECTION — a current they feel, not a pull
// toward a point — with the dish's standing force falloff, the gaussian
// exp(−(d/R)²) over the current's radius. The push is the flow's direction at
// every point in the reach (a stream, not a sink), so a body standing exactly
// on the centre is pushed like any other: no singularity, no special case.
// Strength is constant while the current lives and zero the step it retires —
// the gesture ends, the swarm's own damping settles what it stirred. The
// current is NOT gated on the medium's density: the magnet's gate is the
// ferro law (the field gathers where the medium stands); the hand stirs the
// bodies directly, which is what "stirs and scatters" says. Like every field,
// a current has no mass, no disc, no contacts; it never appears to the solver.
// It writes exactly one thing: velocity deltas on the body table, as a force.
//
// THE STEP — currents act on the swarm's cadence, inside the same world step
// as the standing fields, immediately BEFORE the swarm's integrator, and
// AFTER the Queen's fields in the force composition (standing forces first,
// the performer's own hand last among forces — closest to the integrator, the
// override's place). One current step per swarm step, counted in hand.step —
// floor(world.step / CULTURE_SWARM_STEP_DIVISOR), always. Within a step each
// living current, in dealt order: ages one step; if its age has passed its
// life it retires BEFORE pushing (a current dealt with life L pushes on
// exactly L steps); otherwise its centre advects by its flow, then it pushes
// from the new centre. Slots are REUSED once retired — a gesture leaves no
// record anyone resolves later, unlike a field index a take may name — so a
// long performance deals into the first retired slot and the table stays a
// gesture's size, not a performance's length. The deal order is a pure
// function of the table's state, so reuse costs no determinism.
//
// LAW — the hand is resolver-class, like the fields and the solver: CPU JS by
// the Full WebGL program's standing law, a pure function of world state,
// js-exact, and it stamps nothing of its own. The world's law composition is
// unchanged by this slice.
import { CULTURE_FIELD_MAGNET_RADIUS } from './cultureFields.mjs';

/**
 * Hand-current capacity: gestures in flight at once. A hand deals one stroke
 * at a time and a current lives half a second; 64 live gusts is already a
 * storm no single hand dealt.
 */
export const CULTURE_HAND_CAP = 64;
/**
 * A current's default reach, in body-space pixels: the standing field reach
 * (the magnet's radius at the dish's width) — a fingertip's stir is the same
 * size class as the dish's other forces.
 */
export const CULTURE_HAND_RADIUS = CULTURE_FIELD_MAGNET_RADIUS;
/**
 * A current's default strength: velocity gained per current step at falloff
 * 1, in body-space pixels per step. Brisker than a magnet's standing pull —
 * a stir is an act, not weather — and still under the swarm core's speed
 * clamp within a few steps, so the clamp stays the ceiling for hand-given
 * velocity exactly as it is for field-given velocity.
 */
export const CULTURE_HAND_STRENGTH = 0.5;
/**
 * A current's default life, in current steps (the swarm's cadence, 60/s):
 * 30 steps is half a second of dish time — a flick of the finger, dealt and
 * gone.
 */
export const CULTURE_HAND_LIFE_STEPS = 30;

/**
 * The hand-currents table: the performer's transient gusts, by slot. A slot
 * is dealt, lives, retires, and may be dealt again; `count` is the high-water
 * slot count, never a population. Columns parallel the fields table's shape
 * where the concepts match (position, strength, radius) and add the gesture's
 * own: the flow vector, the age, and the life it was dealt with.
 */
export function createCultureHandCurrents() {
  const cap = CULTURE_HAND_CAP;
  return {
    capacity: cap,
    /** Slots ever dealt (the high-water mark; retired slots below it may be re-dealt). */
    count: 0,
    /** Current steps run: floor(world.step / CULTURE_SWARM_STEP_DIVISOR), the swarm's cadence. */
    step: 0,
    active: new Uint8Array(cap),
    x: new Float32Array(cap),
    y: new Float32Array(cap),
    /** The flow: direction and speed in one vector, body-space pixels per current step. */
    vx: new Float32Array(cap),
    vy: new Float32Array(cap),
    strength: new Float32Array(cap),
    radius: new Float32Array(cap),
    /** Steps this dealing has lived (0 at the deal; the step that ages it past its life retires it). */
    age: new Uint32Array(cap),
    /** Steps this dealing pushes on, exactly. */
    life: new Uint32Array(cap),
  };
}

/**
 * Validate and normalize a hand-current spec — the one reading of a spec the
 * performer door shares with nobody (the Queen's doors have their own, and
 * refuse this kind). Defaults fill: radius, strength, and life the standing
 * constants above. Refusals are loud: a non-finite position; a non-finite or
 * ZERO flow (a current with no direction is not a current — it would be a
 * standing field wearing the hand's name, and standing fields are the
 * Queen's); a negative or non-finite strength; a non-positive radius; a life
 * that is not a positive whole number of steps.
 * Returns { x, y, vx, vy, strength, radius, lifeSteps }.
 */
export function normalizeCultureHandSpec(spec) {
  const s = spec || {};
  const { x, y, vx, vy } = s;
  if (!Number.isFinite(x) || !Number.isFinite(y))
    throw new Error(`cultureHand: bad current position "${String(x)}", "${String(y)}" — finite coordinates`);
  if (!Number.isFinite(vx) || !Number.isFinite(vy) || (vx === 0 && vy === 0))
    throw new Error(
      `cultureHand: bad current flow "${String(vx)}", "${String(vy)}" — a finite, non-zero flow vector (direction is the gesture)`,
    );
  const strength = s.strength === undefined ? CULTURE_HAND_STRENGTH : s.strength;
  if (!Number.isFinite(strength) || strength < 0)
    throw new Error(`cultureHand: bad current strength "${String(s.strength)}" — finite, zero or more`);
  const radius = s.radius === undefined ? CULTURE_HAND_RADIUS : s.radius;
  if (!Number.isFinite(radius) || radius <= 0)
    throw new Error(`cultureHand: bad current radius "${String(s.radius)}" — finite, greater than zero`);
  const lifeSteps = s.lifeSteps === undefined ? CULTURE_HAND_LIFE_STEPS : s.lifeSteps;
  if (!Number.isInteger(lifeSteps) || lifeSteps <= 0)
    throw new Error(`cultureHand: bad current life "${String(s.lifeSteps)}" — a positive whole number of steps`);
  return { x, y, vx, vy, strength, radius, lifeSteps };
}

/**
 * Write a normalized spec into a slot — the deal's one write, shared by the
 * fresh-slot and reuse paths so a re-dealt slot is indistinguishable from a
 * new one. The age restarts: a slot's second life is a new gesture.
 */
export function writeCultureHandCurrent(hand, i, s) {
  hand.active[i] = 1;
  hand.x[i] = s.x;
  hand.y[i] = s.y;
  hand.vx[i] = s.vx;
  hand.vy[i] = s.vy;
  hand.strength[i] = s.strength;
  hand.radius[i] = s.radius;
  hand.age[i] = 0;
  hand.life[i] = s.lifeSteps;
  if (i >= hand.count) hand.count = i + 1;
  return i;
}

/**
 * The slot a deal takes: the first retired slot, else the next fresh one,
 * else −1 (the table is full of living gestures — the door refuses loudly).
 * A pure function of the table's active flags, in ascending order: canonical,
 * like every iteration in this world.
 */
export function cultureHandDealSlot(hand) {
  for (let i = 0; i < hand.count; i++) if (!hand.active[i]) return i;
  return hand.count < hand.capacity ? hand.count : -1;
}

/**
 * One current step over a body table: every living current ages, retires if
 * its life is spent, otherwise travels with its flow and pushes the living
 * bodies in its reach along the flow's direction. Currents ascend by slot,
 * bodies by index — canonical order, plain IEEE-exact JS arithmetic: same
 * tables in, same table out, on any device. Advances hand.step by one (the
 * step counts even over an empty table — the kernel ran). Dead bodies feel
 * nothing. A zero-strength current still travels and retires on schedule: it
 * is a dealt gesture that happens to push nothing.
 */
export function stepCultureHandCurrents(bodies, hand) {
  const { count, alive, vx: bvx, vy: bvy } = bodies;
  for (let c = 0; c < hand.count; c++) {
    if (!hand.active[c]) continue;
    hand.age[c] += 1;
    if (hand.age[c] > hand.life[c]) {
      hand.active[c] = 0;
      continue;
    }
    const cvx = hand.vx[c];
    const cvy = hand.vy[c];
    hand.x[c] += cvx;
    hand.y[c] += cvy;
    const strength = hand.strength[c];
    if (!(strength > 0)) continue;
    const speed = Math.sqrt(cvx * cvx + cvy * cvy);
    const ux = cvx / speed;
    const uy = cvy / speed;
    const cx = hand.x[c];
    const cy = hand.y[c];
    const radius = hand.radius[c];
    const r2 = radius * radius;
    for (let i = 0; i < count; i++) {
      if (!alive[i]) continue;
      const dx = bodies.x[i] - cx;
      const dy = bodies.y[i] - cy;
      const d2 = dx * dx + dy * dy;
      const fall = Math.exp(-(d2 / r2));
      const a = strength * fall;
      bvx[i] += ux * a;
      bvy[i] += uy * a;
    }
  }
  hand.step += 1;
  return bodies;
}

const _f64 = new DataView(new ArrayBuffer(8));

/**
 * A canonical hash of the hand's standing state: the step count, the slot
 * high-water mark, and each dealt slot's active flag — plus, for a living
 * current, its full gesture (position, flow, strength, radius, age, life),
 * floats bit-exact. A retired slot contributes only its flag: its stale
 * numbers can steer nothing but a future deal's slot choice, which the flags
 * already decide, so two worlds whose hands differ only in a dead gesture's
 * residue are the same world. Same tables => same hash, on any device.
 * FNV-1a, the cultureFieldsHash discipline — the world hash folds this in
 * whole.
 */
export function cultureHandHash(hand) {
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
  mixU32(hand.step);
  mixU32(hand.count);
  for (let c = 0; c < hand.count; c++) {
    mix(hand.active[c]);
    if (!hand.active[c]) continue;
    mixFloat(hand.x[c]);
    mixFloat(hand.y[c]);
    mixFloat(hand.vx[c]);
    mixFloat(hand.vy[c]);
    mixFloat(hand.strength[c]);
    mixFloat(hand.radius[c]);
    mixU32(hand.age[c]);
    mixU32(hand.life[c]);
  }
  return h >>> 0;
}
