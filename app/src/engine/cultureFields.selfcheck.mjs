// node src/engine/cultureFields.selfcheck.mjs
// CULTURE Phase 3, slice A — the Queen's fields and the ferro force (the parent
// issue 2178, world side): the fields born empty on the swarm's cadence with no
// stamp of their own; the empty table a bit-exact no-op over the Phase 2
// composition; the Queen's-door asymmetry (a request deals nothing and moves
// nothing until the Queen applies it; a decline deals nothing ever); the pull
// law hand-computed (toward the magnet, gated on the published density at the
// body's cell — dry cell exactly nothing, half density exactly half pull, the
// kernel's gaussian falloff); the same gating on the world's real medium;
// fields never bodies (no contacts, no solver presence, no mass or radius to
// collide with); move and retire; determinism under irregular feeds with the
// Queen's whole state inside the world hash; and the doors' refusals + caps.
import assert from 'node:assert/strict';
import {
  createCultureWorld,
  advanceCultureWorld,
  stepCultureWorld,
  cultureWorldHash,
  cultureWorldSimLaw,
  cultureFluidDensity,
  standingCultureWorld,
  dealCultureField,
  moveCultureField,
  retireCultureField,
  requestCultureField,
  resolveCultureFieldRequest,
  CULTURE_SWARM_STEP_DIVISOR,
} from './cultureWorld.mjs';
import {
  createCultureFields,
  createCultureFieldRequests,
  stepCultureFields,
  CULTURE_FIELDS_CAP,
  CULTURE_FIELD_REQUESTS_CAP,
  CULTURE_FIELD_KIND_MAGNET,
  CULTURE_FIELD_MAGNET_RADIUS,
  CULTURE_FIELD_MAGNET_STRENGTH,
  CULTURE_FIELD_REQUEST_PENDING,
  CULTURE_FIELD_REQUEST_APPLIED,
  CULTURE_FIELD_REQUEST_DECLINED,
} from './cultureFields.mjs';
import { stepCultureSwarm, cultureContactPairs, cultureSwarmHash } from './cultureSwarm.mjs';
import { stepCultureSolver, createCultureStatics, createCultureLinks, cultureSolverHash } from './cultureSolver.mjs';
import { STAGE_COLS, STAGE_ROWS } from './dishLifeStage.mjs';

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

/** A fields table written directly (the Queen's doors are group 3's brief). */
const mkFields = (list) => {
  const f = createCultureFields();
  list.forEach((spec, i) => {
    f.kind[i] = CULTURE_FIELD_KIND_MAGNET;
    f.active[i] = spec.active === false ? 0 : 1;
    f.x[i] = spec.x;
    f.y[i] = spec.y;
    f.strength[i] = spec.strength ?? CULTURE_FIELD_MAGNET_STRENGTH;
    f.radius[i] = spec.radius ?? CULTURE_FIELD_MAGNET_RADIUS;
  });
  f.count = list.length;
  return f;
};

/** A density grid over the shared cells, zero except the cells named. */
const mkDensity = (cells) => {
  const d = new Float32Array(STAGE_COLS * STAGE_ROWS);
  for (const [cx, cy, v] of cells) d[cy * STAGE_COLS + cx] = v;
  return d;
};
const cellOf = (x, y) => [Math.floor(x / 20), Math.floor(y / 20)];

/** Deal one resting body into a world at (x, y). */
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

/** The first cell whose published density is at least `min`, scanning the world's real medium. */
const findWetCell = (world, min) => {
  const d = cultureFluidDensity(world);
  for (let cy = 0; cy < STAGE_ROWS; cy++)
    for (let cx = 0; cx < STAGE_COLS; cx++) if (d[cy * STAGE_COLS + cx] >= min) return [cx, cy];
  return null;
};

/** A cell with density exactly 0 and a two-cell dry moat around it (one fluid step cannot wet it). */
const findDryCell = (world) => {
  const d = cultureFluidDensity(world);
  for (let cy = 2; cy < STAGE_ROWS - 2; cy++)
    for (let cx = 2; cx < STAGE_COLS - 2; cx++) {
      let dry = true;
      for (let oy = -2; oy <= 2 && dry; oy++)
        for (let ox = -2; ox <= 2 && dry; ox++) if (d[(cy + oy) * STAGE_COLS + (cx + ox)] !== 0) dry = false;
      if (dry) return [cx, cy];
    }
  return null;
};

