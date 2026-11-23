// node src/engine/cultureSwarm.selfcheck.mjs
// CULTURE Phase 1, slice K3 (the parent issue 2188) — the swarm/contacts kernel in the
// culture world: the stamp door and its law composition, the cadence (one swarm step
// per two world steps), step-consumption determinism on the JS path (irregular feeds,
// bit-identical), hand-computed one-step cases against the reference core, the 2,048
// cap behaviour of the world's table, the contact detection predicate (hand cases),
// and its agreement with the shipped detector's oracle over a two-stratum split of
// the same table. The GPU side is parity/cultureSwarmSim.selfcheck's brief.
import assert from 'node:assert/strict';
import {
  createCultureWorld,
  advanceCultureWorld,
  stepCultureWorld,
  cultureWorldHash,
  cultureWorldSimLaw,
  setCultureFluidBackend,
  setCultureLifeBackend,
  setCultureSwarmBackend,
  CULTURE_BODY_CAP,
  CULTURE_SWARM_STEP_DIVISOR,
  CULTURE_SWARM_BACKEND,
  CULTURE_SWARM_GPU_BACKEND,
} from './cultureWorld.mjs';
import {
  stepCultureSwarm,
  cultureContactPairs,
  cultureSwarmHash,
  CULTURE_SWARM_PARAMS,
  CULTURE_SWARM_WORLD_W,
  CULTURE_SWARM_WORLD_H,
} from './cultureSwarm.mjs';
import { packContactBodies, referenceContacts } from '../gl/dishContactsGpu.mjs';
import { hashU01, CH } from './kernel/rng.js';
import { KNOWN_SIM_BACKENDS } from './kernel/simBackends.js';

let groups = 0;
const ok = (name) => {
  groups++;
  console.log(`  ok ${groups} — ${name}`);
};

/** Deal a deterministic test population into a world's table (Phase 5 owns real dealing; suites deal fixtures). */
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

/** A bare table in the world's shape, for stepping the core directly. */
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

// 1 — the stamp door: born JS, the only door, the composed law.
{
  const w = createCultureWorld({ seed: 5 });
  assert.equal(w.swarmBackend, CULTURE_SWARM_BACKEND);
  assert.equal(w.swarmBackend, 'js.swarm.v1');
  assert.ok(KNOWN_SIM_BACKENDS.swarm.includes(w.swarmBackend));
  assert.equal(w.simLaw, 'js-exact');
  setCultureSwarmBackend(w, CULTURE_SWARM_GPU_BACKEND);
  assert.equal(w.swarmBackend, 'gpu.swarm.v1');
  assert.equal(w.simLaw, 'decisions-exact', 'a GPU swarm makes the world decisions-exact in the same motion');
  assert.equal(w.simLaw, cultureWorldSimLaw(w), 'the stamped law is the composed law');
  setCultureSwarmBackend(w, 'js.swarm.v1');
  assert.equal(w.simLaw, 'js-exact', 'handing the swarm back to JS restores js-exact');
  // composition across all three doors: any one GPU kernel flips the law, all JS restores it
  setCultureFluidBackend(w, 'gpu.gs.v1');
  assert.equal(w.simLaw, 'decisions-exact');
  setCultureFluidBackend(w, 'js.gs.v1');
  setCultureLifeBackend(w, 'gpu.life.v1');
  assert.equal(w.simLaw, 'decisions-exact');
  setCultureLifeBackend(w, 'js.life.v1');
  assert.equal(w.simLaw, 'js-exact');
  // refused ids leave the stamp untouched — including the contacts kernel's own ids
  for (const bad of ['gpu.contacts.v1', 'js.contacts.v1', 'js.gs.v1', 'gpu.life.v1', 'swarm', '', undefined, null]) {
    assert.throws(() => setCultureSwarmBackend(w, bad), /unknown swarm backend/);
    assert.equal(w.swarmBackend, 'js.swarm.v1');
    assert.equal(w.simLaw, 'js-exact');
  }
  ok('the stamp door: js.swarm.v1 at birth, gpu.swarm.v1 flips the composed law, foreign ids refused');
}

