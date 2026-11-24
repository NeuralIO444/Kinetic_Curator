// node src/engine/cultureMoth.selfcheck.mjs
// CULTURE Phase 5, slice B — the moth, the flagship citizen, living in the dish end to end (the body plan in
// engine/cultureBody.mjs, the recipe and the roster in engine/cultureLab.mjs, the world's cast door and step).
//   1. the moth plan assembled: head, thorax, abdomen, two wings and two antennae as one tree of joints, five
//      declared sockets (four born occupied, one free for Phase 6's looted limb, cap 5), a look per part, graphic not a
//      sticker, a wingspan past two body-lengths — and the same body-reading LOIS gates every body on
//   2. the wingbeat is the plan's anatomy: wing tips beat three times a stroke, antennae five, at their own weights
//   3. DAVIS writes the moth's recipe: whole, in bounds, leaned ±15 % off a native that is the flitterer's and not
//      the dish creature's; LOIS admits a moth and refuses a bad one (a sticker moth, a broken socket table)
//   4. the Lab casts fresh through the slice A path: a roster of plans, slots counted on, the dish slots cast exactly
//      as the default sheet casts them, refusals loud; the gate's take sheet is dish creatures then moths
//   5. it lives: 10 seeds × 60 s of moths stay inside the dish, keep every part, swim, and hold their wings
//      within the joints' reach
//   6. it stands on the soil, feels the Queen's field and the performer's hand like every citizen
//   7. determinism: twin worlds with moths bit-identical; the hash tells a moth from a dish creature
import assert from 'node:assert/strict';
import {
  assembleCultureBody,
  cultureBodyRestPose,
  cultureBodyFaults,
  cultureBodyPlan,
  CULTURE_BODY_PLANS,
  CULTURE_PLAN_DISH,
  CULTURE_PLAN_MOTH,
  CULTURE_LOOK_SHAPES,
} from './cultureBody.mjs';
import {
  curatorCast,
  curatorAudition,
  davisWrite,
  loisGate,
  normalizeCultureCastRoster,
  normalizeCultureCastSheet,
  CULTURE_CAST_SHEET,
  CULTURE_TAKE_SHEET,
  CULTURE_NATIVE_RECIPES,
  CULTURE_DAVIS_LEAN,
} from './cultureLab.mjs';
import { CULTURE_RECIPE_BOUNDS, stepCultureCitizenMuscle } from './cultureMotion.mjs';
import {
  createCultureWorld,
  stepCultureWorld,
  castCultureTake,
  cultureCitizenAt,
  cultureWorldHash,
  dealCultureField,
  dealCultureHandCurrent,
  CULTURE_SOIL_WITHER_STEPS,
} from './cultureWorld.mjs';
import { CULTURE_SWARM_WORLD_W, CULTURE_SWARM_WORLD_H } from './cultureSwarm.mjs';
import { STAGE_COLS, STAGE_ROWS } from './dishLifeStage.mjs';

let checks = 0;
const ok = (name) => {
  checks++;
  console.log(`  ok ${checks} — ${name}`);
};
const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const MOTHS = { plan: CULTURE_PLAN_MOTH, count: 3 };
const mothWorld = (seed, count = 3) => {
  const w = createCultureWorld({ seed });
  castCultureTake(w, { plan: CULTURE_PLAN_MOTH, count });
  return w;
};
const liveField = () => ({
  cols: STAGE_COLS,
  rows: STAGE_ROWS,
  gen: 0,
  level: new Float32Array(STAGE_COLS * STAGE_ROWS).fill(1),
});
/** Each part's distance along the joints from the head: the farthest it can stand from it (the links are hard). */
const pathRests = (body) => {
  const out = new Array(body.parts.length).fill(0);
  for (const l of body.links) out[l.b] = out[l.a] + l.rest;
  return out;
};