// 1 — born empty, on the swarm's cadence, with no stamp of their own.
{
  const w = createCultureWorld({ seed: 5 });
  assert.equal(w.fields.count, 0, 'no field is born dealt');
  assert.equal(w.fields.capacity, CULTURE_FIELDS_CAP);
  assert.equal(CULTURE_FIELDS_CAP, 64);
  assert.equal(w.fieldRequests.count, 0, 'no request is born logged');
  assert.equal(w.fieldRequests.capacity, CULTURE_FIELD_REQUESTS_CAP);
  assert.equal(CULTURE_FIELD_REQUESTS_CAP, 256);
  assert.equal(w.fields.step, 0);
  assert.equal(w.simLaw, 'js-exact', 'the fields add no stamp: the world law is unchanged');
  assert.equal(cultureWorldSimLaw(w), 'js-exact');
  assert.equal(standingCultureWorld(), null, 'creating a world registers nothing anywhere');
  for (let r = 0; r < 40; r++) {
    advanceCultureWorld(w, 1 / 60);
    assert.equal(w.fields.step, Math.floor(w.step / CULTURE_SWARM_STEP_DIVISOR), 'one field step per swarm step');
    assert.equal(w.fields.step, w.bodies.step, 'locked to the swarm cadence');
  }
  ok('born empty: no fields, no requests, field step on the swarm cadence, no stamp of their own');
}

// 2 — parity: with no fields dealt, the world steps its bodies bit-identically
// to the Phase 2 composition (swarm + solver) alone; and a field step over an
// empty table moves nothing on a bare table either.
{
  const deal = (world, n) => {
    const b = world.bodies;
    for (let i = 0; i < n; i++) {
      b.alive[i] = 1;
      b.x[i] = 200 + ((i * 37) % 900);
      b.y[i] = 200 + ((i * 53) % 500);
      b.vx[i] = ((i % 5) - 2) * 0.7;
      b.vy[i] = ((i % 3) - 1) * 0.9;
      b.mass[i] = 1;
      b.radius[i] = 6;
    }
    b.count = n;
    return world;
  };
  const w = deal(createCultureWorld({ seed: 41 }), 30);
  const bare = mkBodies(
    Array.from({ length: 30 }, (_, i) => ({
      x: w.bodies.x[i],
      y: w.bodies.y[i],
      vx: w.bodies.vx[i],
      vy: w.bodies.vy[i],
      mass: 1,
      radius: 6,
    })),
  );
  const s = createCultureStatics();
  const l = createCultureLinks();
  for (let step = 0; step < 12; step++) {
    stepCultureWorld(w);
    stepCultureWorld(w);
    stepCultureSwarm(bare);
    stepCultureSolver(bare, s, l);
  }
  assert.equal(
    cultureSwarmHash(w.bodies),
    cultureSwarmHash(bare),
    'no fields dealt => the Phase 2 composition, bit for bit',
  );

  const t = mkBodies([{ x: 100, y: 100, vx: 1, vy: -1 }]);
  stepCultureFields(t, createCultureFields(), mkDensity([[5, 5, 1]]));
  assert.deepEqual([t.vx[0], t.vy[0]], [1, -1], 'an empty fields table writes no force');
  ok('parity: no fields => swarm + solver bit for bit; the empty table is a no-op');
}

