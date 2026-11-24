// node src/engine/cultureCitizens.selfcheck.mjs
// CULTURE Phase 5, slice A — the first citizen, the dish creature, living in the world end to end
// (engine/cultureCitizens.mjs + the world's cast door and step, engine/cultureWorld.mjs).
//   1. an uncast world steps exactly as Phase 4's did: the citizen layer counts and moves nothing
//      (an independent replay of the Phase 4 step order, bit for bit)
//   2. the cast door: the Lab's admitted members dealt whole — contiguous slots at the rest pose,
//      still, at the recipe's masses; joints at their declared rests; the citizen enrolled; the feel
//      source registered; a second cast and an overflowing cast refused with nothing written
//   3. it lives: over a minute every citizen swims by its recipe (a muscle-less twin barely
//      drifts), stays inside the dish (the rim), keeps its body whole, and its age counts swarm steps
//   4. it stands on the soil: on dead ground the head withers on the Phase 4 clock and the
//      citizen is dead one step behind, cause 'soil'; its muscle stops; a lost tail part does not
//      kill it
//   5. it feels the Queen's field and the performer's hand: twin worlds, one with a magnet / a
//      current — the citizen's parts move toward / along them
//   6. one body across the seam: the swarm wraps discs alone; the citizen's parts are rehomed to
//      the anchor's side before the solver joins them, and the body is never yanked across the dish
//   7. determinism and the hash: twin worlds bit-identical through irregular feeds; the hash
//      covers the cast, the heading, the age, the recipe, life and death
//   8. the layout (graphic, not a sticker): a read door that changes nothing, a look per part, the
//      feel pose at rest at birth, refusals; the debug preview draws marks and never text
//   9. the gate: no standing world, citizens never born — only the Lab's door casts
import assert from 'node:assert/strict';
import {
  createCultureWorld,
  stepCultureWorld,
  advanceCultureWorld,
  castCultureTake,
  cultureCitizenAt,
  cultureWorldHash,
  dealCultureField,
  dealCultureHandCurrent,
  cultureFluidDensity,
  standingCultureWorld,
  CULTURE_FLUID_STEP_DIVISOR,
  CULTURE_LIFE_STEP_DIVISOR,
  CULTURE_SWARM_STEP_DIVISOR,
  CULTURE_SOIL_WITHER_STEPS,
  CULTURE_COUPLING,
  CULTURE_WORLD_ASPECT_HW,
} from './cultureWorld.mjs';
import {
  cultureCitizenLayout,
  rehomeCultureCitizens,
  cultureCitizensHash,
  cultureCitizensDebugSvg,
  CULTURE_WRAP_SPAN_X,
} from './cultureCitizens.mjs';
import { cultureBodyRestPose } from './cultureBody.mjs';
import { curatorCast, CULTURE_CAST_SHEET, CULTURE_NATIVE_RECIPES } from './cultureLab.mjs';
import { cultureRecipeMasses, normalizeCultureRecipe, CULTURE_FEEL_SOURCE_ID } from './cultureMotion.mjs';
import { getMotionSource, POSE_IDENTITY, composePose } from './motionCore/index.js';
import { stepFluid } from './dishFluid.mjs';
import { stepCulture } from './dishLife.mjs';
import { injectFluidBirths } from './dishFluidCouple.mjs';
import { stepCultureSwarm, CULTURE_SWARM_WORLD_W, CULTURE_SWARM_WORLD_H } from './cultureSwarm.mjs';
import { stepCultureSolver } from './cultureSolver.mjs';
import { stepCultureFields, cultureFieldMagnets, CULTURE_FIELD_FLUID_PULL } from './cultureFields.mjs';
import { stepCultureHandCurrents } from './cultureHand.mjs';
import { stepCultureSoil } from './cultureSoil.mjs';
import { mkRng } from './prng.js';

