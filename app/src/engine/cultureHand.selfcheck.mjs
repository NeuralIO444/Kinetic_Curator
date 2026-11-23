// node src/engine/cultureHand.selfcheck.mjs
// CULTURE Phase 3, slice B — the performer's hand as a current (the parent issue
// 2153, dish-side consumption): the hand's table born empty and an empty table a
// bit-exact no-op; the performer door (NOT the Queen's doors — her spec reading
// still refuses the 'current' kind by name — and NOT a request: a dealt current
// acts at once, no resolution); the push law hand-computed (along the flow's
// direction at every point in the reach, the dish's gaussian falloff, a body on
// the centre pushed like any other, the dead untouched); travel (the centre
// advects with the flow); the short life and self-retirement (pushes on exactly
// its dealt life of steps, then inert, its slot re-dealable); never a body (no
// contacts, positions untouched — velocity is all it writes); the swarm's
// cadence; determinism with the hand inside the world hash; and the doors'
// refusals + the living-gesture cap.
import assert from 'node:assert/strict';
import {
  createCultureWorld,
  advanceCultureWorld,
  stepCultureWorld,
  cultureWorldHash,
  cultureWorldSimLaw,
  standingCultureWorld,
  dealCultureHandCurrent,
  dealCultureField,
  requestCultureField,
  CULTURE_SWARM_STEP_DIVISOR,
} from './cultureWorld.mjs';
import {
  createCultureHandCurrents,
  stepCultureHandCurrents,
  normalizeCultureHandSpec,
  writeCultureHandCurrent,
  CULTURE_HAND_CAP,
  CULTURE_HAND_RADIUS,
  CULTURE_HAND_STRENGTH,
  CULTURE_HAND_LIFE_STEPS,
} from './cultureHand.mjs';
import { normalizeCultureFieldSpec } from './cultureFields.mjs';
import { cultureContactPairs } from './cultureSwarm.mjs';

