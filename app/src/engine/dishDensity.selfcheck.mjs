// node src/engine/dishDensity.selfcheck.mjs
//
// Petri dish B3 (#1412) — the contact-density field: the law in
// dishDensity.mjs + the stamps in dishContacts.mjs, pinned.
//
//   (a) the field is the shared grid's own count: a real cross-strata
//       pass stamps per-cell body counts in the grid's geometry —
//       totals, the crowded cell, sampling, the saturation share;
//   (b) ticks: each consumed arm advances the tick once; an arm that
//       builds no grid stamps the EMPTY field (never a stale crowd);
//       a session that never arms stamps nothing — the resolver's
//       publish rule then yields the empty field;
//   (c) the bus: the resolver publishes, the shell bridge emits
//       Events.DISH_DENSITY on change (and only on change), and a
//       formation-style reader answers "how crowded is this pin"
//       from the bus payload alone — no engine change per reader
//       (the issue's acceptance shape);
//   (d) determinism: the same scenario rebuilt stamps identical
//       counts, cell for cell;
//   (e) the wiring: the pass stamps, the resolver publishes.

import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { ParticleSystem } from './particles.js';
import { createDishSession, enrolDishBody, armDish, runDishContacts } from './dishContacts.mjs';
import {
  buildDishDensity,
  sampleDishDensity,
  dishDensityShare,
  publishDishDensity,
  getDishDensity,
  EMPTY_DISH_DENSITY,
  DISH_DENSITY_SATURATE,
} from './dishDensity.mjs';
import { on, off, Events } from '../composition/eventBus.js';
import { observeDishDensity, getDishDensityField } from '../curator/dishDensityLive.js';

const assets = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
const palette = { swatches: ['#ff0000', '#00ff00', '#0000ff'] };
const SEED = 0x1a4f;

const body = (x, y) => {
  const sys = new ParticleSystem();
  sys.init(1, 1000, 700, assets, palette, SEED);
  sys.x[0] = x;
  sys.y[0] = y;
  sys.vx[0] = 0;
  sys.vy[0] = 0;
  sys.mass[0] = 1;
  sys.scale[0] = 1;
  sys._layout = { contactRadius: 20 };
  return sys;
};

// Two strata whose bodies share the dish: A0/A1 land in one cell,
// B0 in the cell below, B1 far away. Radius 20 → cell 40.
const scenario = () => {
  const A = new ParticleSystem();
  A.init(2, 1000, 700, assets, palette, SEED);
  A.x[0] = 400;
  A.y[0] = 350;
  A.x[1] = 430;
  A.y[1] = 350;
  A.vx[0] = 0;
  A.vy[0] = 0;
  A.vx[1] = 0;
  A.vy[1] = 0;
  A.mass[0] = 1;
  A.mass[1] = 1;
  A.scale[0] = 1;
  A.scale[1] = 1;
  A._layout = { contactRadius: 20 };
  const B = new ParticleSystem();
  B.init(2, 1000, 700, assets, palette, SEED);
  B.x[0] = 415;
  B.y[0] = 382;
  B.x[1] = 900;
  B.y[1] = 100;
  B.vx[0] = 0;
  B.vy[0] = 0;
  B.vx[1] = 0;
  B.vy[1] = 0;
  B.mass[0] = 1;
  B.mass[1] = 1;
  B.scale[0] = 1;
  B.scale[1] = 1;
  B._layout = { contactRadius: 20 };
  const ses = createDishSession();
  enrolDishBody(ses, {
    key: 'A',
    sys: A,
    radius: 20,
    restitution: 0.5,
    contactMode: 'none',
    umask: 0xffffffff,
    organism: false,
  });
  enrolDishBody(ses, {
    key: 'B',
    sys: B,
    radius: 20,
    restitution: 0.5,
    contactMode: 'none',
    umask: 0xffffffff,
    organism: false,
  });
  armDish(ses, ['A', 'B']);
  runDishContacts(ses, A);
  return ses;
};

// (a) — the field is the grid's own count.
{
  const ses = scenario();
  const f = ses.density;
  assert.ok(f, 'the pass stamped a field on the session');
  assert.strictEqual(f.total, 4, 'every enrolled body is counted once');
  assert.strictEqual(f.cellSize, 40, 'the cell is 2 × the largest disc radius (the grid\u2019s geometry)');
  assert.strictEqual(f.max, 2, 'the A pair shares a cell');
  assert.strictEqual(sampleDishDensity(f, 400, 350), 2, 'sampling the A pair\u2019s position reads their cell');
  assert.strictEqual(sampleDishDensity(f, 415, 382), 1, 'B0 reads its own cell');
  assert.strictEqual(sampleDishDensity(f, 900, 100), 1, 'the far body is counted too');
  assert.strictEqual(sampleDishDensity(f, 10, 10), 0, 'outside the grid reads 0');
  assert.strictEqual(dishDensityShare(f, 400, 350), 2 / DISH_DENSITY_SATURATE, 'the share is count over saturation');
  const dense = buildDishDensity({
    cellStart: new Int32Array([0, DISH_DENSITY_SATURATE + 5, DISH_DENSITY_SATURATE + 5]),
    cols: 2,
    rows: 1,
    cellSize: 40,
    minCx: 0,
    minCy: 0,
  });
  assert.strictEqual(dishDensityShare(dense, 20, 20), 1, 'a cell at saturation reads full density');
  assert.strictEqual(sampleDishDensity(EMPTY_DISH_DENSITY, 400, 350), 0, 'the empty field samples 0 everywhere');
}