let checks = 0;
const ok = (name) => {
  checks++;
  console.log(`  ok ${checks} — ${name}`);
};
const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const cast = (seed) => {
  const w = createCultureWorld({ seed });
  castCultureTake(w);
  return w;
};
const INERT = normalizeCultureRecipe({
  ...CULTURE_NATIVE_RECIPES.dish,
  name: 'test/inert',
  drives: { wander: 0, ground: 0, rim: 0 },
  physics: { ...CULTURE_NATIVE_RECIPES.dish.physics, thrust: 0, paddle: 0, tone: 0 },
});
const headOf = (w, c) => [w.bodies.x[c.first], w.bodies.y[c.first]];
/** Deal a population of plain movers (the Phase 4 suites' way: straight into the table). */
function dealMovers(w, n, seed) {
  const r = mkRng(seed);
  const b = w.bodies;
  for (let k = 0; k < n; k++) {
    const i = b.count++;
    b.alive[i] = 1;
    b.x[i] = 200 + r() * 1500;
    b.y[i] = 150 + r() * 800;
    b.vx[i] = (r() - 0.5) * 4;
    b.vy[i] = (r() - 0.5) * 4;
    b.radius[i] = 4 + r() * 5;
  }
}

// 1 — an uncast world steps exactly as Phase 4's did.
{
  const a = createCultureWorld({ seed: 9 });
  const b = createCultureWorld({ seed: 9 });
  dealMovers(a, 60, 3);
  dealMovers(b, 60, 3);
  dealCultureField(a, { kind: 'magnet', x: 900, y: 500 });
  dealCultureField(b, { kind: 'magnet', x: 900, y: 500 });
  // The Phase 4 step, replayed independently (no citizen layer, no rehome).
  const phase4Step = (w) => {
    w.step += 1;
    if (w.step % CULTURE_FLUID_STEP_DIVISOR === 0)
      stepFluid(w.fluid, {
        culture: w.life.field,
        couple: CULTURE_COUPLING,
        magnets: cultureFieldMagnets(w.fields),
        pull: CULTURE_FIELD_FLUID_PULL,
        aspectHW: CULTURE_WORLD_ASPECT_HW,
      });
    if (w.step % CULTURE_LIFE_STEP_DIVISOR === 0) {
      injectFluidBirths(w.life, cultureFluidDensity(w), CULTURE_COUPLING, w.seed);
      stepCulture(w.life);
    }
    if (w.step % CULTURE_SWARM_STEP_DIVISOR === 0) {
      stepCultureFields(w.bodies, w.fields, cultureFluidDensity(w));
      stepCultureHandCurrents(w.bodies, w.hand);
      stepCultureSwarm(w.bodies);
      stepCultureSolver(w.bodies, w.statics, w.links);
      w.solver.step += 1;
    }
    stepCultureSoil(w.bodies, w.soil, w.life.field, CULTURE_SOIL_WITHER_STEPS);
  };
  for (let s = 0; s < 600; s++) {
    if (s === 100) {
      dealCultureHandCurrent(a, { x: 700, y: 500, vx: 3, vy: 1 });
      dealCultureHandCurrent(b, { x: 700, y: 500, vx: 3, vy: 1 });
    }
    stepCultureWorld(a);
    phase4Step(b);
  }
  for (const col of ['alive', 'x', 'y', 'vx', 'vy', 'mass', 'radius'])
    assert.deepEqual(a.bodies[col], b.bodies[col], `the ${col} column, bit for bit`);
  assert.deepEqual(a.soil.wither, b.soil.wither);
  assert.equal(a.citizens.step, a.bodies.step, 'the citizen layer ran on the swarm cadence');
  assert.equal(a.citizens.list.length, 0);
  assert.equal(a.citizens.cast, 0, 'uncast');
  b.citizens.step = a.citizens.step;
  assert.equal(cultureWorldHash(a), cultureWorldHash(b), 'the same world, hash and all');
  ok('an uncast world steps exactly as Phase 4: bodies, soil and hash bit for bit against an independent replay');
}