let groups = 0;
const ok = (name) => {
  groups++;
  console.log(`  ok ${groups} — ${name}`);
};
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b} (tol ${tol})`);

/** A bare body table in the world's shape, for stepping the core directly. */
const mkBodies = (list) => {
  const cap = Math.max(1, list.length);
  const b = {
    capacity: cap,
    count: list.length,
    step: 0,
    alive: new Uint8Array(cap),
    x: new Float32Array(cap),
    y: new Float32Array(cap),
    vx: new Float32Array(cap),
    vy: new Float32Array(cap),
    mass: new Float32Array(cap).fill(1),
    radius: new Float32Array(cap),
  };
  list.forEach((p, i) => {
    b.alive[i] = p.alive === false ? 0 : 1;
    b.x[i] = p.x;
    b.y[i] = p.y;
    b.vx[i] = p.vx || 0;
    b.vy[i] = p.vy || 0;
    b.mass[i] = p.mass ?? 1;
    b.radius[i] = p.radius || 0;
  });
  return b;
};

/** A hand table with currents written through the module's own deal write. */
const mkHand = (specs) => {
  const hand = createCultureHandCurrents();
  specs.forEach((spec, i) => writeCultureHandCurrent(hand, i, normalizeCultureHandSpec(spec)));
  return hand;
};

/** Deal one resting body into a world at (x, y) as body 0. */
const dealBody = (world, x, y) => {
  const b = world.bodies;
  b.alive[0] = 1;
  b.x[0] = x;
  b.y[0] = y;
  b.mass[0] = 1;
  b.radius[0] = 8;
  b.count = 1;
  return world;
};

// 1 — born empty; the empty table is a bit-exact no-op and stamps nothing.
{
  const w = createCultureWorld({ seed: 7 });
  assert.equal(w.hand.count, 0, 'no current is born');
  assert.equal(w.hand.step, 0);
  assert.equal(cultureWorldSimLaw(w), 'js-exact', 'the hand stamps nothing of its own');

  const bodies = mkBodies([
    { x: 100, y: 100, vx: 1.5, vy: -2 },
    { x: 900, y: 500, vx: 0, vy: 3 },
  ]);
  const before = [...bodies.vx, ...bodies.vy];
  stepCultureHandCurrents(bodies, createCultureHandCurrents());
  assert.deepEqual([...bodies.vx, ...bodies.vy], before, 'an empty hand moves nothing, bit for bit');
  ok('born empty: no currents, no stamp, an empty step is a bit-exact no-op');
}

// 2 — the push law, hand-computed: along the flow, gaussian falloff, from the travelled centre.
{
  // Flow (3, 4): speed 5, unit (0.6, 0.8). Strength 0.5, radius 100, dealt at (100, 100).
  // After one step the centre has advected to (103, 104) and pushes from there.
  const bodies = mkBodies([
    { x: 103, y: 104 }, // on the travelled centre: falloff 1
    { x: 203, y: 104 }, // one radius east of it: falloff exp(−1)
    { x: 103, y: 104, alive: false }, // dead: untouched
    { x: 1103, y: 104 }, // ten radii out: exp(−100) ≈ nothing
  ]);
  const hand = mkHand([{ x: 100, y: 100, vx: 3, vy: 4, strength: 0.5, radius: 100, lifeSteps: 10 }]);
  stepCultureHandCurrents(bodies, hand);
  near(bodies.vx[0], 0.3, 1e-6, 'centre body gains strength × unit flow (x)');
  near(bodies.vy[0], 0.4, 1e-6, 'centre body gains strength × unit flow (y)');
  const e = 0.5 * Math.exp(-1);
  near(bodies.vx[1], e * 0.6, 1e-6, 'one radius out: the gaussian falloff, along the flow (x)');
  near(bodies.vy[1], e * 0.8, 1e-6, 'one radius out: the gaussian falloff, along the flow (y)');
  near(bodies.vx[1] * 0.8 - bodies.vy[1] * 0.6, 0, 1e-7, 'the push is parallel to the flow, never radial');
  assert.equal(bodies.vx[2], 0, 'a dead body feels nothing');
  assert.equal(bodies.vy[2], 0);
  assert.ok(Math.abs(bodies.vx[3]) < 1e-40, 'ten radii out the current has effectively let go');
  assert.equal(hand.x[0], 103, 'the centre travelled with the flow (x)');
  assert.equal(hand.y[0], 104, 'the centre travelled with the flow (y)');
  ok('the push law: along the flow from the travelled centre, gaussian falloff, the dead untouched');
}

// 3 — the short life: pushes on exactly its dealt life of steps, retires itself, slot re-deals.
{
  const bodies = mkBodies([{ x: 500, y: 500 }]);
  const hand = mkHand([{ x: 500, y: 500, vx: 0.001, vy: 0, strength: 0.5, radius: 100, lifeSteps: 3 }]);
  const gains = [];
  let prev = 0;
  for (let s = 0; s < 5; s++) {
    stepCultureHandCurrents(bodies, hand);
    gains.push(bodies.vx[0] - prev);
    prev = bodies.vx[0];
  }
  near(gains[0], 0.5, 1e-6, 'step 1 pushes');
  near(gains[1], 0.5, 1e-6, 'step 2 pushes');
  near(gains[2], 0.5, 1e-6, 'step 3 pushes — the last of its life');
  assert.equal(gains[3], 0, 'step 4: retired, exactly nothing');
  assert.equal(gains[4], 0, 'and it stays retired');
  assert.equal(hand.active[0], 0, 'the current retired itself');

  const w = createCultureWorld({ seed: 11 });
  const first = dealCultureHandCurrent(w, { x: 10, y: 10, vx: 1, vy: 0, lifeSteps: 1 });
  assert.equal(first, 0);
  for (let i = 0; i < 2 * CULTURE_SWARM_STEP_DIVISOR; i++) stepCultureWorld(w);
  assert.equal(w.hand.active[0], 0, 'the world-stepped current spent its one-step life');
  const second = dealCultureHandCurrent(w, { x: 20, y: 20, vx: 0, vy: 1 });
  assert.equal(second, 0, 'a retired slot is re-dealt — gestures do not accumulate');
  const third = dealCultureHandCurrent(w, { x: 30, y: 30, vx: 1, vy: 1 });
  assert.equal(third, 1, 'a second living gesture takes the next slot');
  ok('the short life: exactly its dealt steps of push, self-retirement, slot reuse');
}

// 4 — the performer door: defaults filled, refusals loud, the living cap enforced.
{
  const w = createCultureWorld({ seed: 3 });
  const i = dealCultureHandCurrent(w, { x: 100, y: 200, vx: 2, vy: -1 });
  near(w.hand.radius[i], CULTURE_HAND_RADIUS, 1e-4, 'radius defaults to the standing reach (float32 column)');
  assert.equal(w.hand.strength[i], CULTURE_HAND_STRENGTH, 'strength defaults to the standing stir');
  assert.equal(w.hand.life[i], CULTURE_HAND_LIFE_STEPS, 'life defaults to the standing gesture');
  assert.equal(w.hand.age[i], 0, 'a dealt current is newborn');

  assert.throws(
    () => dealCultureHandCurrent(w, { x: 0, y: 0, vx: 0, vy: 0 }),
    /non-zero flow/,
    'no direction, no current',
  );
  assert.throws(() => dealCultureHandCurrent(w, { x: NaN, y: 0, vx: 1, vy: 0 }), /finite coordinates/);
  assert.throws(() => dealCultureHandCurrent(w, { x: 0, y: 0, vx: 1, vy: 0, strength: -1 }), /zero or more/);
  assert.throws(() => dealCultureHandCurrent(w, { x: 0, y: 0, vx: 1, vy: 0, radius: 0 }), /greater than zero/);
  assert.throws(() => dealCultureHandCurrent(w, { x: 0, y: 0, vx: 1, vy: 0, lifeSteps: 1.5 }), /whole number/);
  assert.throws(() => dealCultureHandCurrent(w, { x: 0, y: 0, vx: 1, vy: 0, lifeSteps: 0 }), /whole number/);
  assert.equal(w.hand.count, 1, 'a refused deal writes nothing');

  const full = createCultureWorld({ seed: 3 });
  for (let k = 0; k < CULTURE_HAND_CAP; k++)
    dealCultureHandCurrent(full, { x: k, y: k, vx: 1, vy: 0, lifeSteps: 1000 });
  assert.throws(
    () => dealCultureHandCurrent(full, { x: 0, y: 0, vx: 1, vy: 0 }),
    /hand currents full/,
    'the living cap refuses',
  );
  ok('the performer door: defaults, loud refusals, the living-gesture cap');
}

// 5 — not the Queen's, not a request: the hand's door is its own, and it acts at once.
{
  assert.throws(
    () => normalizeCultureFieldSpec({ kind: 'current', x: 0, y: 0 }),
    /unknown field kind/,
    'the Queen’s spec reading still refuses the current kind by name',
  );
  const w = createCultureWorld({ seed: 5 });
  assert.throws(
    () => dealCultureField(w, { kind: 'current', x: 0, y: 0 }),
    /unknown field kind/,
    'her deal door refuses it',
  );
  assert.throws(
    () => requestCultureField(w, { kind: 'current', x: 0, y: 0 }),
    /unknown field kind/,
    'the request log refuses it',
  );

  dealBody(w, 500, 500);
  const req = requestCultureField(w, { kind: 'magnet', x: 500, y: 500 });
  assert.equal(req, 0, 'a persona request stands pending');
  dealCultureHandCurrent(w, { x: 500, y: 500, vx: 4, vy: 0, strength: 0.5, radius: 100, lifeSteps: 5 });
  assert.equal(w.fields.count, 0, 'the hand dealt no field');
  assert.equal(w.fieldRequests.count, 1, 'and logged no request — the pending one is the persona’s alone');
  stepCultureWorld(w);
  stepCultureWorld(w);
  assert.ok(w.bodies.vx[0] > 0, 'the hand’s current pushed at once — no Queen resolution waited for');
  ok('the hand’s own door: refused by the Queen’s doors, acts without resolution');
}

// 6 — never a body: velocity is all it writes; no contacts, no solver presence.
{
  const bodies = mkBodies([
    { x: 400, y: 400, radius: 30 },
    { x: 430, y: 400, radius: 30 }, // overlapping discs: exactly one pair, bodies only
  ]);
  const hand = mkHand([{ x: 415, y: 400, vx: 2, vy: 0, strength: 0.5, radius: 200, lifeSteps: 5 }]);
  const posBefore = [...bodies.x, ...bodies.y];
  stepCultureHandCurrents(bodies, hand);
  assert.deepEqual([...bodies.x, ...bodies.y], posBefore, 'a hand step moves no position — force, not contact');
  const pairs = cultureContactPairs(bodies);
  assert.equal(pairs.length, 1, 'the contact dealer sees the one disc pair and nothing of the hand');
  assert.deepEqual([pairs[0].a, pairs[0].b], [0, 1]);
  ok('never a body: positions untouched, no contact presence');
}

// 7 — the world composition: cadence, the push spent through the integrator, determinism.
{
  const w = createCultureWorld({ seed: 21 });
  dealBody(w, 960, 540);
  dealCultureHandCurrent(w, { x: 960, y: 540, vx: 5, vy: 0, strength: 0.5, radius: 200, lifeSteps: 30 });
  stepCultureWorld(w);
  assert.equal(w.hand.step, 0, 'an odd world step runs no current step');
  assert.equal(w.bodies.vx[0], 0, 'and pushes nothing');
  stepCultureWorld(w);
  assert.equal(w.hand.step, 1, 'the swarm cadence: one current step per swarm step');
  const drift = (w.bodies.x[0] - 960) * 5 + (w.bodies.y[0] - 540) * 0;
  assert.ok(drift > 0, 'the integrator spent the hand’s push along the flow');

  const run = (seed) => {
    const x = createCultureWorld({ seed });
    dealBody(x, 300, 300);
    dealCultureHandCurrent(x, { x: 300, y: 300, vx: 3, vy: 2, lifeSteps: 12 });
    for (let i = 0; i < 50; i++) advanceCultureWorld(x, 1 / 60);
    return x;
  };
  const a = run(21);
  const b = run(21);
  assert.equal(
    cultureWorldHash(a),
    cultureWorldHash(b),
    'same deals, same feeds: bit-identical, the hand inside the hash',
  );
  const c = createCultureWorld({ seed: 21 });
  dealBody(c, 300, 300);
  for (let i = 0; i < 50; i++) advanceCultureWorld(c, 1 / 60);
  assert.notEqual(cultureWorldHash(a), cultureWorldHash(c), 'a world the hand stirred is a different world');
  assert.equal(
    a.hand.step,
    Math.floor(a.step / CULTURE_SWARM_STEP_DIVISOR),
    'hand steps are a pure function of world steps',
  );
  ok('world composition: the swarm’s cadence, the push integrated, determinism with the hand hashed in');
}

// 8 — gate-off inertness: no world stands, so no hand exists anywhere.
{
  assert.equal(standingCultureWorld(), null, 'no standing world in this process: no hand anywhere');
  const w = createCultureWorld({ seed: 1 });
  assert.equal(standingCultureWorld(), null, 'creating a world registers nothing — the shell owns standing');
  assert.ok(w.hand, 'the hand is a part of a world instance, never a module-level singleton');
  ok('gate-off inertness: the hand exists only as a created world’s table');
}

console.log(`cultureHand.selfcheck: OK (${groups} groups) — CULTURE Phase 3B, the performer's hand as a current`);
