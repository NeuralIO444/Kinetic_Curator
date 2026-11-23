// node src/engine/cultureSoil.selfcheck.mjs
// CULTURE Phase 4 — the soil: Life as the world's ground (spec §5.2; the parent
// issue 2152's law — Life is never drawn, dead ground kills). Pins: the soil born
// with the world, on the world's own 120 Hz clock, stamping nothing; the ground
// reading hand-computed (living / level / fertility over Life's 3×3 neighbourhood /
// decay / fortune; decaying ground still lives; beyond the grid is dead — the rim
// law); the read door (the published field, read-only, refusing a non-finite
// point); the wither law's exact timing (alive at 479 sustained dead steps, gone
// at 480; one living step restarts the clock; the dead are skipped and never
// rise); the read discipline in a real world (a lattice of resting bodies matches
// an oracle that reads the published field AFTER the culture's generation, every
// step — the last completed generation, never the one before or a working
// buffer); never drawn and only the alive flag written; a killed body is gone
// from every mover; determinism with the soil in the world hash; and gate-off
// inertness.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createCultureWorld,
  advanceCultureWorld,
  stepCultureWorld,
  cultureWorldHash,
  cultureWorldSimLaw,
  standingCultureWorld,
  cultureLifeField,
  cultureSoilAt,
  cultureSoilWither,
  cultureSwarmContactPairs,
  dealCultureHandCurrent,
  CULTURE_BODY_CAP,
  CULTURE_STEP_HZ,
  CULTURE_LIFE_STEP_DIVISOR,
  CULTURE_SOIL_WITHER_STEPS,
} from './cultureWorld.mjs';
import {
  createCultureSoil,
  stepCultureSoil,
  cultureSoilSample,
  cultureSoilCell,
  cultureSoilLiving,
  cultureSoilHash,
  CULTURE_SOIL_WITHER_S,
} from './cultureSoil.mjs';
import { cultureHash } from './dishLife.mjs';
import { STAGE_COLS, STAGE_ROWS } from './dishLifeStage.mjs';
import { hashU01, CH } from './kernel/rng.js';