// (b) — ticks and the empty stamp.
{
  const ses = scenario();
  assert.strictEqual(ses.densityTick, 1, 'one consumed arm, one tick');
  armDish(ses, ['A', 'B']);
  runDishContacts(ses, ses.entries[0].sys);
  assert.strictEqual(ses.densityTick, 2, 'each pass advances the tick exactly once');

  // An arm consumed with too few bodies stamps the empty field.
  const lone = createDishSession();
  const one = body(500, 350);
  const two = body(900, 100);
  enrolDishBody(lone, {
    key: 'A',
    sys: one,
    radius: 20,
    restitution: 0.5,
    contactMode: 'none',
    umask: 0xffffffff,
    organism: false,
  });
  enrolDishBody(lone, {
    key: 'B',
    sys: two,
    radius: 20,
    restitution: 0.5,
    contactMode: 'none',
    umask: 0xffffffff,
    organism: false,
  });
  one.alive[0] = 0;
  two.alive[0] = 0; // enrolled, but no living bodies
  armDish(lone, ['A', 'B']);
  runDishContacts(lone, one);
  assert.strictEqual(lone.densityTick, 1, 'the trivial pass still stamps');
  assert.strictEqual(lone.density.total, 0, 'and the stamp is the empty field, not a stale crowd');
  assert.strictEqual(lone.density.counts.length, 0, 'empty means no cells');

  // A single stratum never arms: nothing is stamped, and the
  // resolver's rule (tick not advanced → publish empty) applies.
  const solo = createDishSession();
  enrolDishBody(solo, {
    key: 'A',
    sys: body(500, 350),
    radius: 20,
    restitution: 0.5,
    contactMode: 'none',
    umask: 0xffffffff,
    organism: false,
  });
  assert.strictEqual(armDish(solo, ['A']), false, 'one stratum does not arm the dish');
  assert.strictEqual(solo.density, null, 'no pass, no field');
  publishDishDensity(solo.densityTick > 0 ? solo.density : EMPTY_DISH_DENSITY);
  assert.strictEqual(getDishDensity(), EMPTY_DISH_DENSITY, 'the publish rule yields the empty field');
}

// (c) — the bus: publish → bridge → subscribe; a pin read from the payload.
{
  const ses = scenario();
  publishDishDensity(ses.density);
  assert.strictEqual(getDishDensityField(), ses.density, 'the holder carries the published field');

  const seen = [];
  const fn = (p) => seen.push(p);
  on(Events.DISH_DENSITY, fn);
  observeDishDensity();
  assert.strictEqual(seen.length, 1, 'the bridge emits the new field once');
  assert.strictEqual(seen[0].field, ses.density, 'the payload is the tick\u2019s field');
  observeDishDensity();
  assert.strictEqual(seen.length, 1, 'no change, no re-emit');
  // A formation-style read, from the bus payload alone: how crowded
  // is the pin at the A pair? (No engine call beyond the field law's
  // own sampler — the acceptance is that readers need no engine change.)
  assert.strictEqual(
    sampleDishDensity(seen[0].field, 415, 350),
    2,
    'a pin at the pair reads their density from the bus',
  );
  assert.ok(dishDensityShare(seen[0].field, 415, 350) > 0, 'and as a share for a formation threshold');
  publishDishDensity(EMPTY_DISH_DENSITY);
  observeDishDensity();
  assert.strictEqual(seen.length, 2, 'the fall back to empty is emitted too');
  assert.strictEqual(seen[1].field.total, 0, 'the dish went quiet honestly');
  off(Events.DISH_DENSITY, fn);
}

// (d) — determinism: same scenario, identical counts.
{
  const a = scenario();
  const b = scenario();
  assert.deepStrictEqual([...a.density.counts], [...b.density.counts], 'cell for cell, the counts agree');
  assert.strictEqual(a.density.cellSize, b.density.cellSize, 'same grid geometry');
  assert.strictEqual(a.density.originX, b.density.originX, 'same grid origin');
}

// (e) — the wiring: the pass stamps; the resolver publishes.
{
  const contacts = readFileSync(new URL('./dishContacts.mjs', import.meta.url), 'utf8');
  const resolve = readFileSync(new URL('../gl/liveResolve.mjs', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
  const bus = readFileSync(new URL('../composition/eventBus.js', import.meta.url), 'utf8');
  assert.ok(contacts.includes('stampDensity(session, buildDishDensity('), 'the shared pass stamps its counts');
  assert.ok(
    resolve.includes('publishDishDensity(dishSession.densityTick > densityTickSeen'),
    'the resolver publishes the frame\u2019s field, empty when no pass ran',
  );
  assert.ok(app.includes('observeDishDensity();'), 'the App frame tap bridges the field to the bus');
  assert.ok(bus.includes("DISH_DENSITY: 'dish:density'"), 'the bus names the field signal');
}

console.log(
  'dishDensity.selfcheck: OK (#1412 — grid-true counts, tick + empty-stamp honesty, bus publication + pin read, deterministic, resolver wiring)',
);