// 2 — the cast door.
{
  const w = createCultureWorld({ seed: 7 });
  dealMovers(w, 5, 1); // marks already in the dish: the cast appends after them
  const lab = curatorCast(7, w.life.field, CULTURE_CAST_SHEET);
  const report = castCultureTake(w);
  assert.equal(report.cast, lab.members.length);
  assert.deepEqual(JSON.stringify(report.refused), JSON.stringify(lab.refused));
  assert.ok(report.cast >= 2, 'the first citizens arrive');
  assert.equal(w.citizens.cast, 1);
  let first = 5;
  lab.members.forEach((m, k) => {
    const c = w.citizens.list[k];
    assert.equal(c.first, first, 'contiguous slots, in cast order, after the existing marks');
    assert.equal(c.n, m.body.parts.length);
    assert.equal(c.plan, 'dish');
    assert.deepEqual(c.recipe, m.recipe, 'the recipe instilled at birth is DAVIS’s, untouched');
    assert.ok(Object.isFrozen(c.recipe), 'instilled: frozen for life');
    assert.equal(c.praise, m.praise);
    assert.equal(c.heading, m.heading);
    assert.equal(c.age, 0);
    assert.equal(c.alive, 1);
    assert.equal(c.bornStep, 0);
    const pose = cultureBodyRestPose(m.body, m.x, m.y, m.heading);
    const masses = cultureRecipeMasses(m.body, m.recipe);
    m.body.parts.forEach((p, j) => {
      const i = first + j;
      assert.equal(w.bodies.alive[i], 1);
      assert.equal(w.bodies.x[i], Math.fround(pose[j].x));
      assert.equal(w.bodies.y[i], Math.fround(pose[j].y));
      assert.equal(w.bodies.vx[i], 0);
      assert.equal(w.bodies.vy[i], 0);
      assert.equal(w.bodies.mass[i], Math.fround(masses[j]));
      assert.equal(w.bodies.radius[i], Math.fround(p.radius));
    });
    first += c.n;
  });
  assert.equal(w.bodies.count, first);
  const nLinks = lab.members.reduce((n, m) => n + m.body.links.length, 0);
  assert.equal(w.links.count, nLinks);
  let l = 0;
  for (const c of w.citizens.list)
    for (const link of c.body.links) {
      assert.equal(w.links.a[l], c.first + link.a);
      assert.equal(w.links.b[l], c.first + link.b);
      assert.equal(w.links.rest[l], Math.fround(link.rest), 'joints at their declared rests');
      l++;
    }
  assert.ok(getMotionSource(CULTURE_FEEL_SOURCE_ID), 'the cast opened Motion Core’s door for the feel layer');
  const h = cultureWorldHash(w);
  assert.throws(() => castCultureTake(w), /already cast — the Lab casts fresh each take/);
  assert.equal(cultureWorldHash(w), h, 'a refused cast writes nothing');
  // Overflow: a table too full for the cast refuses whole.
  const full = createCultureWorld({ seed: 7 });
  full.bodies.count = full.bodies.capacity - 5;
  const hf = cultureWorldHash(full);
  assert.throws(() => castCultureTake(full), /the cast needs \d+ bodies; the table holds 5 more/);
  assert.equal(cultureWorldHash(full), hf);
  assert.equal(full.citizens.cast, 0, 'nothing written: still uncast');
  ok(
    'the cast door: dealt whole at rest, recipe masses, declared rests; a second or overflowing cast refused, nothing written',
  );
}