// 2 — cadence: the swarm step count is floor(world.step / divisor) at every feed boundary.
{
  const w = deal(createCultureWorld({ seed: 9 }), 40);
  const feeds = [1 / 60, 0.004, 0.021, 1 / 30, 0.0009, 0.05, 1 / 60, 0.013];
  for (let r = 0; r < 75; r++) {
    advanceCultureWorld(w, feeds[r % feeds.length]);
    assert.equal(
      w.bodies.step,
      Math.floor(w.step / CULTURE_SWARM_STEP_DIVISOR),
      'swarm steps are a pure function of world steps',
    );
    assert.equal(w.fluid.step, Math.floor(w.step / 2), 'the fluid cadence is undisturbed');
    assert.equal(w.life.gen, Math.floor(w.step / 15), 'the culture cadence is undisturbed');
  }
  ok('cadence: bodies.step == floor(world.step / 2) across irregular feeds, neighbours undisturbed');
}

// 3 — determinism: same seed, same deal, same irregular feed => bit-identical tables and hashes.
{
  const feeds = [0.007, 1 / 60, 0.033, 0.0025, 0.05, 1 / 45, 0.011];
  const run = () => {
    const w = deal(createCultureWorld({ seed: 42 }), 60);
    for (let r = 0; r < 90; r++) advanceCultureWorld(w, feeds[r % feeds.length]);
    return w;
  };
  const a = run();
  const b = run();
  assert.equal(a.bodies.step, b.bodies.step);
  assert.deepEqual(Array.from(a.bodies.x.subarray(0, 60)), Array.from(b.bodies.x.subarray(0, 60)));
  assert.deepEqual(Array.from(a.bodies.y.subarray(0, 60)), Array.from(b.bodies.y.subarray(0, 60)));
  assert.deepEqual(Array.from(a.bodies.vx.subarray(0, 60)), Array.from(b.bodies.vx.subarray(0, 60)));
  assert.deepEqual(Array.from(a.bodies.vy.subarray(0, 60)), Array.from(b.bodies.vy.subarray(0, 60)));
  assert.equal(cultureSwarmHash(a.bodies), cultureSwarmHash(b.bodies));
  assert.equal(cultureWorldHash(a), cultureWorldHash(b), 'and so does the world that carries them');
  ok('determinism: irregular feeds land bit-identical on the JS path');
}

// 4 — one-step hand cases against the reference core (the table stores float32; expectations are fround-ed).
{
  const damp = Math.pow(CULTURE_SWARM_PARAMS.damping, 1);
  // cohesion only: d = 65 sits between the alignment radius (60) and the cohesion radius (70)
  {
    const b = mkBodies([
      { x: 500, y: 400 },
      { x: 565, y: 400 },
    ]);
    stepCultureSwarm(b);
    const ev = Math.fround((0 + 1.5) * damp); // steer (65,0)/65 * cohW 1.5 / mass 1, then damping
    assert.equal(b.vx[0], ev);
    assert.equal(b.x[0], Math.fround(500 + ev));
    assert.equal(b.vx[1], Math.fround(-ev));
    assert.equal(b.x[1], Math.fround(565 - ev));
    assert.equal(b.vy[0], 0);
    assert.equal(b.step, 1);
  }
  // the speed clamp governs a lone fast body exactly
  {
    const b = mkBodies([{ x: 100, y: 100, vx: 100, vy: 0 }]);
    stepCultureSwarm(b);
    assert.equal(b.vx[0], CULTURE_SWARM_PARAMS.maxSpeed);
    assert.equal(b.x[0], 100 + CULTURE_SWARM_PARAMS.maxSpeed);
  }
  // the cloud wrap: past the pad, the body re-enters at the opposite pad (a small extent keeps it readable)
  {
    const b = mkBodies([{ x: 419, y: 100, vx: 8, vy: 0 }]);
    stepCultureSwarm(b, { ...CULTURE_SWARM_PARAMS, w: 300, h: 200 });
    assert.equal(b.x[0], -120, 'wrapped to the -pad edge exactly');
    assert.equal(b.y[0], 100);
  }
  // a dead body exerts nothing: the live pair steps exactly as if it were absent
  {
    const withDead = mkBodies([
      { x: 500, y: 400 },
      { x: 500, y: 400, alive: false },
      { x: 565, y: 400 },
    ]);
    const without = mkBodies([
      { x: 500, y: 400 },
      { x: 565, y: 400 },
    ]);
    stepCultureSwarm(withDead);
    stepCultureSwarm(without);
    assert.equal(withDead.x[0], without.x[0]);
    assert.equal(withDead.x[2], without.x[1]);
    assert.equal(withDead.x[1], 500, 'and the dead body itself integrates nothing');
  }
  // an empty table still counts its step — the kernel ran
  {
    const w = createCultureWorld({ seed: 3 });
    advanceCultureWorld(w, 2);
    assert.equal(w.bodies.count, 0);
    assert.equal(w.bodies.step, 120, 'two sim-seconds over an empty table is 120 swarm steps');
  }
  ok('one-step hand cases: cohesion-only pair, speed clamp, cloud wrap, dead bodies inert, empty table counts');
}