// 3 — the Queen's-door asymmetry: a request deals nothing and moves nothing
// until the Queen applies it; a decline deals nothing ever.
{
  const seed = 61;
  const wet = findWetCell(createCultureWorld({ seed }), 0.4);
  assert.ok(wet, 'the seeded medium has a wet cell to stand in');
  const [bx, by] = [wet[0] * 20 + 10, wet[1] * 20 + 10];
  const spec = { kind: 'magnet', x: bx + 100, y: by, strength: 0.5, radius: 120 };

  // Requested but unresolved: the table is untouched and the body feels nothing.
  const asked = dealBody(createCultureWorld({ seed }), bx, by);
  const control = dealBody(createCultureWorld({ seed }), bx, by);
  const req = requestCultureField(asked, spec);
  assert.equal(req, 0);
  assert.equal(asked.fieldRequests.status[req], CULTURE_FIELD_REQUEST_PENDING);
  assert.equal(asked.fieldRequests.field[req], -1);
  assert.equal(asked.fields.count, 0, 'a request deals no field');
  for (let s = 0; s < 6; s++) {
    stepCultureWorld(asked);
    stepCultureWorld(control);
  }
  assert.equal(cultureSwarmHash(asked.bodies), cultureSwarmHash(control.bodies), 'a pending request moves no body');
  assert.equal(asked.bodies.vx[0], 0, 'the body stands exactly where the control stands');

  // The Queen applies: the field exists verbatim, and the body now feels it.
  const fieldIndex = resolveCultureFieldRequest(asked, req, true);
  assert.equal(fieldIndex, 0);
  assert.equal(asked.fields.count, 1);
  assert.equal(asked.fields.active[0], 1);
  assert.equal(asked.fields.x[0], Math.fround(spec.x), 'the applied field is the requested field, verbatim');
  assert.equal(asked.fields.strength[0], Math.fround(spec.strength));
  assert.equal(asked.fieldRequests.status[req], CULTURE_FIELD_REQUEST_APPLIED);
  assert.equal(asked.fieldRequests.field[req], 0);
  stepCultureWorld(asked);
  stepCultureWorld(asked);
  assert.ok(asked.bodies.vx[0] > 0, 'applied, the magnet pulls the body toward it (+x)');
  assert.ok(asked.bodies.x[0] > bx, 'and the body has moved toward the magnet');
  assert.throws(() => resolveCultureFieldRequest(asked, req, true), /no pending field request/, 'no double resolution');

  // The Queen declines: nothing is dealt, and the request is spent.
  const declined = dealBody(createCultureWorld({ seed }), bx, by);
  const req2 = requestCultureField(declined, spec);
  assert.equal(resolveCultureFieldRequest(declined, req2, false), -1);
  assert.equal(declined.fields.count, 0, 'a decline deals nothing');
  assert.equal(declined.fieldRequests.status[req2], CULTURE_FIELD_REQUEST_DECLINED);
  for (let s = 0; s < 6; s++) stepCultureWorld(declined);
  assert.equal(declined.bodies.vx[0], 0, 'a declined magnet never pulls');
  ok("the Queen's asymmetry: requests inert until applied, declines deal nothing, no double resolution");
}

// 4 — the pull law, hand-computed at the field step: toward the magnet, gated
// on the density at the body's cell, with the kernel's gaussian falloff.
{
  const S = 0.4;
  const R = 100;
  const magnet = { x: 500, y: 500, strength: S, radius: R };
  const fields = mkFields([magnet]);
  // Body due west of the magnet at exactly one radius: falloff exp(−1).
  {
    const b = mkBodies([{ x: 400, y: 500 }]);
    const [cx, cy] = cellOf(400, 500);
    stepCultureFields(b, fields, mkDensity([[cx, cy, 1]]));
    near(b.vx[0], S * Math.exp(-1), 1e-7, 'wet cell, one radius out: strength × exp(−1), toward the magnet');
    assert.equal(b.vy[0], 0, 'due west: no sideways component');
    assert.equal(fields.step, 1, 'the field step counts');
  }
  // Half the density: exactly half the pull (the gate is linear in density).
  {
    const b = mkBodies([{ x: 400, y: 500 }]);
    const [cx, cy] = cellOf(400, 500);
    stepCultureFields(b, fields, mkDensity([[cx, cy, 0.5]]));
    near(b.vx[0], S * Math.exp(-1) * 0.5, 1e-7, 'half density, half pull');
  }
  // A dry cell: exactly nothing, however strong the magnet.
  {
    const b = mkBodies([{ x: 400, y: 500 }]);
    stepCultureFields(b, fields, mkDensity([]));
    assert.deepEqual([b.vx[0], b.vy[0]], [0, 0], 'no fluid, no pull');
  }
  // Diagonal: equal components along the unit vector, magnitude by the same law.
  {
    const b = mkBodies([{ x: 450, y: 450 }]);
    const [cx, cy] = cellOf(450, 450);
    stepCultureFields(b, fields, mkDensity([[cx, cy, 1]]));
    const d = Math.hypot(50, 50);
    const mag = S * Math.exp(-((d / R) ** 2));
    near(b.vx[0], mag / Math.SQRT2, 1e-7, 'diagonal x component');
    near(b.vy[0], mag / Math.SQRT2, 1e-7, 'diagonal y component');
  }
  // Exactly on the magnet: no direction, no NaN, no force. Dead body: nothing.
  {
    const b = mkBodies([
      { x: 500, y: 500 },
      { x: 400, y: 500, alive: false },
    ]);
    const [cx, cy] = cellOf(400, 500);
    stepCultureFields(
      b,
      fields,
      mkDensity([
        [cx, cy, 1],
        [25, 25, 1],
      ]),
    );
    assert.deepEqual([b.vx[0], b.vy[0], b.vx[1], b.vy[1]], [0, 0, 0, 0], 'coincident and dead bodies feel nothing');
    assert.ok(Number.isFinite(b.vx[0]) && Number.isFinite(b.vy[0]));
  }
  // Two magnets at one point compose additively (the kernel's own reading).
  {
    const b = mkBodies([{ x: 400, y: 500 }]);
    const [cx, cy] = cellOf(400, 500);
    stepCultureFields(b, mkFields([magnet, magnet]), mkDensity([[cx, cy, 1]]));
    near(b.vx[0], 2 * S * Math.exp(-1), 1e-7, 'overlapping magnets add up');
  }
  ok('the pull law: toward the magnet, density-gated linearly, gaussian falloff, additive magnets');
}

