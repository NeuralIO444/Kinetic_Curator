// node src/engine/cultureSolver.selfcheck.mjs
// CULTURE Phase 2 — the solver and the collision shapes (the parent issue 1598):
// the solver born empty on the swarm's cadence with no stamp of its own; the
// parent issue's inherited parity law (no statics, no links => the swarm alone,
// bit for bit); hand-computed contact cases (head-on momentum, the zero-momentum
// unequal pair, a separating pair left alone); a resting clump settling with no
// velocity invented; kinetic energy never gained across solver-only steps; the
// one added shape — disc vs static AABB — at a face, a corner, and from inside;
// distance links holding a compound triangle together through world steps; the
// dealing doors' refusals; determinism under irregular feeds; and the caps.
import assert from 'node:assert/strict';
import {
  createCultureWorld,
  advanceCultureWorld,
  stepCultureWorld,
  cultureWorldHash,
  cultureWorldSimLaw,
  standingCultureWorld,
  addCultureStatic,
  addCultureLink,
  CULTURE_BODY_CAP,
  CULTURE_SWARM_STEP_DIVISOR,
} from './cultureWorld.mjs';
import {
  stepCultureSolver,
  createCultureStatics,
  createCultureLinks,
  CULTURE_SOLVER_RESTITUTION,
  CULTURE_SOLVER_ITERATIONS,
  CULTURE_STATICS_CAP,
  CULTURE_LINKS_CAP,
} from './cultureSolver.mjs';
import {
  stepCultureSwarm,
  cultureContactPairs,
  cultureSwarmHash,
  CULTURE_SWARM_WORLD_W,
  CULTURE_SWARM_WORLD_H,
} from './cultureSwarm.mjs';
import { hashU01, CH } from './kernel/rng.js';