// 3 — it lives.
{
  for (const seed of [7, 42, 2024]) {
    const w = cast(seed);
    const t = cast(seed);
    for (const c of t.citizens.list) c.recipe = INERT; // a muscle-less twin
    const u = cast(seed); // the same, soil-immune (wither clocks cleared before every step)
    for (const c of u.citizens.list) c.recipe = INERT;
    const pathU = w.citizens.list.map(() => 0);
    let prevU = u.citizens.list.map((c) => headOf(u, c));
    const path = w.citizens.list.map(() => 0);
    const pathT = t.citizens.list.map(() => 0);
    let prev = w.citizens.list.map((c) => headOf(w, c));
    let prevT = t.citizens.list.map((c) => headOf(t, c));
    let maxSpan = 0;
    for (let s = 0; s < 60 * 120; s++) {
      stepCultureWorld(w);
      stepCultureWorld(t);
      u.soil.wither.fill(0);
      stepCultureWorld(u);
      if (s % 12 !== 0) continue;
      u.citizens.list.forEach((c, k) => {
        const [x, y] = headOf(u, c);
        pathU[k] += Math.hypot(x - prevU[k][0], y - prevU[k][1]);
        prevU[k] = [x, y];
      });
      w.citizens.list.forEach((c, k) => {
        const [x, y] = headOf(w, c);
        path[k] += Math.hypot(x - prev[k][0], y - prev[k][1]);
        prev[k] = [x, y];
        if (c.alive) {
          assert.ok(
            x >= 0 && x < CULTURE_SWARM_WORLD_W && y >= 0 && y < CULTURE_SWARM_WORLD_H,
            'the head stays in the dish',
          );
          for (let j = 1; j < c.n; j++)
            if (w.bodies.alive[c.first + j])
              maxSpan = Math.max(
                maxSpan,
                Math.hypot(w.bodies.x[c.first + j] - x, w.bodies.y[c.first + j] - y) / c.body.length,
              );
        }
      });
      t.citizens.list.forEach((c, k) => {
        const [x, y] = headOf(t, c);
        pathT[k] += Math.hypot(x - prevT[k][0], y - prevT[k][1]);
        prevT[k] = [x, y];
      });
    }
    w.citizens.list.forEach((c, k) => {
      if (!c.alive) return;
      assert.ok(path[k] / 60 > 40, `seed ${seed} citizen ${k} swims (${(path[k] / 60).toFixed(1)} px/s)`);
      // FIX-FORWARD (slice B, from slice A QA): the twin comparison above leans on the soil — an inert twin
      // drifts onto dead ground and withers (some seeds, within 12–30 s), after which it "barely drifts" because it
      // is DEAD. The assertion is kept exactly as it was; what is added is (a) wither-specific assertions, so a soil
      // mutation is caught for what it is: the swimmer's head never withered, and a twin that died, died of the
      // soil; and (b) a soil-free muscle assertion against a third, soil-immune twin (its wither clocks cleared every
      // step). The honest number there: absent the soil an inert body still drifts on its own flocking (about half
      // the swimmer's rate), so the recipe is asserted to out-travel it by 1.5× over the cast, not 3×.
      assert.equal(w.bodies.alive[c.first], 1, 'the swimmer’s head was not withered');
      assert.ok(w.soil.wither[c.first] < CULTURE_SOIL_WITHER_STEPS, 'its wither clock never ran out');
      assert.equal(u.citizens.list[k].alive, 1, 'the soil-immune twin never dies');
      // the slice A comparison, tolerance unchanged (3×), placed AFTER the wither-specific assertions so that a soil
      // mutation is named by those (the swimmer withered / the clock ran out) before this one can fire on it
      assert.ok(path[k] > 3 * pathT[k], 'its recipe moves it: a muscle-less twin barely drifts');
      assert.equal(c.age, w.citizens.step, 'age counts swarm steps of life');
    });
    const sumPath = w.citizens.list.reduce((n, _c, k) => n + path[k], 0);
    const sumU = pathU.reduce((n, v) => n + v, 0);
    assert.ok(
      sumPath > 1.5 * sumU,
      `soil-free: its recipe out-travels an inert body (${(sumPath / sumU).toFixed(2)}×)`,
    );
    assert.ok(maxSpan < 1.05, `the body holds together (max part reach ${maxSpan.toFixed(3)} body-lengths)`);
    assert.ok(
      w.citizens.list.some((c) => c.alive),
      'citizens live',
    );
  }
  ok('it lives: each citizen swims by its recipe, stays in the dish, keeps its body whole; age counts its steps');
}