// 5 — the same gating on the world's real medium: a body in a wet cell is
// pulled; a body in a dry cell (with its dry moat) feels exactly nothing.
{
  const seed = 97;
  const probe = createCultureWorld({ seed });
  const wet = findWetCell(probe, 0.4);
  const dry = findDryCell(probe);
  assert.ok(wet && dry, 'the seeded medium offers both a wet cell and a dry cell');

  const pulled = dealBody(createCultureWorld({ seed }), wet[0] * 20 + 10, wet[1] * 20 + 10);
  dealCultureField(pulled, { kind: 'magnet', x: wet[0] * 20 + 110, y: wet[1] * 20 + 10, strength: 0.5, radius: 120 });
  stepCultureWorld(pulled);
  stepCultureWorld(pulled);
  assert.ok(pulled.bodies.vx[0] > 0, 'in the wet cell the body gains velocity toward the magnet');
  assert.ok(pulled.bodies.x[0] > wet[0] * 20 + 10, 'and moves toward it');

  const standing = dealBody(createCultureWorld({ seed }), dry[0] * 20 + 10, dry[1] * 20 + 10);
  dealCultureField(standing, { kind: 'magnet', x: dry[0] * 20 + 110, y: dry[1] * 20 + 10, strength: 0.5, radius: 120 });
  stepCultureWorld(standing);
  stepCultureWorld(standing);
  assert.equal(standing.bodies.vx[0], 0, 'in the dry cell the same magnet pulls exactly nothing');
  assert.equal(standing.bodies.x[0], dry[0] * 20 + 10, 'the body never moved');
  ok("world gating: the medium's own density decides — wet pulls, dry stands");
}