// 5 — the cap: the world's table holds the full 2,048 and steps it inside the laws.
{
  assert.equal(CULTURE_BODY_CAP, 2048, 'the world cap is the K3 ladder step-2 ceiling');
  const w = deal(createCultureWorld({ seed: 11 }), CULTURE_BODY_CAP);
  assert.equal(w.bodies.count, CULTURE_BODY_CAP);
  stepCultureWorld(w);
  stepCultureWorld(w);
  assert.equal(w.bodies.step, 1);
  let finite = true;
  let maxSpeed = 0;
  for (let i = 0; i < w.bodies.count; i++) {
    if (![w.bodies.x[i], w.bodies.y[i], w.bodies.vx[i], w.bodies.vy[i]].every(Number.isFinite)) finite = false;
    maxSpeed = Math.max(maxSpeed, Math.hypot(w.bodies.vx[i], w.bodies.vy[i]));
  }
  assert.ok(finite, 'no NaN over the full table');
  assert.ok(maxSpeed <= CULTURE_SWARM_PARAMS.maxSpeed + 1e-6, 'the clamp holds at cap');
  ok('the cap: 2,048 dealt bodies step finite and clamped');
}

// 6 — contact detection, hand cases.
{
  // an overlapping pair: exact normal and overlap
  {
    const b = mkBodies([
      { x: 100, y: 100, radius: 6 },
      { x: 110, y: 100, radius: 6 },
    ]);
    const pairs = cultureContactPairs(b);
    assert.equal(pairs.length, 1);
    assert.deepEqual([pairs[0].a, pairs[0].b], [0, 1]);
    assert.equal(pairs[0].nx, 1);
    assert.equal(pairs[0].ny, 0);
    assert.equal(pairs[0].overlap, 2);
  }
  // exactly touching is not a contact (d² >= (ra+rb)² is excluded, the dish law)
  {
    const b = mkBodies([
      { x: 100, y: 100, radius: 6 },
      { x: 112, y: 100, radius: 6 },
    ]);
    assert.equal(cultureContactPairs(b).length, 0);
  }
  // coincident discs: the deterministic golden-angle normal from the pair identity
  {
    const b = mkBodies([
      { x: 50, y: 50, radius: 5 },
      { x: 50, y: 50, radius: 7 },
    ]);
    const pairs = cultureContactPairs(b);
    assert.equal(pairs.length, 1);
    assert.equal(pairs[0].overlap, 12);
    const ang = (0 * 2.399963229728653 + 1 * 1.2) % (Math.PI * 2);
    assert.ok(Math.abs(pairs[0].nx - Math.cos(ang)) < 1e-12);
    assert.ok(Math.abs(pairs[0].ny - Math.sin(ang)) < 1e-12);
    assert.ok(Number.isFinite(pairs[0].nx) && Number.isFinite(pairs[0].ny), 'never NaN');
  }
  // no disc, no pair; the dead do not pair
  {
    const b = mkBodies([
      { x: 100, y: 100, radius: 0 },
      { x: 101, y: 100, radius: 6 },
      { x: 102, y: 100, radius: 6, alive: false },
    ]);
    assert.equal(cultureContactPairs(b).length, 0);
  }
  // canonical order over a mutually overlapping set
  {
    const b = mkBodies([
      { x: 100, y: 100, radius: 10 },
      { x: 105, y: 100, radius: 10 },
      { x: 102, y: 104, radius: 10 },
      { x: 98, y: 96, radius: 10 },
    ]);
    assert.deepEqual(
      cultureContactPairs(b).map((p) => [p.a, p.b]),
      [
        [0, 1],
        [0, 2],
        [0, 3],
        [1, 2],
        [1, 3],
        [2, 3],
      ],
    );
  }
  ok(
    'contact detection: overlap geometry, the touching edge, coincident normals, no-disc/dead exclusion, canonical order',
  );
}