// 4 — it stands on the soil.
{
  const w = cast(7);
  const c = w.citizens.list[0];
  c.recipe = INERT;
  // Move the whole body onto dead ground: the wrap pad above the dish (beyond the grid is dead).
  const pose = cultureBodyRestPose(c.body, 600, -60, 0);
  for (let k = 0; k < c.n; k++) {
    w.bodies.x[c.first + k] = pose[k].x;
    w.bodies.y[c.first + k] = pose[k].y;
  }
  const other = w.citizens.list[1];
  // Kill a tail part of another citizen directly: it lives on without it.
  w.bodies.alive[other.first + 4] = 0;
  const s0 = w.step;
  let headDiedAt = -1;
  while (w.step < s0 + CULTURE_SOIL_WITHER_STEPS + 4) {
    stepCultureWorld(w);
    if (headDiedAt < 0 && !w.bodies.alive[c.first]) headDiedAt = w.step;
  }
  assert.equal(
    headDiedAt,
    s0 + CULTURE_SOIL_WITHER_STEPS,
    'the head withers on the Phase 4 clock (4 s of dead ground)',
  );
  assert.equal(c.alive, 0, 'the citizen is its head: dead');
  assert.equal(c.cause, 'soil');
  const nextCitizenStep = Math.ceil((headDiedAt + 1) / CULTURE_SWARM_STEP_DIVISOR) * CULTURE_SWARM_STEP_DIVISOR;
  assert.equal(c.diedStep, nextCitizenStep, 'seen one step behind, at the next citizen step');
  assert.equal(w.citizens.died, 1);
  assert.equal(other.alive, 1, 'a lost tail part does not kill a citizen');
  // A dead citizen's muscle stops: its age freezes and its heading holds.
  const age = c.age;
  const heading = c.heading;
  c.recipe = CULTURE_NATIVE_RECIPES.dish;
  for (let s = 0; s < 240; s++) stepCultureWorld(w);
  assert.equal(c.age, age);
  assert.equal(c.heading, heading);
  assert.equal(c.alive, 0, 'the dead never rise');
  ok(
    "it stands on the soil: dead ground withers the head on the 4 s clock; dead one step behind, cause 'soil'; muscle stops",
  );
}

// 5 — it feels the Queen's field and the performer's hand.
{
  const a = cast(7);
  const b = cast(7);
  const c = a.citizens.list[0];
  const [hx, hy] = headOf(a, c);
  dealCultureField(b, { kind: 'magnet', x: hx + 150, y: hy });
  for (let s = 0; s < 240; s++) {
    stepCultureWorld(a);
    stepCultureWorld(b);
  }
  let dx = 0;
  for (let k = 0; k < c.n; k++) dx += b.bodies.x[c.first + k] - a.bodies.x[c.first + k];
  assert.ok(dx / c.n > 10, `the Queen's magnet pulls the citizen toward it (${(dx / c.n).toFixed(1)} px)`);
  const a2 = cast(7);
  const b2 = cast(7);
  dealCultureHandCurrent(b2, { x: hx - 40, y: hy, vx: 4, vy: 0 });
  for (let s = 0; s < 60; s++) {
    stepCultureWorld(a2);
    stepCultureWorld(b2);
  }
  let hdx = 0;
  for (let k = 0; k < c.n; k++) hdx += b2.bodies.x[c.first + k] - a2.bodies.x[c.first + k];
  assert.ok(hdx / c.n > 20, `the hand's current carries the citizen along it (${(hdx / c.n).toFixed(1)} px)`);
  ok("it feels the Queen's field and the hand's current: ordinary bodies to both");
}