// 6 — fields are forces, never bodies: the contact dealer and the solver see
// the body table only, and a magnet standing over a settling pair in dry
// country changes no body's trajectory.
{
  const w = createCultureWorld({ seed: 3 });
  dealCultureField(w, { kind: 'magnet', x: 300, y: 300 });
  assert.equal(Object.hasOwn(w.fields, 'mass'), false, 'a field has no mass to collide with');
  assert.equal(Object.hasOwn(w.fields, 'radius'), true, 'a field has a reach…');
  assert.equal(Object.hasOwn(w.fields, 'alive'), false, '…but no body life of its own');

  const b = mkBodies([
    { x: 290, y: 300, radius: 10 },
    { x: 305, y: 300, radius: 10 },
  ]);
  const pairs = cultureContactPairs(b);
  assert.equal(pairs.length, 1, 'the overlapping discs pair — the magnet between them is not a third body');
  assert.deepEqual([pairs[0].a, pairs[0].b], [0, 1]);
  const solverBefore = cultureSolverHash(createCultureStatics(), createCultureLinks());
  stepCultureSolver(b, createCultureStatics(), createCultureLinks());
  assert.equal(
    cultureSolverHash(createCultureStatics(), createCultureLinks()),
    solverBefore,
    'the solver state is the tables it is handed, nothing else',
  );

  // A settling pair under a dealt magnet, in dry country: bit-identical to the control.
  const seed = 97;
  const dry = findDryCell(createCultureWorld({ seed }));
  const [px, py] = [dry[0] * 20 + 10, dry[1] * 20 + 10];
  const deal2 = (world) => {
    const t = world.bodies;
    t.alive[0] = 1;
    t.x[0] = px;
    t.y[0] = py;
    t.mass[0] = 1;
    t.radius[0] = 10;
    t.alive[1] = 1;
    t.x[1] = px + 15;
    t.y[1] = py;
    t.mass[1] = 1;
    t.radius[1] = 10;
    t.count = 2;
    return world;
  };
  const withField = deal2(createCultureWorld({ seed }));
  const control = deal2(createCultureWorld({ seed }));
  dealCultureField(withField, { kind: 'magnet', x: px, y: py, strength: 2, radius: 200 });
  stepCultureWorld(withField);
  stepCultureWorld(withField);
  stepCultureWorld(control);
  stepCultureWorld(control);
  assert.ok(withField.bodies.x[0] !== px, 'the solver did settle the pair (the test is not vacuous)');
  assert.equal(
    cultureSwarmHash(withField.bodies),
    cultureSwarmHash(control.bodies),
    'gated to zero in dry country, the magnet leaves the solver’s work bit-identical',
  );
  ok('force, not body: no contacts name a field, the solver never sees one, dry-gated pull changes nothing');
}

// 7 — the Queen moves and retires: a moved magnet pulls where it stands now;
// a retired one pulls nowhere, and its slot is never reused.
{
  const b = mkBodies([{ x: 400, y: 500 }]);
  const [cx, cy] = cellOf(400, 500);
  const density = mkDensity([[cx, cy, 1]]);
  const w = createCultureWorld({ seed: 11 });
  const far = dealCultureField(w, { kind: 'magnet', x: 1800, y: 100, strength: 0.4, radius: 100 });
  stepCultureFields(b, w.fields, density);
  near(b.vx[0], 0, 1e-12, 'a magnet across the dish pulls nothing here (falloff)');
  moveCultureField(w, far, { x: 500, y: 500 });
  stepCultureFields(b, w.fields, density);
  near(b.vx[0], 0.4 * Math.exp(-1), 1e-7, 'moved beside the body, the same magnet pulls at full law');
  retireCultureField(w, far);
  const vxAfterRetire = b.vx[0];
  stepCultureFields(b, w.fields, density);
  assert.equal(b.vx[0], vxAfterRetire, 'retired, the magnet pulls nothing more');
  const next = dealCultureField(w, { kind: 'magnet', x: 900, y: 900 });
  assert.equal(next, 1, 'a new deal takes a fresh index — the retired slot is never reused');
  assert.equal(w.fields.count, 2);
  assert.equal(w.fields.active[0], 0);
  assert.equal(w.fields.active[1], 1);
  ok('move and retire: the pull follows the Queen’s hand; retired slots stand empty forever');
}

// 8 — determinism: same seed, same deals and answers, same irregular feed =>
// the identical world; the hash sees a one-pixel field move and the
// difference between a pending and a declined request.
{
  const build = () => {
    const w = dealBody(createCultureWorld({ seed: 77 }), 500, 500);
    dealCultureField(w, { kind: 'magnet', x: 700, y: 400, strength: 0.5, radius: 150 });
    const r1 = requestCultureField(w, { kind: 'magnet', x: 300, y: 800 });
    requestCultureField(w, { kind: 'magnet', x: 1200, y: 200, strength: 0.2 });
    resolveCultureFieldRequest(w, r1, true);
    return w;
  };
  const feeds = [0.007, 1 / 60, 0.033, 0.0025, 0.05, 1 / 45, 0.011];
  const run = (w) => {
    for (let r = 0; r < 90; r++) advanceCultureWorld(w, feeds[r % feeds.length]);
    return w;
  };
  const a = run(build());
  const b = run(build());
  assert.equal(a.fields.step, b.fields.step);
  assert.equal(cultureWorldHash(a), cultureWorldHash(b), 'fields and requests inside, the hash is bit-identical');

  const moved = build();
  moveCultureField(moved, 0, { x: 701, y: 400 });
  run(moved);
  assert.notEqual(cultureWorldHash(moved), cultureWorldHash(a), 'the hash covers a one-pixel field move');

  const answered = build();
  resolveCultureFieldRequest(answered, 1, false);
  run(answered);
  assert.notEqual(cultureWorldHash(answered), cultureWorldHash(a), 'the hash covers the Queen’s answers');
  ok('determinism: irregular feeds land bit-identical; field moves and request answers are inside the hash');
}