let groups = 0;
const ok = (name) => {
  groups++;
  console.log(`  ok ${groups} — ${name}`);
};
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b} (tol ${tol})`);

/** A published-field-shaped ground at the shared grid, all dead unless written. */
const mkField = (cells = {}) => {
  const level = new Float32Array(STAGE_COLS * STAGE_ROWS);
  for (const [k, v] of Object.entries(cells)) level[Number(k)] = v;
  return { cols: STAGE_COLS, rows: STAGE_ROWS, gen: 0, level, activity: new Float32Array(level.length) };
};
const idx = (cx, cy) => cy * STAGE_COLS + cx;
/** The centre of a shared-grid cell in body space (20 px per cell). */
const at = (cx, cy) => [cx * 20 + 10, cy * 20 + 10];

/** A bare body table in the world's shape. */
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
    b.radius[i] = p.radius || 0;
  });
  return b;
};

/** A deterministic moving population from the seeded stream (the K3 suites' deal). */
const deal = (world, n) => {
  const b = world.bodies;
  for (let i = 0; i < n; i++) {
    const u = (k) => hashU01(world.seed, CH.dyn, i * 16 + k);
    b.alive[i] = 1;
    b.x[i] = 60 + u(0) * 1800;
    b.y[i] = 60 + u(1) * 960;
    b.vx[i] = (u(2) - 0.5) * 4;
    b.vy[i] = (u(3) - 0.5) * 4;
    b.mass[i] = 0.5 + u(4) * 1.5;
    b.radius[i] = 3 + u(5) * 6;
  }
  b.count = n;
  return world;
};

/**
 * A lattice of RESTING bodies 100 px apart (beyond every boids radius, so no
 * force reaches them and they never move), each on a cell centre.
 */
const lattice = (world) => {
  const b = world.bodies;
  let n = 0;
  for (let gy = 0; gy < 11; gy++)
    for (let gx = 0; gx < 19; gx++, n++) {
      b.alive[n] = 1;
      b.x[n] = 50 + gx * 100;
      b.y[n] = 50 + gy * 100;
      b.mass[n] = 1;
      b.radius[n] = 4;
    }
  b.count = n;
  return world;
};

// 1 — born with the world, on the world's own clock, stamping nothing.
{
  assert.equal(CULTURE_SOIL_WITHER_S, 4, 'the phasing default: wither over 4 s on dead ground');
  assert.equal(CULTURE_STEP_HZ, 120);
  assert.equal(CULTURE_SOIL_WITHER_STEPS, 480, '4 s at the world’s 120 Hz step');
  const w = createCultureWorld({ seed: 7 });
  assert.equal(w.soil.step, 0);
  assert.equal(w.soil.killed, 0);
  assert.equal(w.soil.wither.length, CULTURE_BODY_CAP, 'one clock per body slot, at the table’s ceiling');
  assert.ok(
    w.soil.wither.every((v) => v === 0),
    'every clock born at 0',
  );
  assert.equal(cultureWorldSimLaw(w), 'js-exact', 'the soil stamps nothing of its own');
  assert.equal(w.simLaw, 'js-exact');
  const feeds = [1 / 60, 0.004, 0.021, 1 / 30, 0.0009, 0.05, 1 / 60, 0.013];
  for (let r = 0; r < 60; r++) {
    advanceCultureWorld(w, feeds[r % feeds.length]);
    assert.equal(w.soil.step, w.step, 'one soil step per world step, always — the 120 Hz clock');
  }
  assert.equal(w.soil.killed, 0, 'an empty table: the ground kills nothing');
  ok('born with the world: clocks at 0, soil.step == world.step across irregular feeds, no stamp');
}

// 2 — the ground reading, hand-computed.
{
  const decaying = 1 - (3 - 1) / 7; // state 3 under CULTURE_RULE's 8 states: still living ground
  const f = mkField({
    [idx(10, 10)]: 1,
    [idx(11, 10)]: decaying,
    [idx(10, 11)]: 1,
    [idx(0, 0)]: 1,
    [idx(1, 0)]: 1,
  });
  // an alive cell
  {
    const s = cultureSoilSample(f, ...at(10, 10));
    assert.equal(s.cell, idx(10, 10));
    assert.equal(s.living, true);
    assert.equal(s.level, 1);
    assert.equal(s.decay, 0);
    near(s.fertility, (1 + Math.fround(decaying) + 1) / 9, 1e-12, 'fertility: the 3×3 mean level');
    assert.equal(s.fortune, s.fertility, 'living ground: fortune is the fertility');
  }
  // a decaying cell still lives
  {
    const s = cultureSoilSample(f, ...at(11, 10));
    assert.equal(s.living, true, 'decaying ground is not dead ground');
    assert.equal(s.level, Math.fround(decaying));
    near(s.decay, 1 - Math.fround(decaying), 1e-12, 'decay: 1 − level');
    assert.ok(s.fortune > 0);
  }
  // a dead cell beside living ones: dead ground, though its neighbourhood feeds
  {
    const s = cultureSoilSample(f, ...at(11, 11));
    assert.equal(s.living, false);
    assert.equal(s.level, 0);
    assert.equal(s.decay, 1);
    near(s.fertility, (1 + Math.fround(decaying) + 1) / 9, 1e-12, 'its neighbours still read as fertility');
    assert.equal(s.fortune, -1, 'dead ground: fortune −1, mortal');
  }
  // the corner: beyond-grid neighbours count dead, over all nine
  {
    const s = cultureSoilSample(f, ...at(0, 0));
    near(s.fertility, 2 / 9, 1e-12, 'the rim is dead soil in the neighbourhood too');
  }
  // cell edges: a point stands on the cell its floor names
  assert.equal(cultureSoilCell(f, 19.999, 0), 0);
  assert.equal(cultureSoilCell(f, 20, 0), 1);
  assert.equal(cultureSoilCell(f, 1919.9, 1079.9), idx(STAGE_COLS - 1, STAGE_ROWS - 1));
  // beyond the grid is dead ground (the rim law), and so is a non-finite point
  const full = mkField(Object.fromEntries(Array.from({ length: STAGE_COLS * STAGE_ROWS }, (_, i) => [i, 1])));
  for (const [x, y] of [
    [-0.001, 500],
    [1920, 500],
    [500, -1],
    [500, 1080],
    [-120, -120],
    [NaN, 5],
  ]) {
    assert.equal(cultureSoilCell(full, x, y), -1, `(${x}, ${y}) stands on no cell`);
    assert.equal(cultureSoilLiving(full, x, y), false, `(${x}, ${y}) is dead ground, even beside a living dish`);
    const s = cultureSoilSample(full, x, y);
    assert.deepEqual([s.living, s.level, s.fertility, s.decay, s.fortune], [false, 0, 0, 1, -1]);
  }
  ok('the ground reading: living / level / 3×3 fertility / decay / fortune; decaying lives; the rim is dead');
}

// 3 — the read door: the published field, read-only, refusing loudly.
{
  const w = createCultureWorld({ seed: 11 });
  for (let s = 0; s < 120 * 3 + 7; s++) stepCultureWorld(w);
  const field = cultureLifeField(w);
  assert.ok(field.gen > 0, 'a matured soil');
  const before = cultureWorldHash(w);
  let living = 0;
  for (let cy = 0; cy < STAGE_ROWS; cy++)
    for (let cx = 0; cx < STAGE_COLS; cx++) {
      const s = cultureSoilAt(w, ...at(cx, cy));
      assert.equal(s.gen, field.gen, 'the door reads the published generation');
      assert.equal(s.level, field.level[idx(cx, cy)], 'the door reads the published level, cell for cell');
      assert.equal(s.living, field.level[idx(cx, cy)] > 0);
      if (s.living) living++;
    }
  assert.ok(living > 0 && living < STAGE_COLS * STAGE_ROWS, 'the soil is a mix of living and dead ground');
  assert.equal(cultureWorldHash(w), before, 'asking the ground changes nothing');
  const held = cultureSoilAt(w, 500, 500);
  const heldCopy = { ...held };
  for (let s = 0; s < 30; s++) stepCultureWorld(w);
  assert.deepEqual(held, heldCopy, 'a reading is a fresh object, safe to hold across steps');
  for (const [x, y] of [
    [NaN, 1],
    [1, Infinity],
    [undefined, 1],
    ['5', 5],
  ])
    assert.throws(() => cultureSoilAt(w, x, y), /bad soil point/, `refuses (${String(x)}, ${String(y)})`);
  assert.throws(() => cultureSoilWither(w, 0), /no dealt body/, 'no body dealt, no wither to read');
  ok('the read door: the published field cell for cell, read-only, fresh readings, loud refusals');
}

// 4 — the wither law's exact timing (the core, over a fixed ground).
{
  const f = mkField({ [idx(5, 5)]: 1, [idx(6, 5)]: 1 - 6 / 7 /* the last decay state: still living */ });
  const W = CULTURE_SOIL_WITHER_STEPS;
  // dead ground, sustained: alive through 479, gone at 480
  {
    const b = mkBodies([{ x: at(20, 20)[0], y: at(20, 20)[1] }]);
    const soil = createCultureSoil(1);
    for (let s = 1; s < W; s++) {
      stepCultureSoil(b, soil, f, W);
      assert.equal(b.alive[0], 1, `alive after ${s} dead steps`);
      assert.equal(soil.wither[0], s);
    }
    stepCultureSoil(b, soil, f, W);
    assert.equal(b.alive[0], 0, 'gone on the 480th sustained step');
    assert.equal(soil.wither[0], 0, 'a dead body has no clock');
    assert.equal(soil.killed, 1);
    assert.equal(soil.step, W);
    // the dead are skipped and never rise, even on living ground
    b.x[0] = at(5, 5)[0];
    b.y[0] = at(5, 5)[1];
    for (let s = 0; s < 10; s++) stepCultureSoil(b, soil, f, W);
    assert.equal(b.alive[0], 0, 'living ground does not resurrect');
    assert.equal(soil.wither[0], 0);
    assert.equal(soil.killed, 1, 'a body dies once');
  }
  // living ground (alive or the last decay state) never withers
  {
    const b = mkBodies([
      { x: at(5, 5)[0], y: at(5, 5)[1] },
      { x: at(6, 5)[0], y: at(6, 5)[1] },
    ]);
    const soil = createCultureSoil(2);
    for (let s = 0; s < 3 * W; s++) stepCultureSoil(b, soil, f, W);
    assert.deepEqual([b.alive[0], b.alive[1]], [1, 1], 'living ground keeps its bodies');
    assert.deepEqual([soil.wither[0], soil.wither[1]], [0, 0]);
  }
  // sustained means sustained: one living step restarts the clock
  {
    const b = mkBodies([{ x: at(20, 20)[0], y: at(20, 20)[1] }]);
    const soil = createCultureSoil(1);
    for (let s = 0; s < W - 1; s++) stepCultureSoil(b, soil, f, W);
    assert.equal(soil.wither[0], W - 1);
    b.x[0] = at(5, 5)[0];
    b.y[0] = at(5, 5)[1];
    stepCultureSoil(b, soil, f, W);
    assert.equal(soil.wither[0], 0, 'one step on living ground restarts the clock');
    b.x[0] = at(20, 20)[0];
    b.y[0] = at(20, 20)[1];
    for (let s = 0; s < W - 1; s++) stepCultureSoil(b, soil, f, W);
    assert.equal(b.alive[0], 1, 'a fresh 479 does not kill');
    stepCultureSoil(b, soil, f, W);
    assert.equal(b.alive[0], 0, 'a fresh 480 does');
  }
  // beyond the grid withers like dead ground; a dead-dealt body is never judged
  {
    const b = mkBodies([
      { x: -60, y: 500 },
      { x: at(20, 20)[0], y: at(20, 20)[1], alive: false },
    ]);
    const soil = createCultureSoil(2);
    for (let s = 0; s < W; s++) stepCultureSoil(b, soil, f, W);
    assert.equal(b.alive[0], 0, 'the wrap pad is no soil');
    assert.equal(soil.wither[1], 0, 'the dead carry no clock');
    assert.equal(soil.killed, 1, 'only the living can be killed');
  }
  ok('the wither law: alive at 479, gone at 480; one living step restarts; the dead never rise; the rim kills');
}

// 5 — the read discipline in a real world: an oracle reading the published field
// after every whole world step (so AFTER a generation that completes in it) matches
// every clock and every death, step for step, over 30 s of a living soil.
{
  const w = lattice(createCultureWorld({ seed: 20261123 }));
  const n = w.bodies.count;
  const px = Array.from(w.bodies.x.subarray(0, n));
  const py = Array.from(w.bodies.y.subarray(0, n));
  const clock = new Array(n).fill(0);
  const alive = new Array(n).fill(1);
  let deaths = 0;
  let coincidentReset = 0;
  for (let s = 1; s <= 120 * 30; s++) {
    const prevLevel = Float32Array.from(w.life.field.level);
    stepCultureWorld(w);
    const level = w.life.field.level;
    assert.equal(w.life.gen, Math.floor(s / CULTURE_LIFE_STEP_DIVISOR));
    for (let i = 0; i < n; i++) {
      if (!alive[i]) continue;
      const c = Math.floor(py[i] / 20) * STAGE_COLS + Math.floor(px[i] / 20);
      if (level[c] > 0) {
        if (s % CULTURE_LIFE_STEP_DIVISOR === 0 && !(prevLevel[c] > 0) && clock[i] > 0) coincidentReset++;
        clock[i] = 0;
      } else if (++clock[i] >= CULTURE_SOIL_WITHER_STEPS) {
        alive[i] = 0;
        clock[i] = 0;
        deaths++;
      }
      assert.equal(w.bodies.alive[i], alive[i], `body ${i} alive at step ${s}`);
      assert.equal(w.soil.wither[i], clock[i], `body ${i} clock at step ${s}`);
    }
  }
  for (let i = 0; i < n; i++) {
    assert.equal(w.bodies.x[i], px[i], 'the lattice rests: the soil moved no one');
    assert.equal(w.bodies.y[i], py[i]);
  }
  assert.ok(deaths > 0, `dead zones kill (${deaths} of ${n} died)`);
  assert.ok(deaths < n, 'living ground keeps the rest');
  assert.equal(w.soil.killed, deaths);
  assert.ok(coincidentReset > 0, 'the run exercised ground reviving on a generation step (the ordering bites)');
  ok(
    `the read discipline: the last completed generation, judged after it, step for step (${deaths}/${n} withered in 30 s)`,
  );
}

// 6 — never drawn, and only the alive flag written.
{
  const src = readFileSync(new URL('./cultureSoil.mjs', import.meta.url), 'utf8');
  const imports = [...src.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]);
  assert.deepEqual(imports, ['./cultureSwarm.mjs'], 'the soil imports no GL, no render, no DOM — only the dish extent');
  const w = deal(createCultureWorld({ seed: 5 }), 50);
  for (let s = 0; s < 45; s++) stepCultureWorld(w);
  const b = w.bodies;
  const snap = (k) => Array.from(b[k].subarray(0, b.count));
  const before = { x: snap('x'), y: snap('y'), vx: snap('vx'), vy: snap('vy'), mass: snap('mass'), r: snap('radius') };
  const lvl = Float32Array.from(w.life.field.level);
  const act = Float32Array.from(w.life.field.activity);
  const ch = cultureHash(w.life);
  const W = CULTURE_SOIL_WITHER_STEPS;
  for (let s = 0; s < 2 * W; s++) stepCultureSoil(b, w.soil, w.life.field, W);
  assert.ok(w.soil.killed > 0, 'the core ran long enough to kill');
  const after = { x: snap('x'), y: snap('y'), vx: snap('vx'), vy: snap('vy'), mass: snap('mass'), r: snap('radius') };
  assert.deepEqual(after, before, 'no position, velocity, mass, or radius bit moved: the soil only kills');
  assert.deepEqual(w.life.field.level, lvl, 'the soil never writes the ground it reads');
  assert.deepEqual(w.life.field.activity, act);
  assert.equal(cultureHash(w.life), ch, 'the culture itself is untouched');
  ok('never drawn: no GL/render imports; the soil writes only alive flags and its own state');
}

// 7 — a body the ground killed is gone from every mover.
{
  const w = createCultureWorld({ seed: 3 });
  const b = w.bodies;
  // two overlapping discs out in the wrap pad — beyond the grid, dead ground always
  b.alive[0] = 1;
  b.x[0] = -50;
  b.y[0] = -50;
  b.radius[0] = 8;
  b.alive[1] = 1;
  b.x[1] = -45;
  b.y[1] = -50;
  b.radius[1] = 8;
  b.count = 2;
  assert.equal(cultureSwarmContactPairs(w).length, 1, 'a touching pair');
  // body 0's clock one step short of the span: the next judgement kills it
  w.soil.wither[0] = CULTURE_SOIL_WITHER_STEPS - 1;
  stepCultureWorld(w);
  assert.equal(b.alive[0], 0, 'withered and gone');
  assert.equal(b.alive[1], 1, 'its neighbour has a clock of its own');
  assert.equal(w.soil.wither[1], 1);
  assert.equal(cultureSoilWither(w, 0), 0, 'a dead body reads no wither');
  near(cultureSoilWither(w, 1), 1 / CULTURE_SOIL_WITHER_STEPS, 1e-15, 'the wither read: clock over span');
  assert.equal(cultureSwarmContactPairs(w).length, 0, 'the dead disc touches no one');
  const frozen = [b.x[0], b.y[0], b.vx[0], b.vy[0]];
  dealCultureHandCurrent(w, { x: -50, y: -50, vx: 4, vy: 0 });
  for (let s = 0; s < 10; s++) stepCultureWorld(w);
  assert.deepEqual([b.x[0], b.y[0], b.vx[0], b.vy[0]], frozen, 'no swarm, hand, or solver reaches the dead');
  assert.notEqual(b.x[1], -45, 'while the living neighbour is stirred');
  ok('gone from every mover: no contacts, no integration, no push after the ground kills');
}

// 8 — determinism, with the soil in the world hash.
{
  const feeds = [0.007, 1 / 60, 0.033, 0.0025, 0.05, 1 / 45, 0.011];
  const run = () => {
    // a resting lattice (bodies 0..208) with a seeded moving crowd dealt after it
    const w = lattice(createCultureWorld({ seed: 42 }));
    const bt = w.bodies;
    const base = bt.count;
    for (let i = 0; i < 60; i++) {
      const u = (k) => hashU01(w.seed, CH.dyn, i * 16 + k);
      const j = base + i;
      bt.alive[j] = 1;
      bt.x[j] = 60 + u(0) * 1800;
      bt.y[j] = 60 + u(1) * 960;
      bt.vx[j] = (u(2) - 0.5) * 4;
      bt.vy[j] = (u(3) - 0.5) * 4;
      bt.mass[j] = 0.5 + u(4) * 1.5;
      bt.radius[j] = 3 + u(5) * 6;
    }
    bt.count = base + 60;
    for (let r = 0; r < 1500; r++) advanceCultureWorld(w, feeds[r % feeds.length]);
    return w;
  };
  const a = run();
  const b = run();
  assert.ok(a.step > 2 * CULTURE_SOIL_WITHER_STEPS, 'the run is long enough to wither');
  const n = a.bodies.count;
  assert.ok(a.soil.killed > 0, `the population lost bodies to dead ground (${a.soil.killed})`);
  assert.deepEqual(Array.from(a.bodies.alive.subarray(0, n)), Array.from(b.bodies.alive.subarray(0, n)));
  assert.deepEqual(Array.from(a.soil.wither.subarray(0, n)), Array.from(b.soil.wither.subarray(0, n)));
  assert.deepEqual(Array.from(a.bodies.x.subarray(0, n)), Array.from(b.bodies.x.subarray(0, n)));
  assert.equal(cultureSoilHash(a.soil, n), cultureSoilHash(b.soil, n));
  assert.equal(cultureWorldHash(a), cultureWorldHash(b), 'twin worlds: bit-identical, the soil inside the hash');
  const c = run();
  c.soil.wither[c.bodies.alive.indexOf(1)] += 1;
  assert.notEqual(cultureWorldHash(c), cultureWorldHash(a), 'the hash covers a single wither clock');
  const d = run();
  d.soil.killed += 1;
  assert.notEqual(cultureWorldHash(d), cultureWorldHash(a), 'the hash covers the kill count');
  ok(`determinism: twin worlds bit-identical through ${a.soil.killed} withering deaths, the soil hashed in`);
}

// 9 — gate-off inertness: no world stands, so no soil judges anything anywhere.
{
  assert.equal(standingCultureWorld(), null, 'no standing world in this process: no soil anywhere');
  const w = createCultureWorld({ seed: 1 });
  assert.equal(standingCultureWorld(), null, 'creating a world registers nothing — the shell owns standing');
  assert.ok(w.soil, 'the soil is a part of a world instance, never a module-level singleton');
  ok('gate-off inertness: the soil exists only as a created world’s state');
}

console.log(`cultureSoil.selfcheck: OK (${groups} groups) — CULTURE Phase 4, the soil (Life as ground)`);