// 6 — one body across the seam.
{
  // The law, on a table: a part wrapped by one span comes back to its anchor's side.
  const w = cast(7);
  const c = w.citizens.list[0];
  const b = w.bodies;
  const snap = Float32Array.from(b.x);
  b.x[c.first + 3] += CULTURE_WRAP_SPAN_X;
  b.x[c.first + 6] -= CULTURE_WRAP_SPAN_X;
  rehomeCultureCitizens(b, w.citizens);
  const wrapped3 = Math.fround(snap[c.first + 3] + CULTURE_WRAP_SPAN_X);
  const wrapped6 = Math.fround(snap[c.first + 6] - CULTURE_WRAP_SPAN_X);
  assert.equal(b.x[c.first + 3], Math.fround(wrapped3 - CULTURE_WRAP_SPAN_X), 'back by exactly one span');
  assert.equal(b.x[c.first + 6], Math.fround(wrapped6 + CULTURE_WRAP_SPAN_X));
  assert.ok(close(b.x[c.first + 3], snap[c.first + 3], 1e-3) && close(b.x[c.first + 6], snap[c.first + 6], 1e-3));
  for (let i = 0; i < b.count; i++)
    if (i !== c.first + 3 && i !== c.first + 6) assert.equal(b.x[i], snap[i], 'nothing else moved');
  // In the world: drive a muscle-less citizen west across the seam at full speed.
  const s = cast(7);
  const d = s.citizens.list[0];
  d.recipe = INERT;
  const pose = cultureBodyRestPose(d.body, -100, 540, Math.PI);
  for (let k = 0; k < d.n; k++) {
    s.bodies.x[d.first + k] = pose[k].x;
    s.bodies.y[d.first + k] = pose[k].y;
    s.bodies.vx[d.first + k] = -8;
  }
  let crossed = false;
  for (let k = 0; k < 120; k++) {
    stepCultureWorld(s);
    const [hx, hy] = headOf(s, d);
    if (hx > CULTURE_SWARM_WORLD_W) crossed = true;
    for (let j = 1; j < d.n; j++) {
      const r = Math.hypot(s.bodies.x[d.first + j] - hx, s.bodies.y[d.first + j] - hy);
      assert.ok(r < 1.05 * d.body.length, `never yanked across the dish (part ${j} at ${r.toFixed(0)} px)`);
    }
  }
  assert.ok(crossed, 'the head crossed the seam (and the body with it)');
  ok('one body across the seam: wrapped parts come home to their anchor before the solver joins them');
}

// 7 — determinism and the hash.
{
  const a = cast(11);
  const b = cast(11);
  const r = mkRng(77);
  for (let k = 0; k < 900; k++) {
    const dt = 0.002 + r() * 0.05;
    advanceCultureWorld(a, dt);
    advanceCultureWorld(b, dt);
    if (k === 300) {
      dealCultureHandCurrent(a, { x: 900, y: 500, vx: -2, vy: 3 });
      dealCultureHandCurrent(b, { x: 900, y: 500, vx: -2, vy: 3 });
    }
  }
  assert.equal(cultureWorldHash(a), cultureWorldHash(b), 'twin worlds, irregular feeds, bit-identical');
  assert.equal(cultureCitizensHash(a.citizens), cultureCitizensHash(b.citizens));
  assert.notEqual(cultureWorldHash(cast(11)), cultureWorldHash(cast(12)), 'another take, another cast');
  const base = cultureWorldHash(a);
  const c = b.citizens.list[0];
  const probe = (mut, undo, what) => {
    mut();
    assert.notEqual(cultureWorldHash(b), base, `the hash covers ${what}`);
    undo();
    assert.equal(cultureWorldHash(b), base);
  };
  const h0 = c.heading;
  probe(
    () => (c.heading = h0 + 1e-12),
    () => (c.heading = h0),
    'the heading, bit-exact',
  );
  probe(
    () => (c.age += 1),
    () => (c.age -= 1),
    'the age',
  );
  const rc = c.recipe;
  probe(
    () =>
      (c.recipe = normalizeCultureRecipe({ ...rc, seasoning: { ...rc.seasoning, squash: rc.seasoning.squash / 2 } })),
    () => (c.recipe = rc),
    'a seasoning dial',
  );
  probe(
    () => (c.alive = 0),
    () => (c.alive = 1),
    'life',
  );
  probe(
    () => (c.cause = 'soil'),
    () => (c.cause = ''),
    'the cause of death',
  );
  probe(
    () => (b.citizens.cast = 0),
    () => (b.citizens.cast = 1),
    'the cast',
  );
  ok('determinism: twin worlds bit-identical; the hash covers the cast, heading, age, recipe, life and death');
}