let groups = 0;
const ok = (name) => {
  groups++;
  console.log(`  ok ${groups} — ${name}`);
};
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b} (tol ${tol})`);

/** A bare body table in the world's shape, for stepping the cores directly. */
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

/** Deal a deterministic test population into a world's table (the K3 suite's idiom). */
const deal = (world, n, seed = world.seed) => {
  const b = world.bodies;
  for (let i = 0; i < n; i++) {
    const u = (k) => hashU01(seed, CH.dyn, i * 16 + k);
    b.alive[i] = 1;
    b.x[i] = 60 + u(0) * (CULTURE_SWARM_WORLD_W - 120);
    b.y[i] = 60 + u(1) * (CULTURE_SWARM_WORLD_H - 120);
    b.vx[i] = (u(2) - 0.5) * 4;
    b.vy[i] = (u(3) - 0.5) * 4;
    b.mass[i] = 0.5 + u(4) * 1.5;
    b.radius[i] = 3 + u(5) * 6;
  }
  b.count = n;
  return world;
};

const noStatics = () => createCultureStatics();
const noLinks = () => createCultureLinks();
/** A statics table with boxes written directly (the world door is group 7's brief). */
const mkStatics = (boxes) => {
  const s = createCultureStatics();
  boxes.forEach((box, i) => {
    s.minX[i] = box.minX;
    s.minY[i] = box.minY;
    s.maxX[i] = box.maxX;
    s.maxY[i] = box.maxY;
  });
  s.count = boxes.length;
  return s;
};
/** A links table written directly. */
const mkLinks = (list) => {
  const l = createCultureLinks();
  list.forEach((link, i) => {
    l.a[i] = link.a;
    l.b[i] = link.b;
    l.rest[i] = link.rest;
  });
  l.count = list.length;
  return l;
};
const dist = (b, i, j) => Math.hypot(b.x[j] - b.x[i], b.y[j] - b.y[i]);
const kinetic = (b) => {
  let ke = 0;
  for (let i = 0; i < b.count; i++) if (b.alive[i]) ke += 0.5 * b.mass[i] * (b.vx[i] ** 2 + b.vy[i] ** 2);
  return ke;
};

// 1 — born empty, on the swarm's cadence, with no stamp of its own.
{
  const w = createCultureWorld({ seed: 5 });
  assert.equal(w.statics.count, 0, 'no scenery is born dealt');
  assert.equal(w.statics.capacity, CULTURE_STATICS_CAP);
  assert.equal(CULTURE_STATICS_CAP, 256);
  assert.equal(w.links.count, 0, 'no body is born linked');
  assert.equal(w.links.capacity, CULTURE_LINKS_CAP);
  assert.equal(CULTURE_LINKS_CAP, 4096);
  assert.equal(w.solver.step, 0);
  assert.equal(w.simLaw, 'js-exact', 'the solver adds no stamp: the world law is unchanged');
  assert.equal(cultureWorldSimLaw(w), 'js-exact');
  assert.equal(standingCultureWorld(), null, 'creating a world registers nothing anywhere');
  for (let r = 0; r < 40; r++) {
    advanceCultureWorld(w, 1 / 60);
    assert.equal(w.solver.step, Math.floor(w.step / CULTURE_SWARM_STEP_DIVISOR), 'one solver step per swarm step');
    assert.equal(w.solver.step, w.bodies.step, 'locked to the swarm cadence');
  }
  ok('born empty: no statics, no links, solver on the swarm cadence, no stamp of its own');
}

// 2 — the inherited parity law, restated for the world: the AABB machinery must
// not move the disc law. (a) A run with no contacts at all steps bit-identically
// to the swarm alone. (b) A population WITH contacts solves bit-identically
// whether the statics table is empty or holds scenery no body can reach.
{
  // (a) A spread grid: min distance 100, radii 8, and in 10 swarm steps no pair
  // can close the 30 px to even the widest force radius (70) — straight lines,
  // no forces, no contacts, by construction.
  const spread = (world) => {
    const b = world.bodies;
    let i = 0;
    for (let gy = 0; gy < 5; gy++) {
      for (let gx = 0; gx < 8; gx++, i++) {
        const u = (k) => hashU01(31, CH.dyn, i * 16 + k);
        b.alive[i] = 1;
        b.x[i] = 100 + gx * 100;
        b.y[i] = 100 + gy * 100;
        b.vx[i] = (u(2) - 0.5) * 2;
        b.vy[i] = (u(3) - 0.5) * 2;
        b.mass[i] = 1;
        b.radius[i] = 8;
      }
    }
    b.count = i;
    return world;
  };
  const w = spread(createCultureWorld({ seed: 31 }));
  const bare = mkBodies(
    Array.from({ length: w.bodies.count }, (_, i) => ({
      x: w.bodies.x[i],
      y: w.bodies.y[i],
      vx: w.bodies.vx[i],
      vy: w.bodies.vy[i],
      mass: 1,
      radius: 8,
    })),
  );
  for (let s = 0; s < 10; s++) {
    stepCultureWorld(w);
    stepCultureWorld(w);
    stepCultureSwarm(bare);
  }
  assert.equal(cultureContactPairs(w.bodies).length, 0, 'the construction holds: no contact ever formed');
  assert.equal(cultureSwarmHash(w.bodies), cultureSwarmHash(bare), 'the solver over no contacts changes nothing');
  assert.deepEqual(Array.from(w.bodies.x.subarray(0, 40)), Array.from(bare.x));

  // (b) The same dealt population, solved three ways: through the world (empty
  // statics), on a bare table with an empty statics table, and on a bare table
  // with a box dealt outside the wrap extent, where no body can ever reach it.
  const src = deal(createCultureWorld({ seed: 41 }), 40);
  const copy = () =>
    mkBodies(
      Array.from({ length: src.bodies.count }, (_, i) => ({
        x: src.bodies.x[i],
        y: src.bodies.y[i],
        vx: src.bodies.vx[i],
        vy: src.bodies.vy[i],
        mass: src.bodies.mass[i],
        radius: src.bodies.radius[i],
      })),
    );
  const t1 = copy();
  const t2 = copy();
  const far = mkStatics([{ minX: 3000, minY: 3000, maxX: 3100, maxY: 3100 }]);
  for (let s = 0; s < 15; s++) {
    stepCultureWorld(src);
    stepCultureWorld(src);
    stepCultureSwarm(t1);
    stepCultureSolver(t1, noStatics(), noLinks());
    stepCultureSwarm(t2);
    stepCultureSolver(t2, far, noLinks());
  }
  assert.equal(cultureSwarmHash(t1), cultureSwarmHash(t2), 'unreached scenery is inert, contacts and all');
  assert.equal(cultureSwarmHash(src.bodies), cultureSwarmHash(t1), 'the world path is the same composition');
  ok('parity: no contacts => the swarm alone; unreached statics => the disc law untouched, bit for bit');
}

// 3 — hand-computed contacts: momentum conserved, restitution 0, separating pairs left alone.
{
  assert.equal(CULTURE_SOLVER_RESTITUTION, 0);
  assert.ok(CULTURE_SOLVER_ITERATIONS >= 1);
  // Equal masses head-on: common velocity is the momentum mean, positions end exactly touching.
  {
    const b = mkBodies([
      { x: 100, y: 100, vx: 4, mass: 2, radius: 10 },
      { x: 115, y: 100, vx: 0, mass: 2, radius: 10 },
    ]);
    const p0 = 2 * 4 + 2 * 0;
    stepCultureSolver(b, noStatics(), noLinks());
    assert.equal(b.vx[0], 2, 'the striker slows to the shared velocity');
    assert.equal(b.vx[1], 2, 'the struck disc takes the shared velocity');
    assert.equal(2 * b.vx[0] + 2 * b.vx[1], p0, 'momentum conserved exactly');
    assert.equal(b.x[0], 97.5, 'the overlap splits by inverse mass — equal masses, equal shares');
    assert.equal(b.x[1], 117.5);
    assert.equal(dist(b, 0, 1), 20, 'the pair ends exactly touching');
  }
  // Unequal masses, zero total momentum: both stop.
  {
    const b = mkBodies([
      { x: 100, y: 100, vx: 3, mass: 1, radius: 10 },
      { x: 118, y: 100, vx: -1, mass: 3, radius: 10 },
    ]);
    stepCultureSolver(b, noStatics(), noLinks());
    near(b.vx[0], 0, 1e-6, 'the light disc stops');
    near(b.vx[1], 0, 1e-6, 'the heavy disc stops');
    near(1 * b.vx[0] + 3 * b.vx[1], 0, 1e-5, 'momentum stays zero');
  }
  // A separating pair takes no impulse (but is still depenetrated).
  {
    const b = mkBodies([
      { x: 100, y: 100, vx: -2, mass: 1, radius: 10 },
      { x: 115, y: 100, vx: 0, mass: 1, radius: 10 },
    ]);
    stepCultureSolver(b, noStatics(), noLinks());
    assert.equal(b.vx[0], -2, 'no impulse while separating');
    assert.equal(b.vx[1], 0);
    assert.equal(dist(b, 0, 1), 20, 'projection still separates the pair');
  }
  ok('hand cases: head-on momentum, zero-momentum stop, separating pair un-impulsed');
}

// 4 — a resting clump settles: overlaps drain, no velocity is invented.
{
  const b = mkBodies([
    { x: 500, y: 500, radius: 14 },
    { x: 512, y: 500, radius: 14 },
    { x: 506, y: 510, radius: 14 },
    { x: 494, y: 510, radius: 14 },
    { x: 488, y: 500, radius: 14 },
    { x: 506, y: 490, radius: 14 },
  ]);
  const s = noStatics();
  const l = noLinks();
  for (let step = 0; step < 80; step++) stepCultureSolver(b, s, l);
  for (let i = 0; i < b.count; i++) {
    assert.equal(b.vx[i], 0, 'projection never invents velocity');
    assert.equal(b.vy[i], 0);
    assert.ok(Number.isFinite(b.x[i]) && Number.isFinite(b.y[i]));
  }
  let maxOverlap = 0;
  for (let i = 0; i < b.count; i++)
    for (let j = i + 1; j < b.count; j++) maxOverlap = Math.max(maxOverlap, b.radius[i] + b.radius[j] - dist(b, i, j));
  assert.ok(maxOverlap < 1e-3, `the clump settles to touching (max overlap ${maxOverlap})`);
  assert.ok(
    cultureContactPairs(b).every((p) => p.overlap < 1e-3),
    'any pair the detector still reports is within the same tolerance (float32 columns cannot hold exact touching)',
  );

  // Exactly touching at rest is a fixed point, bit for bit.
  const t = mkBodies([
    { x: 100, y: 100, radius: 10 },
    { x: 120, y: 100, radius: 10 },
  ]);
  stepCultureSolver(t, noStatics(), noLinks());
  assert.deepEqual([t.x[0], t.x[1], t.vx[0], t.vx[1]], [100, 120, 0, 0]);
  ok('resting clump: overlaps drain to zero, velocities stay exactly zero');
}

// 5 — energy: solver-only steps never gain kinetic energy.
{
  const list = [];
  for (let i = 0; i < 120; i++) {
    const u = (k) => hashU01(97, CH.dyn, i * 16 + k);
    list.push({
      x: 200 + u(0) * 600,
      y: 200 + u(1) * 600,
      vx: (u(2) - 0.5) * 8,
      vy: (u(3) - 0.5) * 8,
      mass: 0.5 + u(4) * 1.5,
      radius: 4 + u(5) * 6,
    });
  }
  const b = mkBodies(list);
  const s = noStatics();
  const l = noLinks();
  const ke0 = kinetic(b);
  assert.ok(ke0 > 0);
  for (let step = 0; step < 120; step++) {
    stepCultureSolver(b, s, l);
    const ke = kinetic(b);
    assert.ok(Number.isFinite(ke), 'energy stays finite');
    assert.ok(ke <= ke0 * (1 + 1e-6) + 1e-9, `step ${step}: KE ${ke} never exceeds the dealt KE ${ke0}`);
    for (let i = 0; i < b.count; i++)
      assert.ok(Math.hypot(b.vx[i], b.vy[i]) <= 8 + 1e-6, 'and no body ever beats the core speed clamp');
  }
  // The clamp itself, directly: an over-speed body leaves the step at exactly
  // the ceiling, direction preserved (the K3 parity population measured raw
  // sequential impulses compounding to 8.014 without it).
  const fast = mkBodies([{ x: 100, y: 100, vx: 6, vy: 8 }]);
  stepCultureSolver(fast, noStatics(), noLinks());
  near(Math.hypot(fast.vx[0], fast.vy[0]), 8, 1e-6, 'clamped to the ceiling');
  near(fast.vx[0] / fast.vy[0], 6 / 8, 1e-6, 'direction preserved');
  ok('energy: 120 solver-only steps, kinetic energy never gained, the speed clamp holds');
}

// 6 — the one added shape: disc vs static AABB (face, tangential slide, corner, inside, receding).
{
  const box = { minX: 100, minY: 80, maxX: 140, maxY: 120 };
  // Face approach: inward normal velocity cancelled, tangential untouched, pushed exactly out.
  {
    const b = mkBodies([{ x: 95, y: 100, vx: 3, vy: 2, radius: 10 }]);
    stepCultureSolver(b, mkStatics([box]), noLinks());
    assert.equal(b.vx[0], 0, 'the inward normal component is cancelled');
    assert.equal(b.vy[0], 2, 'the tangential component is untouched');
    assert.equal(b.x[0], 90, 'the disc ends exactly its radius from the face');
    assert.equal(b.y[0], 100);
  }
  // Receding from the face: no impulse, but the overlap is still projected out.
  {
    const b = mkBodies([{ x: 95, y: 100, vx: -3, radius: 10 }]);
    stepCultureSolver(b, mkStatics([box]), noLinks());
    assert.equal(b.vx[0], -3);
    assert.equal(b.x[0], 90);
  }
  // Corner: pushed out along the corner diagonal to exactly its radius from the corner.
  {
    const b = mkBodies([{ x: 94, y: 74, radius: 10 }]);
    const s = mkStatics([box]);
    for (let step = 0; step < 10; step++) stepCultureSolver(b, s, noLinks());
    const d = Math.hypot(b.x[0] - 100, b.y[0] - 80);
    assert.ok(d >= 10 - 1e-3, `the disc rests its radius from the corner (d ${d})`);
    assert.ok(b.x[0] < 94 && b.y[0] < 74, 'it left along the diagonal, not through the box');
  }
  // Centre inside: exits through the nearest face (the tie resolves to minX, canonically).
  {
    const b = mkBodies([{ x: 120, y: 100, radius: 10 }]);
    const s = mkStatics([box]);
    stepCultureSolver(b, s, noLinks());
    assert.equal(b.x[0], 90, 'out through the minX face to exactly its radius');
    stepCultureSolver(b, s, noLinks());
    assert.equal(b.x[0], 90, 'and it stays out');
  }
  // Exactly resting against the face is a fixed point.
  {
    const b = mkBodies([{ x: 90, y: 100, radius: 10 }]);
    stepCultureSolver(b, mkStatics([box]), noLinks());
    assert.deepEqual([b.x[0], b.y[0], b.vx[0]], [90, 100, 0]);
  }
  ok('disc vs AABB: face stop, tangential slide kept, corner exit, inside exit, resting fixed point');
}

// 7 — links: distance joints hold a compound shape; the dealing doors refuse loudly.
{
  // Stretched and compressed pairs both come to rest length, centroid unmoved (equal masses).
  for (const [d0, label] of [
    [30, 'stretched'],
    [10, 'compressed'],
  ]) {
    const b = mkBodies([
      { x: 100, y: 100 },
      { x: 100 + d0, y: 100 },
    ]);
    const l = mkLinks([{ a: 0, b: 1, rest: 20 }]);
    for (let step = 0; step < 40; step++) stepCultureSolver(b, noStatics(), l);
    near(dist(b, 0, 1), 20, 1e-3, `the ${label} link comes to rest length`);
    near((b.x[0] + b.x[1]) / 2, 100 + d0 / 2, 1e-3, 'the centroid is unmoved');
    assert.deepEqual([b.vx[0], b.vx[1]], [0, 0], 'projection invents no velocity');
  }
  // A linked triangle through world steps: the joints hold while the swarm moves it.
  {
    const w = createCultureWorld({ seed: 17 });
    const b = w.bodies;
    const pts = [
      [900, 500],
      [940, 500],
      [920, 535],
    ];
    pts.forEach(([px, py], i) => {
      b.alive[i] = 1;
      b.x[i] = px;
      b.y[i] = py;
      b.mass[i] = 1;
      b.radius[i] = 6;
    });
    b.count = 3;
    const rests = [dist(b, 0, 1), dist(b, 1, 2), dist(b, 0, 2)];
    assert.equal(addCultureLink(w, 0, 1), 0);
    assert.equal(addCultureLink(w, 1, 2), 1);
    assert.equal(addCultureLink(w, 0, 2), 2);
    assert.deepEqual(
      [w.links.rest[0], w.links.rest[1], w.links.rest[2]],
      rests.map((r) => Math.fround(r)),
      'a link dealt without a rest holds the dealt distance',
    );
    b.vx[0] = 3;
    for (let r = 0; r < 72; r++) advanceCultureWorld(w, 1 / 60);
    assert.equal(w.solver.step, 72);
    [dist(b, 0, 1), dist(b, 1, 2), dist(b, 0, 2)].forEach((d, i) =>
      near(d, rests[i], rests[i] * 0.05, `link ${i} holds through the shove`),
    );
    assert.ok([b.x[0], b.y[0], b.x[1], b.y[1], b.x[2], b.y[2]].every(Number.isFinite));
  }
  // The doors refuse: bad boxes, bad endpoints, bad rests.
  {
    const w = deal(createCultureWorld({ seed: 3 }), 4);
    assert.throws(() => addCultureStatic(w, { minX: 50, minY: 0, maxX: 40, maxY: 10 }), /bad static box/);
    assert.throws(() => addCultureStatic(w, { minX: 0, minY: 0, maxX: NaN, maxY: 10 }), /bad static box/);
    assert.throws(() => addCultureStatic(w, null), /bad static box/);
    assert.throws(() => addCultureLink(w, 1, 1), /bad link endpoints/);
    assert.throws(() => addCultureLink(w, 0, 4), /bad link endpoints/, 'an endpoint past the dealt population');
    assert.throws(() => addCultureLink(w, -1, 2), /bad link endpoints/);
    assert.throws(() => addCultureLink(w, 0, 1, -5), /bad link rest/);
    assert.throws(() => addCultureLink(w, 0, 1, NaN), /bad link rest/);
    assert.equal(w.statics.count, 0, 'refusals deal nothing');
    assert.equal(w.links.count, 0);
  }
  ok('links: stretch and compression settle, a jointed triangle holds, the doors refuse');
}

// 8 — determinism: same seed, same deal, same irregular feed => the identical world.
{
  const build = () => {
    const w = deal(createCultureWorld({ seed: 77 }), 50);
    addCultureStatic(w, { minX: 700, minY: 400, maxX: 760, maxY: 460 });
    addCultureStatic(w, { minX: 200, minY: 800, maxX: 320, maxY: 830 });
    addCultureLink(w, 0, 1);
    addCultureLink(w, 5, 9, 45);
    addCultureLink(w, 12, 30);
    return w;
  };
  const feeds = [0.007, 1 / 60, 0.033, 0.0025, 0.05, 1 / 45, 0.011];
  const run = (w) => {
    for (let r = 0; r < 90; r++) advanceCultureWorld(w, feeds[r % feeds.length]);
    return w;
  };
  const a = run(build());
  const b = run(build());
  assert.equal(a.solver.step, b.solver.step);
  assert.equal(cultureWorldHash(a), cultureWorldHash(b), 'statics and links inside, the hash is bit-identical');
  const c = build();
  c.statics.minX[0] += 1; // one box, one pixel over: a different world
  run(c);
  assert.notEqual(cultureWorldHash(c), cultureWorldHash(a), 'the hash covers the scenery');
  ok('determinism: irregular feeds land bit-identical, statics and links inside the hash');
}

// 9 — the caps: statics and links fill and refuse; the full body table solves finite.
{
  const w = createCultureWorld({ seed: 23 });
  for (let i = 0; i < CULTURE_STATICS_CAP; i++) addCultureStatic(w, { minX: i, minY: 0, maxX: i + 1, maxY: 1 });
  assert.equal(w.statics.count, CULTURE_STATICS_CAP);
  assert.throws(() => addCultureStatic(w, { minX: 0, minY: 0, maxX: 1, maxY: 1 }), /statics table full/);

  const w2 = deal(createCultureWorld({ seed: 29 }), CULTURE_BODY_CAP);
  for (let i = 0; i < CULTURE_LINKS_CAP; i++) addCultureLink(w2, i % CULTURE_BODY_CAP, (i + 1) % CULTURE_BODY_CAP, 25);
  assert.equal(w2.links.count, CULTURE_LINKS_CAP);
  assert.throws(() => addCultureLink(w2, 0, 1, 25), /links table full/);

  stepCultureWorld(w2);
  stepCultureWorld(w2);
  assert.equal(w2.solver.step, 1, 'the solver steps the full table');
  let finite = true;
  for (let i = 0; i < w2.bodies.count; i++) {
    if (![w2.bodies.x[i], w2.bodies.y[i], w2.bodies.vx[i], w2.bodies.vy[i]].every(Number.isFinite)) finite = false;
  }
  assert.ok(finite, 'no NaN over the full 2,048-body table with links dealt');
  ok('caps: statics 256 and links 4,096 fill and refuse; the full table solves finite');
}

console.log(`cultureSolver.selfcheck: OK (${groups} groups) — CULTURE Phase 2, the solver and collision shapes`);