// 7 — the oracle relation: over a two-stratum split of one table, the shipped detector's oracle
// (referenceContacts) finds exactly the world's cross-stratum pairs, with the same geometry.
{
  const w = deal(createCultureWorld({ seed: 21 }), 60);
  const b = w.bodies;
  // split the population into two systems by index parity, in the packer's input shape
  const sysFor = (parity) => {
    const idx = [];
    for (let i = parity; i < b.count; i += 2) idx.push(i);
    const sys = {
      n: idx.length,
      alive: new Uint8Array(idx.length).fill(1),
      x: new Float64Array(idx.map((i) => b.x[i])),
      y: new Float64Array(idx.map((i) => b.y[i])),
      vx: new Float64Array(idx.map((i) => b.vx[i])),
      vy: new Float64Array(idx.map((i) => b.vy[i])),
      mass: new Float64Array(idx.map((i) => b.mass[i])),
      scale: new Float64Array(idx.map((i) => b.radius[i])),
      cgroup: new Int32Array(idx.length),
    };
    return { sys, idx };
  };
  const s0 = sysFor(0);
  const s1 = sysFor(1);
  const table = packContactBodies([
    { sys: s0.sys, radius: 1, umask: 0xffffffff, impulse: false, restitution: 0 },
    { sys: s1.sys, radius: 1, umask: 0xffffffff, impulse: false, restitution: 0 },
  ]);
  const oracle = referenceContacts(table);
  const bodyOf = (stratum, index) => (stratum === 0 ? s0.idx[index] : s1.idx[index]);
  const key = (a, c) => `${Math.min(a, c)}:${Math.max(a, c)}`;
  const worldPairs = new Map(cultureContactPairs(b).map((p) => [key(p.a, p.b), p]));
  // every oracle pair is a world pair with the same geometry
  for (const o of oracle) {
    // the oracle's a/b are positions in the packed table; stratum + index map them back to world bodies
    const wp = worldPairs.get(
      key(bodyOf(table.stratum[o.a], table.index[o.a]), bodyOf(table.stratum[o.b], table.index[o.b])),
    );
    assert.ok(wp, 'an oracle pair the world predicate missed');
    assert.ok(Math.abs(wp.nx - o.nx) < 1e-9 && Math.abs(wp.ny - o.ny) < 1e-9, 'the same normal');
    assert.ok(Math.abs(wp.overlap - o.overlap) < 1e-9, 'the same overlap');
  }
  // and the world's remaining pairs are exactly the overlapping same-parity pairs (brute-forced here)
  let sameParity = 0;
  for (let a = 0; a < b.count; a++)
    for (let c = a + 2; c < b.count; c += 2) {
      const rr = b.radius[a] + b.radius[c];
      const dx = b.x[c] - b.x[a];
      const dy = b.y[c] - b.y[a];
      if (dx * dx + dy * dy < rr * rr) sameParity++;
    }
  assert.equal(
    worldPairs.size,
    oracle.length + sameParity,
    'world pairs = cross pairs (the oracle) + same-stratum pairs (its own)',
  );
  ok(
    'the oracle relation: referenceContacts over a two-stratum split is the world predicate, cross-stratum for cross-stratum',
  );
}

// 8 — hash coverage: the swarm fingerprint and the world hash both see the bodies and the stamp.
{
  const a = deal(createCultureWorld({ seed: 31 }), 24);
  const c = deal(createCultureWorld({ seed: 31 }), 24);
  assert.equal(cultureSwarmHash(a.bodies), cultureSwarmHash(c.bodies));
  assert.equal(cultureWorldHash(a), cultureWorldHash(c));
  c.bodies.vx[3] += 0.25;
  assert.notEqual(cultureSwarmHash(a.bodies), cultureSwarmHash(c.bodies), 'a velocity change is a different swarm');
  assert.notEqual(cultureWorldHash(a), cultureWorldHash(c), 'and a different world');
  const d = deal(createCultureWorld({ seed: 31 }), 24);
  setCultureSwarmBackend(d, 'gpu.swarm.v1');
  assert.notEqual(cultureWorldHash(a), cultureWorldHash(d), 'the stamp itself is hashed');
  ok('hash coverage: swarm state and the swarm stamp both move the world hash');
}

console.log(
  `cultureSwarm.selfcheck: OK (${groups} groups) — CULTURE Phase 1 K3, the swarm/contacts kernel in the world`,
);