// 9 — the caps and the doors' refusals: bad specs, bad indices, spent
// requests, full tables — all refused loudly, and refusals change nothing.
{
  const w = createCultureWorld({ seed: 23 });
  assert.throws(() => dealCultureField(w, { kind: 'current', x: 0, y: 0 }), /unknown field kind/);
  assert.throws(() => dealCultureField(w, { x: NaN, y: 0 }), /bad field position/);
  assert.throws(() => dealCultureField(w, null), /bad field position/);
  assert.throws(() => dealCultureField(w, { x: 0, y: 0, strength: -1 }), /bad field strength/);
  assert.throws(() => dealCultureField(w, { x: 0, y: 0, strength: NaN }), /bad field strength/);
  assert.throws(() => dealCultureField(w, { x: 0, y: 0, radius: 0 }), /bad field radius/);
  assert.throws(
    () => requestCultureField(w, { kind: 'hand', x: 0, y: 0 }),
    /unknown field kind/,
    'requests validate too',
  );
  assert.throws(() => moveCultureField(w, 0, { x: 0, y: 0 }), /no standing field/);
  assert.throws(() => retireCultureField(w, 0), /no standing field/);
  assert.throws(() => resolveCultureFieldRequest(w, 0, true), /no pending field request/);
  assert.equal(w.fields.count, 0, 'refusals deal nothing');
  assert.equal(w.fieldRequests.count, 0, 'refusals log nothing');

  const idx = dealCultureField(w, { kind: 'magnet', x: 100, y: 100 });
  assert.throws(() => moveCultureField(w, idx, { x: NaN, y: 0 }), /bad field move/);
  retireCultureField(w, idx);
  assert.throws(() => moveCultureField(w, idx, { x: 0, y: 0 }), /no standing field/, 'a retired field does not move');
  assert.throws(() => retireCultureField(w, idx), /no standing field/, 'nor retire twice');

  // The fields cap fills and refuses.
  const full = createCultureWorld({ seed: 29 });
  for (let i = 0; i < CULTURE_FIELDS_CAP; i++) dealCultureField(full, { kind: 'magnet', x: i, y: i });
  assert.equal(full.fields.count, CULTURE_FIELDS_CAP);
  assert.throws(() => dealCultureField(full, { kind: 'magnet', x: 0, y: 0 }), /fields table full/);

  // Applying a request against the full table refuses, and the request stays pending.
  const req = requestCultureField(full, { kind: 'magnet', x: 5, y: 5 });
  assert.throws(() => resolveCultureFieldRequest(full, req, true), /fields table full/);
  assert.equal(full.fieldRequests.status[req], CULTURE_FIELD_REQUEST_PENDING, 'the unapplied request stands');

  // The request log fills and refuses.
  const logged = createCultureWorld({ seed: 31 });
  for (let i = 0; i < CULTURE_FIELD_REQUESTS_CAP; i++) requestCultureField(logged, { kind: 'magnet', x: i, y: 0 });
  assert.equal(logged.fieldRequests.count, CULTURE_FIELD_REQUESTS_CAP);
  assert.throws(() => requestCultureField(logged, { kind: 'magnet', x: 0, y: 0 }), /field request log full/);
  ok('caps and refusals: 64 fields and 256 requests fill and refuse; every bad door call is loud and inert');
}

console.log(
  `cultureFields.selfcheck: OK (${groups} groups) — CULTURE Phase 3 slice A, the Queen's fields and the ferro force`,
);