// 8 — the layout.
{
  const w = cast(7);
  const h = cultureWorldHash(w);
  const L0 = cultureCitizenAt(w, 0);
  assert.equal(cultureWorldHash(w), h, 'reading changes nothing');
  assert.equal(L0.parts.length, 11);
  assert.ok(
    L0.parts.every((p) => p.pose.sx === 1 && p.pose.sy === 1 && p.pose.dAlpha === 0),
    'born at rest (anchor law)',
  );
  assert.deepEqual(Object.keys(L0.parts[0].pose).sort(), Object.keys(POSE_IDENTITY).sort(), "Motion Core's Pose");
  assert.ok(new Set(L0.parts.map((p) => p.look.shape)).size >= 3, 'an assembled layout of marks, not a sticker');
  for (let s = 0; s < 600; s++) stepCultureWorld(w);
  const L = cultureCitizenAt(w, 0);
  assert.ok(
    L.parts.some((p) => p.pose.sx !== 1),
    'alive, the feel layer reads',
  );
  for (const p of L.parts)
    if (p.role !== 'head') assert.ok(close(p.pose.sx * p.pose.sy, 1, 1e-12), 'squash keeps volume');
  L.parts[0].x = -1;
  assert.notEqual(cultureCitizenAt(w, 0).parts[0].x, -1, 'a fresh object, safe to hold');
  assert.throws(() => cultureCitizenAt(w, 99), /no citizen at index "99"/);
  assert.throws(() => cultureCitizenAt(w, -1), /no citizen/);
  const svg = cultureCitizensDebugSvg(w.citizens.list.map((_, i) => cultureCitizenAt(w, i)));
  assert.ok(svg.startsWith('<svg') && svg.includes('<ellipse') && svg.includes('<rect') && svg.includes('<line'));
  assert.ok(!/<text/i.test(svg), 'no copy is drawn');
  ok(
    'the layout: a read-only door, a look and a Motion Core pose per part, born at rest; the debug preview draws marks only',
  );
}

// 9 — the gate.
{
  assert.equal(standingCultureWorld(), null, 'no standing world: the engine casts nothing on its own');
  const w = createCultureWorld({ seed: 7 });
  advanceCultureWorld(w, 2);
  assert.equal(w.citizens.list.length, 0, 'citizens are never born — only the Lab’s door casts');
  assert.equal(w.bodies.count, 0);
  ok('the gate: no standing world; a world is born uncast and stays so until the Lab casts it');
}

// 10 — FIX-FORWARD (slice B QA): the layout composes the gait OVER the creature's own pose, per part.
{
  const w = cast(7);
  for (let s = 0; s < 90; s++) stepCultureWorld(w);
  const c = w.citizens.list[0];
  const wither = (i) => w.soil.wither[i] / 480;
  const feelOnly = cultureCitizenLayout(w.bodies, c, wither);
  const gp = (k) => ({ dx: 3 + k, dy: -2, dRot: 5, sx: 1.2, sy: 0.9, dAlpha: 0.1 });
  const laid = cultureCitizenLayout(w.bodies, c, wither, gp);
  laid.parts.forEach((p, k) => {
    assert.deepEqual(p.gait, gp(k), 'the part carries its gait pose');
    assert.equal(
      JSON.stringify(p.pose),
      JSON.stringify({ ...composePose(feelOnly.parts[k].pose, gp(k)) }),
      `part ${k}: the layout's pose is the feel composed with the gait, not the feel alone`,
    );
    assert.notEqual(JSON.stringify(p.pose), JSON.stringify(feelOnly.parts[k].pose), `part ${k}: and it differs`);
  });
  assert.equal(feelOnly.parts[0].gait, null, 'no gait standing: the feel layer, untouched');
  ok('the layout composes the gait over the feel, per part');
}

console.log(`cultureCitizens.selfcheck: ${checks}/10 groups OK`);