// 1 — the moth plan, assembled.
{
  assert.ok(CULTURE_BODY_PLANS.includes(CULTURE_PLAN_MOTH));
  const b = assembleCultureBody(CULTURE_PLAN_MOTH);
  assert.ok(Object.isFrozen(b) && Object.isFrozen(b.parts) && Object.isFrozen(b.parts[0]), 'frozen all the way down');
  assert.deepEqual(
    b.parts.map((p) => p.id),
    [
      'head',
      'spine.0',
      'spine.1',
      'spine.2',
      'antenna.l.0',
      'antenna.l.1',
      'antenna.r.0',
      'antenna.r.1',
      'wing.l.0',
      'wing.l.1',
      'wing.l.2',
      'wing.r.0',
      'wing.r.1',
      'wing.r.2',
    ],
    'head, thorax, abdomen, tail; antennae off the head; wings off the thorax',
  );
  assert.deepEqual(
    b.parts.map((p) => p.radius),
    [12, 18, 14, 9, 4, 3, 4, 3, 22, 18, 12, 22, 18, 12],
  );
  assert.deepEqual(
    b.parts.map((p) => p.parent),
    [-1, 0, 1, 2, 0, 4, 0, 6, 1, 8, 9, 1, 11, 12],
    'one tree: the spine chains off the head; the antennae hang off the head; the wings hang off the thorax',
  );
  assert.equal(b.links.length, b.parts.length - 1);
  for (const l of b.links)
    assert.ok(close(l.rest, (b.parts[l.a].radius + b.parts[l.b].radius) * 0.82), 'rests: the overlap rule');
  // RE-PIN (slice B QA, Matt's ruling 2026-11-23 — changed law): sockets limited by the PLAN (§2.10): five, four born
  // occupied by the kind they accept, ONE free (accepting any kind the plan uses) so the flagship can wear a looted limb
  assert.equal(b.socketCap, 5);
  assert.deepEqual(
    b.sockets.map((s) => [s.id, s.part, s.accepts, s.occupant]),
    [
      ['head.l', 0, 'antenna', 4],
      ['head.r', 0, 'antenna', 6],
      ['spine.0.l', 1, 'wing', 8],
      ['spine.0.r', 1, 'wing', 11],
      ['spine.1.free', 2, 'any', -1],
    ],
  );
  assert.equal(b.sockets.filter((s) => s.occupant < 0).length, 1, 'exactly one free socket');
  assert.equal(b.sockets.length, b.socketCap, 'the declared sockets fill the plan’s cap');
  assert.deepEqual(cultureBodyFaults(b), [], 'a free socket accepting any kind the plan uses is lawful');
  const bogus = { ...b, sockets: b.sockets.map((s) => (s.id === 'spine.1.free' ? { ...s, accepts: 'claw' } : s)) };
  assert.ok(cultureBodyFaults(bogus).includes('socket spine.1.free: accepts'), 'a kind the body lacks is a fault');
  assert.equal(b.parts.length, 14, 'a free socket draws no part');
  assert.deepEqual(Object.keys(b.limbs).sort(), ['antenna', 'wing']);
  assert.ok(b.parts.filter((p) => p.role === 'limb').every((p) => p.limb === 'wing' || p.limb === 'antenna'));
  // graphic, not a sticker, and never a drawn bug: only the four-mark vocabulary, tone roles, no colour, no copy
  assert.deepEqual([...new Set(b.parts.map((p) => p.look.shape))].sort(), ['bar', 'dot', 'ring', 'square']);
  for (const p of b.parts) {
    assert.ok(CULTURE_LOOK_SHAPES.includes(p.look.shape));
    assert.deepEqual(Object.keys(p.look).sort(), ['shape', 'tone']);
  }
  assert.equal(b.parts[0].look.shape, 'dot', 'a small ink dot for a head');
  assert.deepEqual(cultureBodyFaults(b), []);
  // a wingspan past two body-lengths: a layout wider than it is long
  const wingTip = (id) => b.parts.findIndex((p) => p.id === id);
  const pose = cultureBodyRestPose(b, 0, 0, 0);
  const span = Math.abs(pose[wingTip('wing.l.2')].y - pose[wingTip('wing.r.2')].y);
  assert.ok(
    span > 2 * b.length * 0.95,
    `wingspan ${span.toFixed(0)} px against a body-length of ${b.length.toFixed(0)}`,
  );
  assert.ok(close(b.length, 12 + 9 + (12 + 18) * 0.82 + (18 + 14) * 0.82 + (14 + 9) * 0.82));
  // the body reading catches a moth gone wrong: the sockets table, a limb kind the body does not have
  const noKinds = { ...b, limbs: { wing: b.limbs.wing } };
  assert.ok(cultureBodyFaults(noKinds).some((f) => /antenna|accepts/.test(f) || /socket head\.l/.test(f)));
  const wrongKind = { ...b, sockets: b.sockets.map((s, i) => (i === 2 ? { ...s, accepts: 'antenna' } : s)) };
  assert.ok(
    cultureBodyFaults(wrongKind).includes('socket spine.0.l: occupant'),
    'a wing in an antenna socket is a fault',
  );
  // RE-PIN (slice B QA, changed law): the cap is the PLAN's, not the body's own claim — lowering the body's cap no
  // longer makes four sockets "over"; it is a forged cap. A body past the plan's four is over however its cap reads.
  assert.ok(cultureBodyFaults({ ...b, socketCap: 3 }).includes("socket cap is not the plan's"));
  const extra = (id) => ({ id, part: 0, angle: 0, accepts: 'antenna', occupant: -1 });
  const over = { ...b, socketCap: 6, sockets: [...b.sockets, extra('x.1'), extra('x.2')] };
  assert.ok(
    cultureBodyFaults(over).includes('sockets over the plan cap'),
    'six sockets and a cap of six: over the plan',
  );
  assert.ok(cultureBodyFaults(over).includes('socket x.1: not in the plan'));
  assert.throws(() => assembleCultureBody(CULTURE_PLAN_MOTH, { scale: 1.2 }), /outside KINETIC's band/);
  assert.throws(() => cultureBodyPlan('wasp'), /unknown body plan/);
  ok(
    'the moth plan assembled: a tree of 14 joined parts, five declared sockets (four occupied, one free), a layout of marks wider than long',
  );
}

// 2 — the wingbeat is anatomy.
{
  const w = mothWorld(7, 1);
  const c = w.citizens.list[0];
  const kinds = c.limbTips.map((t) => [c.body.parts[t.part].limb, t.weight, t.beat]).sort();
  assert.deepEqual(kinds, [
    ['antenna', 0.3, 5],
    ['antenna', 0.3, 5],
    ['wing', 1, 3],
    ['wing', 1, 3],
  ]);
  // the muscle, alone: count a wing tip's paddle zero-crossings over one stroke — three beats, six crossings
  const wing = c.limbTips.find((t) => c.body.parts[t.part].limb === 'wing');
  const i = c.first + wing.part;
  const stroke = c.recipe.seasoning.timing;
  const before = c.age;
  let prevSign = 0;
  let crossings = 0;
  const lagged = {
    ...c,
    // isolate the paddle: no thrust, no tone
    recipe: { ...c.recipe, physics: { ...c.recipe.physics, thrust: 0, tone: 0 } },
  };
  for (let s = 0; s < stroke; s++) {
    const bodies = w.bodies;
    const vx0 = bodies.vx[i];
    const vy0 = bodies.vy[i];
    stepCultureCitizenMuscle(bodies, w.life.field, lagged);
    const dvx = bodies.vx[i] - vx0;
    const dvy = bodies.vy[i] - vy0;
    const perp = Math.abs(dvx) + Math.abs(dvy) > 1e-12 ? Math.atan2(dvy, dvx) : 0;
    const sign = Math.sign(Math.cos(perp - lagged.heading - Math.PI / 2)) || prevSign;
    if (prevSign && sign !== prevSign) crossings++;
    prevSign = sign;
    lagged.age += 1;
  }
  assert.ok(before === 0 && crossings >= 5 && crossings <= 7, `a wing beat ~6 half-cycles per stroke (${crossings})`);
  ok('the wingbeat is the plan’s anatomy: wings beat three a stroke at full weight, antennae five at 0.3');
}

// 3 — DAVIS and LOIS for the moth.
{
  const native = CULTURE_NATIVE_RECIPES[CULTURE_PLAN_MOTH];
  assert.equal(native.name, 'moth/native');
  assert.notDeepEqual(native, CULTURE_NATIVE_RECIPES[CULTURE_PLAN_DISH], 'a temperament of its own');
  assert.ok(native.seasoning.timing < CULTURE_NATIVE_RECIPES[CULTURE_PLAN_DISH].seasoning.timing, 'a shorter stroke');
  const a = davisWrite(CULTURE_PLAN_MOTH, 7, 4);
  assert.deepEqual(a, davisWrite(CULTURE_PLAN_MOTH, 7, 4), 'seeded, never chance');
  for (const g of Object.keys(CULTURE_RECIPE_BOUNDS))
    for (const k of Object.keys(CULTURE_RECIPE_BOUNDS[g])) {
      const [lo, hi] = CULTURE_RECIPE_BOUNDS[g][k];
      const v = a.recipe[g][k];
      assert.ok(v >= lo && v <= hi, `${g}.${k} in bounds`);
      if (k !== 'timing')
        assert.ok(
          Math.abs(v - native[g][k]) <= Math.abs(native[g][k]) * CULTURE_DAVIS_LEAN + 1e-9 || v === lo || v === hi,
        );
    }
  const field = liveField();
  const cand = curatorAudition(CULTURE_PLAN_MOTH, 7, 0, 0);
  assert.equal(cand.body.plan, CULTURE_PLAN_MOTH);
  assert.equal(cand.recipe.name, 'moth/native');
  const good = loisGate(cand, field);
  assert.equal(good.admitted, true, `LOIS admits a moth (${[...good.faults]})`);
  // she gates the moth by the same body reading: a sticker moth, a broken socket table, a part outside the dish
  const sticker = loisGate(
    {
      ...cand,
      body: { ...cand.body, parts: cand.body.parts.map((p) => ({ ...p, look: { shape: 'dot', tone: 'ink' } })) },
    },
    field,
  );
  assert.equal(sticker.admitted, false);
  assert.ok(sticker.faults.includes('a sticker: fewer than three shapes'));
  const crammed = loisGate({ ...cand, body: { ...cand.body, socketCap: 2 } }, field);
  assert.equal(crammed.admitted, false);
  // RE-PIN (slice B QA, changed law): the cap is the plan's; a body's lowered cap is a forged cap
  assert.ok(crammed.faults.includes("socket cap is not the plan's"));
  assert.ok(loisGate({ ...cand, x: 1, y: 1 }, field).faults.includes('a part outside the dish'));
  ok('DAVIS writes the moth a whole, seeded, in-bounds recipe of its own; LOIS admits a moth and refuses a bad one');
}

// 4 — the Lab casts fresh: rosters.
{
  assert.deepEqual(
    normalizeCultureCastRoster(CULTURE_CAST_SHEET),
    [{ plan: 'dish', count: 3 }],
    'the slice A shape is a roster of one',
  );
  assert.deepEqual(
    normalizeCultureCastRoster(CULTURE_TAKE_SHEET).map((e) => [e.plan, e.count]),
    // RE-PIN (slice C, changed law: two strandbeests walk in after the swimmers) — was: [['dish', 3], ['moth', 2]]
    [
      ['dish', 3],
      ['moth', 2],
      ['strandbeest', 2],
    ],
    'the gate’s take sheet: the first citizen, then the flagship, then the strandbeests',
  );
  assert.throws(() => normalizeCultureCastRoster({ roster: [] }), /at least one entry/);
  assert.throws(() => normalizeCultureCastRoster({ roster: [{ plan: 'wasp', count: 1 }] }), /unknown body plan/);
  assert.throws(() => normalizeCultureCastRoster({ roster: [{ plan: 'moth', count: 1.5 }] }), /whole number/);
  assert.throws(
    () =>
      normalizeCultureCastRoster({
        roster: [
          { plan: 'dish', count: 40 },
          { plan: 'moth', count: 40 },
        ],
      }),
    /at most 64/,
  );
  assert.deepEqual(normalizeCultureCastSheet({ plan: 'moth', count: 1 }), { plan: 'moth', count: 1 });
  for (const seed of [7, 42, 2024]) {
    const f = liveField();
    const take = curatorCast(seed, f, CULTURE_TAKE_SHEET);
    const again = curatorCast(seed, f, CULTURE_TAKE_SHEET);
    assert.equal(JSON.stringify(take), JSON.stringify(again), 'the same take casts the same cast');
    const dishDefault = curatorCast(seed, f, CULTURE_CAST_SHEET).members;
    const dishInTake = take.members.filter((m) => m.body.plan === 'dish');
    assert.deepEqual(
      dishInTake.map((m) => [m.slot, m.x, m.y, m.heading, m.praise]),
      dishDefault.map((m) => [m.slot, m.x, m.y, m.heading, m.praise]),
      'the dish slots are cast exactly as the default sheet casts them: the first citizen is undisturbed',
    );
    const slots = take.members.map((m) => m.slot);
    assert.deepEqual(
      slots,
      [...slots].sort((x, y) => x - y),
      'slots count on through the roster, in order',
    );
    assert.ok(
      take.members.filter((m) => m.body.plan === 'moth').every((m) => m.slot >= 3),
      'moths take the later slots',
    );
    // RE-PIN (slice C, changed law: the take sheet casts 7 — two strandbeests after the moths) — was: === 5
    assert.ok(take.members.length + take.refused.length === 7);
  }
  // fresh each take: another seed is another cast, never a standing zoo
  const a = curatorCast(7, liveField(), CULTURE_TAKE_SHEET).members.map((m) => [m.x, m.y]);
  const b = curatorCast(8, liveField(), CULTURE_TAKE_SHEET).members.map((m) => [m.x, m.y]);
  assert.notDeepEqual(a, b);
  const w = createCultureWorld({ seed: 7 });
  const r = castCultureTake(w, CULTURE_TAKE_SHEET);
  // RE-PIN (slice C, changed law: the take sheet casts 7) — was: 5
  assert.equal(r.cast + r.refused.length, 7);
  assert.deepEqual(
    w.citizens.list.map((c) => c.plan),
    [...w.citizens.list.map((c) => c.plan)].sort((x, y) => (x === y ? 0 : x === 'dish' ? -1 : 1)),
  );
  assert.throws(() => castCultureTake(w, CULTURE_TAKE_SHEET), /already cast/);
  ok(
    'the Lab casts fresh through the slice A path: rosters of plans, dish slots undisturbed, refusals loud, once per world',
  );
}

// 5 — it lives (20 seeds × 60 s).
{
  let worst = 0;
  let minSpeed = Infinity;
  let maxExcess = -Infinity;
  let cast = 0;
  for (let seed = 1; seed <= 10; seed++) {
    const w = mothWorld(seed);
    const path = w.citizens.list.map(() => 0);
    let prev = w.citizens.list.map((c) => [w.bodies.x[c.first], w.bodies.y[c.first]]);
    for (let s = 0; s < 60 * 120; s++) {
      stepCultureWorld(w);
      if (s % 12 !== 0) continue;
      w.citizens.list.forEach((c, k) => {
        const x = w.bodies.x[c.first];
        const y = w.bodies.y[c.first];
        path[k] += Math.hypot(x - prev[k][0], y - prev[k][1]);
        prev[k] = [x, y];
        worst = Math.max(worst, -x, x - CULTURE_SWARM_WORLD_W, -y, y - CULTURE_SWARM_WORLD_H);
        for (let j = 1; j < c.n; j++)
          maxExcess = Math.max(
            maxExcess,
            Math.hypot(w.bodies.x[c.first + j] - x, w.bodies.y[c.first + j] - y) - pathRests(c.body)[j],
          );
      });
    }
    w.citizens.list.forEach((c, k) => {
      cast++;
      assert.equal(c.alive, 1, `seed ${seed}: a moth lives`);
      for (let j = 0; j < c.n; j++) assert.equal(w.bodies.alive[c.first + j], 1, 'every part stays');
      minSpeed = Math.min(minSpeed, path[k] / 60);
    });
  }
  assert.equal(cast, 30);
  assert.ok(worst <= 0, `no head crosses the rim (worst ${worst.toFixed(1)} px past)`);
  assert.ok(minSpeed > 40, `every moth swims (slowest ${minSpeed.toFixed(0)} px/s)`);
  assert.ok(
    maxExcess < 16,
    `every part holds within its joints’ reach, the links stretching under 16 px (${maxExcess.toFixed(1)}; probed 13)`,
  );
  ok('it lives: 10 seeds × 60 s × 3 moths — all alive, no part lost, none past the rim, all swimming, reach held');
}

// 6 — soil, Queen's field, performer's hand.
{
  // dead ground kills the head on the Phase 4 clock; a lost wing does not kill the moth
  const w = mothWorld(7, 2);
  const [m0, m1] = w.citizens.list;
  m0.recipe = Object.freeze({
    ...m0.recipe,
    drives: { wander: 0, ground: 0, rim: 0 },
    physics: { ...m0.recipe.physics, thrust: 0, paddle: 0, tone: 0 },
  });
  const pose = cultureBodyRestPose(m0.body, 600, -80, 0);
  for (let k = 0; k < m0.n; k++) {
    w.bodies.x[m0.first + k] = pose[k].x;
    w.bodies.y[m0.first + k] = pose[k].y;
    w.bodies.vx[m0.first + k] = 0;
    w.bodies.vy[m0.first + k] = 0;
  }
  w.bodies.alive[m1.first + 8] = 0; // a wing root gone
  const s0 = w.step;
  while (w.step < s0 + CULTURE_SOIL_WITHER_STEPS + 4) stepCultureWorld(w);
  assert.equal(m0.alive, 0, 'the moth on dead ground dies');
  assert.equal(m0.cause, 'soil');
  assert.equal(m1.alive, 1, 'a lost wing does not kill a moth');
  // the Queen's field and the hand's current: twin worlds
  const run = (withForces) => {
    const t = mothWorld(42, 1);
    const c = t.citizens.list[0];
    c.recipe = Object.freeze({
      ...c.recipe,
      drives: { wander: 0, ground: 0, rim: 0 },
      physics: { ...c.recipe.physics, thrust: 0, paddle: 0, tone: 0 },
    });
    const hx = t.bodies.x[c.first];
    const hy = t.bodies.y[c.first];
    if (withForces) {
      dealCultureField(t, { kind: 'magnet', x: Math.min(1800, hx + 400), y: hy });
      dealCultureHandCurrent(t, { x: hx, y: hy, vx: 0, vy: 3 });
    }
    for (let s = 0; s < 240; s++) stepCultureWorld(t);
    return [t.bodies.x[c.first] - hx, t.bodies.y[c.first] - hy];
  };
  const [bx, by] = run(false);
  const [fx, fy] = run(true);
  assert.ok(
    Math.hypot(fx - bx, fy - by) > 20,
    'the field and the hand move a moth that has no muscle: they are forces',
  );
  ok(
    'it stands on the soil (dead ground kills the head, a lost wing does not) and feels the Queen’s field and the hand',
  );
}

// 7 — determinism and the hash.
{
  const a = createCultureWorld({ seed: 11 });
  const b = createCultureWorld({ seed: 11 });
  castCultureTake(a, CULTURE_TAKE_SHEET);
  castCultureTake(b, CULTURE_TAKE_SHEET);
  for (let s = 0; s < 2400; s++) {
    stepCultureWorld(a);
    stepCultureWorld(b);
  }
  for (const col of ['x', 'y', 'vx', 'vy', 'alive']) assert.deepEqual(a.bodies[col], b.bodies[col]);
  assert.equal(cultureWorldHash(a), cultureWorldHash(b));
  assert.equal(
    JSON.stringify(cultureCitizenAt(a, a.citizens.list.length - 1)),
    JSON.stringify(cultureCitizenAt(b, b.citizens.list.length - 1)),
    'and the moth’s layout',
  );
  const dishOnly = createCultureWorld({ seed: 11 });
  castCultureTake(dishOnly, CULTURE_CAST_SHEET);
  assert.notEqual(cultureWorldHash(dishOnly), cultureWorldHash(createCultureWorld({ seed: 11 })));
  const m = createCultureWorld({ seed: 11 });
  castCultureTake(m, MOTHS);
  assert.notEqual(cultureWorldHash(m), cultureWorldHash(dishOnly), 'the hash tells a moth from a dish creature');
  const layout = cultureCitizenAt(m, 0);
  assert.equal(layout.parts.length, 14);
  assert.deepEqual(
    [...new Set(layout.parts.map((p) => p.look.shape))].sort(),
    ['bar', 'dot', 'ring', 'square'],
    'the layout reads as an assembled arrangement of marks',
  );
  ok('determinism: twin worlds with moths bit-identical, layouts too; the hash tells a moth from a dish creature');
}

console.log(`cultureMoth.selfcheck: ${checks}/7 groups OK`);
