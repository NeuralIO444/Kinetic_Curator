// node src/engine/cultureEcology.selfcheck.mjs
// CULTURE Phase 6, slice A — the ecology turns on: life and death (engine/cultureEcology.mjs + the world's step,
// read doors and hash, engine/cultureWorld.mjs).
//   1. the defaults and the dormant dish: every constant is the phasing table's (or a recorded builder default) at the
//      world's 120 Hz; an uncast world counts nothing and lands nothing; the cast enrols one life per citizen — 50 fat,
//      the plan's sockets (dish 4, two free; moth 5, one free, any kind the plan uses; strandbeest 6, none free)
//   2. creatures eat beats: no reading / a silent room lands nothing; an audible room lands one morsel per whole beat on
//      the 'culture-morsel' channel inside the margin; a head that reaches a morsel eats it, +10 fat exactly; a full
//      citizen does not; the nearest head wins; a morsel spoils at 10 s
//   3. senses: the nearest morsel within 3 body-lengths is the citizen's food; beyond, or full, none; the desire is the
//      drives' plus exactly the hunger pull
//   4. upkeep: 1 fat/s the body (2 ticks a step), +0.5 fat/s each living looted limb (1 tick), born limbs free; the dead
//      pay nothing
//   5. starvation: fat 0 sustained 5 s (600 steps) kills, cause 'starvation'; any fat restarts the clock
//   6. predation: the law alone (fat < 30 and ratio ≥ 1.2, both sides of both lines) and in the dish (the toucher's head
//      on any living part; the smaller dies, cause 'predation', its killer named; a full or small toucher kills nothing)
//   7. the corpse: no muscle; its look fades in data (the layout's decay and alpha); gone at exactly 30 s; lootable at
//      29.99 s, not after
//   8. looting: a free plan socket of the matching kind, first in plan order; the limb re-dealt on the looter with its
//      ORIGINAL look and radii, joined at the overlap rule; the corpse loses it; the looter pays for it; no free socket,
//      no loot; a moth never takes a dish limb but wears a moth's in its free socket; a beast re-sockets a lost leg;
//      LOIS reads the worn body and an over-plan body is refused loudly
//   9. determinism and the hash: twin fed worlds bit-identical over a minute; the hash covers every piece of new state;
//      over four seeds a fed dish outlives an unfed one (which the new law empties within the minute)
//  10. RULED (Matt, 2026-11-24): a strandbeest's planted feet eat too — a planted foot (the stance band) eats, a
//      swinging foot never; the nearest mouth wins and a tie goes by the canonical order
import assert from 'node:assert/strict';
import {
  createCultureWorld,
  stepCultureWorld,
  castCultureTake,
  setCultureRoom,
  cultureWorldHash,
  cultureCitizenAt,
  cultureCitizenLife,
  cultureMorsels,
  standingCultureWorld,
  CULTURE_STEP_HZ,
} from './cultureWorld.mjs';
import {
  CULTURE_ECOLOGY_STEP_HZ,
  CULTURE_FAT_TICKS,
  CULTURE_MORSEL_FAT,
  CULTURE_MORSEL_TICKS,
  CULTURE_UPKEEP_BODY_FAT_S,
  CULTURE_UPKEEP_LIMB_FAT_S,
  CULTURE_UPKEEP_BODY_TICKS,
  CULTURE_UPKEEP_LIMB_TICKS,
  CULTURE_STARVE_S,
  CULTURE_STARVE_STEPS,
  CULTURE_CORPSE_S,
  CULTURE_CORPSE_STEPS,
  CULTURE_PREDATION_FAT,
  CULTURE_PREDATION_FAT_TICKS,
  CULTURE_PREDATION_RATIO,
  CULTURE_FAT_BIRTH,
  CULTURE_FAT_BIRTH_TICKS,
  CULTURE_FAT_MAX_TICKS,
  CULTURE_MORSEL_LIFE_STEPS,
  CULTURE_MORSEL_MARGIN,
  CULTURE_MORSEL_RADIUS,
  CULTURE_HUNGER_PULL,
  landCultureMorsel,
  stepCultureEating,
  stepCulturePredation,
  stepCultureLooting,
  stepCultureMetabolism,
  stepCultureFoodSense,
  culturePredationAllowed,
  cultureCitizenSize,
  cultureWornBody,
  cultureEcologyHash,
  cultureMouths,
  cultureMouthReaching,
} from './cultureEcology.mjs';
import { cultureBeastFeet } from './cultureBeast.mjs';
import { cultureBodyRestPose, cultureBodyFaults, CULTURE_BODY_REST_OVERLAP } from './cultureBody.mjs';
import { cultureSenses, cultureDesire, cultureSenseRange } from './cultureMotion.mjs';
import { CULTURE_CITIZEN_CAUSES } from './cultureCitizens.mjs';
import { CULTURE_SWARM_WORLD_W, CULTURE_SWARM_WORLD_H } from './cultureSwarm.mjs';
import { hashU01 } from './kernel/rng.js';

let checks = 0;
const ok = (msg) => {
  checks++;
  console.log(`  ok ${checks} — ${msg}`);
};

const DISH2_MOTH2 = {
  roster: [
    { plan: 'dish', count: 2 },
    { plan: 'moth', count: 2 },
  ],
};
const world = (seed = 7, sheet = { plan: 'dish', count: 3 }) => {
  const w = createCultureWorld({ seed });
  castCultureTake(w, sheet);
  return w;
};
/** Lay a citizen's born parts at its rest pose at (x, y, heading), still. */
const place = (w, idx, x, y, heading = 0) => {
  const c = w.citizens.list[idx];
  const pose = cultureBodyRestPose(c.body, x, y, heading);
  for (let k = 0; k < c.n; k++) {
    w.bodies.x[c.first + k] = pose[k].x;
    w.bodies.y[c.first + k] = pose[k].y;
    w.bodies.vx[c.first + k] = 0;
    w.bodies.vy[c.first + k] = 0;
  }
  c.heading = heading;
};
/** Kill a citizen by the starvation law (fat 0, the clock one step short), through the metabolism. */
const starveNow = (w, idx) => {
  const life = w.ecology.lives[idx];
  life.fat = 0;
  life.starve = CULTURE_STARVE_STEPS - 1;
  stepCultureMetabolism(w);
  assert.equal(w.citizens.list[idx].cause, 'starvation');
};
const fullAll = (w) => {
  for (const l of w.ecology.lives) l.fat = CULTURE_FAT_MAX_TICKS;
};

// 1 — the defaults and the dormant dish.
{
  assert.equal(CULTURE_ECOLOGY_STEP_HZ, CULTURE_STEP_HZ, 'the ecology steps on the world’s 120 Hz clock');
  assert.equal(CULTURE_MORSEL_FAT, 10, 'defaults: +10 fat a beat morsel');
  assert.equal(CULTURE_UPKEEP_BODY_FAT_S, 1, 'defaults: 1 fat/s a body');
  assert.equal(CULTURE_UPKEEP_LIMB_FAT_S, 0.5, 'defaults: 0.5 fat/s a carried limb');
  assert.equal(CULTURE_STARVE_S, 5, 'defaults: starvation at fat 0 sustained 5 s');
  assert.equal(CULTURE_CORPSE_S, 30, 'defaults: a body persists 30 s');
  assert.equal(CULTURE_PREDATION_FAT, 30, 'defaults: predation below fat 30');
  assert.equal(CULTURE_PREDATION_RATIO, 1.2, 'defaults: predation at a size ratio of 1.2');
  assert.equal(CULTURE_FAT_TICKS, 240);
  assert.equal(CULTURE_UPKEEP_BODY_TICKS, 2, '1 fat/s at 120 Hz is 2 ticks a step');
  assert.equal(CULTURE_UPKEEP_LIMB_TICKS, 1, '0.5 fat/s at 120 Hz is 1 tick a step');
  assert.equal(CULTURE_MORSEL_TICKS, 2400);
  assert.equal(CULTURE_STARVE_STEPS, 600);
  assert.equal(CULTURE_CORPSE_STEPS, 3600);
  assert.equal(CULTURE_FAT_BIRTH, 50);
  assert.deepEqual(
    [...CULTURE_CITIZEN_CAUSES],
    ['', 'soil', 'starvation', 'predation'],
    'death: soil, starvation, predation — nothing else',
  );
  // dormant: an uncast world counts nothing, lands nothing — even with a room
  const u = createCultureWorld({ seed: 7 });
  const h0 = cultureEcologyHash(u.ecology);
  setCultureRoom(u, { energy: 'high', silent: 0, bpm: 200 });
  for (let s = 0; s < 600; s++) stepCultureWorld(u);
  assert.equal(u.ecology.step, 0, 'an uncast world counts no metabolism');
  assert.equal(u.ecology.serial, 0, 'and lands no morsel');
  assert.equal(cultureEcologyHash(u.ecology), h0, 'the ecology of an uncast world is born and stays');
  assert.equal(standingCultureWorld(), null, 'the gate: no standing world in a suite');
  // the cast enrols a life per citizen
  const w = world(7, DISH2_MOTH2);
  const beasts = world(7, { plan: 'strandbeest', count: 2 });
  assert.equal(w.ecology.lives.length, w.citizens.list.length);
  for (const [ww, plan, n, free, any] of [
    [w, 'dish', 4, 2, false],
    [w, 'moth', 5, 1, true],
    [beasts, 'strandbeest', 6, 0, false],
  ]) {
    const idx = ww.citizens.list.findIndex((c) => c.plan === plan);
    const life = cultureCitizenLife(ww, idx);
    assert.equal(life.fat, 50, `${plan}: born with 50 fat`);
    assert.equal(life.starving, 0);
    assert.equal(life.sockets.length, n, `${plan}: the plan's ${n} sockets`);
    assert.equal(life.sockets.filter((s) => s.free).length, free, `${plan}: ${free} free`);
    assert.equal(
      life.sockets.some((s) => s.accepts === 'any'),
      any,
    );
  }
  assert.throws(() => cultureCitizenLife(w, 99), /no citizen at index "99"/);
  ok('the defaults at 120 Hz; an uncast dish is dormant; the cast enrols 50 fat and the plan’s sockets per citizen');
}

// 2 — creatures eat beats.
{
  const run = (room, steps = 1200) => {
    const w = world(7);
    if (room) setCultureRoom(w, room);
    for (let s = 0; s < steps; s++) stepCultureWorld(w);
    return w;
  };
  assert.equal(run(null).ecology.serial, 0, 'no room reading: no beats, no morsels');
  assert.equal(run({ energy: 'mid', silent: 1, bpm: 120 }).ecology.serial, 0, 'a silent room: no morsels');
  const fed = run({ energy: 'low', silent: 0, bpm: 120 });
  assert.equal(fed.ecology.serial, Math.floor(fed.gait.beats), 'one morsel per whole beat the gait clock crossed');
  assert.ok(fed.ecology.serial >= 19 && fed.ecology.serial <= 20, `120 bpm × 10 s ≈ 20 beats (${fed.ecology.serial})`);
  // placement: the registered channel, inside the margin
  const e = createCultureWorld({ seed: 42 }).ecology;
  for (let k = 0; k < 50; k++) {
    const m = landCultureMorsel(e, 42, 5);
    assert.equal(m.serial, k);
    assert.equal(
      m.x,
      CULTURE_MORSEL_MARGIN +
        hashU01(42, 'culture-morsel', 2 * k) * (CULTURE_SWARM_WORLD_W - 2 * CULTURE_MORSEL_MARGIN),
    );
    assert.equal(
      m.y,
      CULTURE_MORSEL_MARGIN +
        hashU01(42, 'culture-morsel', 2 * k + 1) * (CULTURE_SWARM_WORLD_H - 2 * CULTURE_MORSEL_MARGIN),
    );
  }
  for (let k = 0; k < 20; k++) landCultureMorsel(e, 42, 5);
  assert.equal(e.morsels.length, 64, 'a full dish holds 64');
  assert.equal(e.displaced, 6, 'a beat on a full dish displaces the oldest');
  assert.equal(e.morsels[0].serial, 6);
  // eating: a head reaching a morsel eats it, +10 exactly
  const w = world(7);
  place(w, 0, 600, 500);
  place(w, 1, 1200, 500);
  place(w, 2, 1500, 300);
  const life0 = w.ecology.lives[0];
  const before = life0.fat;
  const hr = w.bodies.radius[w.citizens.list[0].first];
  w.ecology.morsels.push({ serial: 900, x: 600 + hr + CULTURE_MORSEL_RADIUS - 0.01, y: 500, born: w.step });
  w.ecology.morsels.push({ serial: 901, x: 600 + hr + CULTURE_MORSEL_RADIUS + 0.01, y: 500, born: w.step });
  assert.equal(stepCultureEating(w), 1, 'the head reaches one morsel, not the other');
  assert.equal(life0.fat, before + 2400, '+10 fat, exactly');
  assert.deepEqual(
    w.ecology.morsels.map((m) => m.serial),
    [901],
    'the eaten morsel is gone; the one out of reach stays',
  );
  // a full citizen does not eat; the morsel stays
  w.ecology.morsels = [{ serial: 902, x: 600, y: 500, born: w.step }];
  life0.fat = CULTURE_FAT_MAX_TICKS;
  assert.equal(stepCultureEating(w), 0, 'a full belly eats nothing');
  assert.equal(w.ecology.morsels.length, 1);
  life0.fat = CULTURE_FAT_MAX_TICKS - 100;
  stepCultureEating(w);
  assert.equal(life0.fat, CULTURE_FAT_MAX_TICKS, 'never above the max');
  // the nearest head wins
  place(w, 1, 640, 500);
  w.ecology.lives[1].fat = 1000;
  life0.fat = 1000;
  w.ecology.morsels = [{ serial: 903, x: 625, y: 500, born: w.step }];
  stepCultureEating(w);
  assert.equal(w.ecology.lives[1].fat, 3400, 'the nearer head eats');
  assert.equal(life0.fat, 1000);
  // spoilage at 10 s
  const sp = world(7);
  fullAll(sp);
  sp.ecology.morsels = [{ serial: 0, x: 100, y: 100, born: sp.step }];
  for (let s = 0; s < CULTURE_MORSEL_LIFE_STEPS - 1; s++) {
    sp.step += 1;
    stepCultureMetabolism(sp);
  }
  assert.equal(sp.ecology.morsels.length, 1, 'standing at 9.99 s');
  sp.step += 1;
  stepCultureMetabolism(sp);
  assert.equal(sp.ecology.morsels.length, 0, 'spoiled at 10 s');
  assert.equal(sp.ecology.spoiled, 1);
  ok(
    'creatures eat beats: one morsel a beat while audible, placed by its channel; +10 to the nearest head; full eats none; spoils at 10 s',
  );
}

// 3 — senses: the hunger pull.
{
  const w = world(7);
  place(w, 0, 800, 540);
  const c = w.citizens.list[0];
  const range = cultureSenseRange(c.body);
  assert.equal(range, 3 * c.body.length, 'the sensory range is 3 body-lengths');
  w.ecology.morsels = [
    { serial: 0, x: 800 + range + 1, y: 540, born: 0 },
    { serial: 1, x: 800, y: 540 - range + 1, born: 0 },
  ];
  w.ecology.lives[0].fat = 6000;
  stepCultureFoodSense(w.bodies, w.citizens, w.ecology);
  assert.deepEqual(c.food, {
    x: 800,
    y: 540 - range + 1,
    pull: CULTURE_HUNGER_PULL * (1 - 6000 / CULTURE_FAT_MAX_TICKS),
  });
  w.ecology.morsels = [{ serial: 0, x: 800 + range + 1, y: 540, born: 0 }];
  stepCultureFoodSense(w.bodies, w.citizens, w.ecology);
  assert.equal(c.food, null, 'beyond 3 body-lengths: nothing sensed');
  w.ecology.morsels = [{ serial: 0, x: 900, y: 540, born: 0 }];
  w.ecology.lives[0].fat = CULTURE_FAT_MAX_TICKS;
  stepCultureFoodSense(w.bodies, w.citizens, w.ecology);
  assert.equal(c.food, null, 'a full citizen seeks nothing');
  // the desire is exactly the drives' plus the pull
  w.ecology.lives[0].fat = 0;
  stepCultureFoodSense(w.bodies, w.citizens, w.ecology);
  const field = w.life.field;
  const withFood = cultureDesire(cultureSenses(w.bodies, field, c), c);
  const food = c.food;
  c.food = null;
  const without = cultureDesire(cultureSenses(w.bodies, field, c), c);
  const hx = w.bodies.x[c.first];
  const hy = w.bodies.y[c.first];
  const d = Math.hypot(900 - hx, 540 - hy);
  assert.equal(food.pull, CULTURE_HUNGER_PULL);
  assert.equal(withFood.x, without.x + ((900 - hx) / d) * CULTURE_HUNGER_PULL);
  assert.equal(withFood.y, without.y + ((540 - hy) / d) * CULTURE_HUNGER_PULL);
  assert.equal(
    Object.prototype.hasOwnProperty.call(cultureSenses(w.bodies, field, c), 'food'),
    false,
    'no food: slice C’s senses',
  );
  ok(
    'senses: the nearest morsel within 3 body-lengths, weighed by emptiness; none beyond or when full; the desire gains exactly the pull',
  );
}

// 4 — upkeep.
{
  const w = world(7);
  w.soil.wither.fill(0);
  const life = w.ecology.lives[0];
  const f0 = life.fat;
  for (let s = 0; s < 120; s++) {
    w.step += 1;
    stepCultureMetabolism(w);
  }
  assert.equal(life.fat, f0 - 240, '1 fat a second for the body; its born limbs cost nothing more');
  // a looted limb (dealt by the looting law in group 8) costs 1 tick a step more; here, mark one as looted to read the law
  const s2 = life.sockets[2];
  life.sockets[2] = { ...s2, occupant: life.sockets[0].occupant, kind: 'limb', looted: 1 };
  const f1 = life.fat;
  for (let s = 0; s < 120; s++) {
    w.step += 1;
    stepCultureMetabolism(w);
  }
  assert.equal(life.fat, f1 - 240 - 120, '+0.5 fat a second for a living carried limb');
  w.bodies.alive[life.sockets[0].occupant] = 0;
  const f2 = life.fat;
  w.step += 1;
  stepCultureMetabolism(w);
  assert.equal(life.fat, f2 - 2, 'a lost carried limb costs nothing');
  life.sockets[2] = s2;
  // the dead pay nothing
  starveNow(w, 1);
  const fd = w.ecology.lives[1].fat;
  for (let s = 0; s < 50; s++) {
    w.step += 1;
    stepCultureMetabolism(w);
  }
  assert.equal(w.ecology.lives[1].fat, fd);
  ok('upkeep: 2 ticks a step the body, +1 each living looted limb, born limbs free, the dead pay nothing');
}

// 5 — starvation.
{
  const w = world(7);
  const life = w.ecology.lives[0];
  const c = w.citizens.list[0];
  life.fat = 2;
  w.step += 1;
  stepCultureMetabolism(w);
  assert.equal(life.fat, 0);
  assert.equal(life.starve, 1, 'the step fat reaches 0 counts');
  for (let s = 0; s < CULTURE_STARVE_STEPS - 2; s++) {
    w.step += 1;
    stepCultureMetabolism(w);
  }
  assert.equal(c.alive, 1, 'alive at 599 steps at fat 0');
  assert.equal(cultureCitizenLife(w, 0).starving, 599 / 600);
  // any fat restarts the clock (fat is read after the step's upkeep: 3 ticks leave 1)
  life.fat = 3;
  w.step += 1;
  stepCultureMetabolism(w);
  assert.equal(life.fat, 1);
  assert.equal(life.starve, 0, 'a step ending with fat restarts the clock');
  w.step += 1;
  stepCultureMetabolism(w);
  assert.equal(life.fat, 0);
  assert.equal(life.starve, 1, 'and it counts anew from 1');
  life.fat = 2400;
  w.step += 1;
  stepCultureMetabolism(w);
  assert.equal(life.starve, 0, 'fed: the clock stands at 0');
  life.fat = 0;
  for (let s = 0; s < CULTURE_STARVE_STEPS - 1; s++) {
    w.step += 1;
    stepCultureMetabolism(w);
  }
  assert.equal(c.alive, 1, 'alive at 599 sustained');
  w.step += 1;
  stepCultureMetabolism(w);
  assert.equal(c.alive, 0, 'dead at 600 sustained — 5 s');
  assert.equal(c.cause, 'starvation');
  assert.equal(c.diedStep, w.step);
  assert.equal(w.ecology.starved, 1);
  assert.equal(w.citizens.died, 1);
  ok('starvation: fat 0 sustained 600 steps (5 s) kills, cause starvation; any fat restarts the clock');
}

// 6 — predation.
{
  const T = CULTURE_PREDATION_FAT_TICKS;
  assert.equal(culturePredationAllowed(T - 1, 6, 5), true, 'fat 29.99…, ratio exactly 1.2: a kill');
  assert.equal(culturePredationAllowed(T, 6, 5), false, 'fat exactly 30: no kill');
  assert.equal(culturePredationAllowed(T - 1, 5.95, 5), false, 'ratio 1.19: no kill');
  assert.equal(culturePredationAllowed(T - 1, 5, 6), false, 'the smaller never kills the bigger');
  assert.equal(culturePredationAllowed(0, 6, 0), false, 'nothing to kill');
  // in the dish
  const setup = () => {
    const w = world(7);
    fullAll(w);
    place(w, 0, 600, 500, 0);
    place(w, 1, 600 + 45, 500, 0); // 0's head touches 1's head
    place(w, 2, 1500, 300, 0);
    // shrink citizen 1: its two limbs and its last two spine discs gone (the soil took them) — the size is what lives
    for (const s of w.ecology.lives[1].sockets) for (const i of s.slots) w.bodies.alive[i] = 0;
    w.bodies.alive[w.citizens.list[1].first + 3] = 0;
    w.bodies.alive[w.citizens.list[1].first + 4] = 0;
    return w;
  };
  let w = setup();
  const sA = cultureCitizenSize(w.bodies, w.citizens.list[0], w.ecology.lives[0]);
  const sB = cultureCitizenSize(w.bodies, w.citizens.list[1], w.ecology.lives[1]);
  let area = 0;
  for (let k = 0; k < w.citizens.list[1].n; k++)
    if (w.bodies.alive[w.citizens.list[1].first + k])
      area += Math.PI * w.bodies.radius[w.citizens.list[1].first + k] ** 2;
  assert.equal(sB, area, 'size is the living parts’ summed disc area');
  assert.ok(sA / sB >= 1.2, `the fixture: 0 outsizes 1 (${(sA / sB).toFixed(3)})`);
  w.ecology.lives[0].fat = T;
  assert.equal(stepCulturePredation(w), 0, 'fat 30: not hungry, no kill');
  w.ecology.lives[0].fat = T - 1;
  w.ecology.lives[1].fat = 0;
  assert.equal(stepCulturePredation(w), 1, 'hungry and bigger: a kill');
  assert.equal(w.citizens.list[1].alive, 0);
  assert.equal(w.citizens.list[1].cause, 'predation');
  assert.equal(cultureCitizenLife(w, 1).killer, 0, 'its killer named');
  assert.equal(w.citizens.list[0].alive, 1, 'the smaller, hungry too, never killed the bigger');
  assert.equal(w.ecology.lives[0].fat, T - 1, 'a kill feeds no fat — the food web is beats');
  for (let k = 0; k < w.citizens.list[1].n; k++)
    if (k <= 2) assert.equal(w.bodies.alive[w.citizens.list[1].first + k], 1, 'the prey’s body stays — a corpse');
  // no contact, no kill
  w = setup();
  w.ecology.lives[0].fat = 0;
  place(w, 1, 1000, 800, 0);
  assert.equal(stepCulturePredation(w), 0, 'no contact, no kill');
  // contact with a body part (not the head) is contact
  w = setup();
  w.ecology.lives[0].fat = 0;
  place(w, 1, 600 + 45, 500, Math.PI); // turned around: 0's head now meets 1's tail end region
  const c1 = w.citizens.list[1];
  // move 1 so only its last living spine disc touches 0's head
  const tail = c1.first + 2;
  const dx = 600 + w.bodies.radius[w.citizens.list[0].first] + w.bodies.radius[tail] - 1 - w.bodies.x[tail];
  for (let k = 0; k < c1.n; k++) w.bodies.x[c1.first + k] += dx;
  assert.equal(stepCulturePredation(w), 1, 'the head on any living part is contact');
  // two of a size: no kill
  w = world(7);
  fullAll(w);
  place(w, 0, 600, 500, 0);
  place(w, 1, 645, 500, 0);
  const r =
    cultureCitizenSize(w.bodies, w.citizens.list[0], w.ecology.lives[0]) /
    cultureCitizenSize(w.bodies, w.citizens.list[1], w.ecology.lives[1]);
  w.ecology.lives[0].fat = 0;
  w.ecology.lives[1].fat = 0;
  if (r < 1.2 && r > 1 / 1.2) assert.equal(stepCulturePredation(w), 0, `near equals (ratio ${r.toFixed(3)}): no kill`);
  else assert.fail(`fixture: expected near-equal sizes, got ${r}`);
  ok(
    'predation: hungry (fat < 30) and 1.2× the size, both lines both sides; head on any living part; the smaller dies, its killer named, no fat',
  );
}

// 7 — the corpse.
{
  const w = world(7);
  fullAll(w);
  w.soil.wither.fill(0);
  place(w, 1, 1300, 400, 0);
  starveNow(w, 1);
  const c = w.citizens.list[1];
  const died = c.diedStep;
  // no muscle: a world step writes no muscle into it (its velocity is what the dish alone does to it)
  const age = c.age;
  const heading = c.heading;
  for (let s = 0; s < 240; s++) {
    w.soil.wither.fill(0);
    fullAll(w);
    stepCultureWorld(w);
  }
  assert.equal(c.age, age, 'a corpse does not age');
  assert.equal(c.heading, heading, 'nor turn');
  assert.ok(!w.gait.out['citizen:1'], 'nor wear a gait');
  // the look fades in data
  const L = cultureCitizenAt(w, 1);
  const decay = (w.step - died) / CULTURE_CORPSE_STEPS;
  assert.equal(L.life.decay, decay);
  assert.equal(L.alive, false);
  const bare = cultureCitizenAt(w, 0);
  assert.equal(bare.life.decay, 0, 'the living do not decay');
  L.parts.forEach((p) => assert.ok(p.pose.dAlpha <= -decay + 1e-12, 'every part fades by the decay'));
  // gone at exactly 30 s; lootable until then
  while (w.step - died < CULTURE_CORPSE_STEPS - 1) {
    w.step += 1;
    stepCultureMetabolism(w);
  }
  for (let k = 0; k < c.n; k++) assert.equal(w.bodies.alive[c.first + k], 1, 'standing at 29.99 s');
  place(w, 0, w.bodies.x[c.first] - 45, w.bodies.y[c.first], 0); // the corpse drifted with the dish: meet it where it lies
  assert.equal(stepCultureLooting(w), 1, 'lootable at 29.99 s');
  w.step += 1;
  stepCultureMetabolism(w);
  for (let k = 0; k < c.n; k++) assert.equal(w.bodies.alive[c.first + k], 0, 'gone at 30 s');
  assert.equal(cultureCitizenLife(w, 1).removed, true);
  assert.equal(cultureCitizenLife(w, 1).decay, 1);
  assert.equal(w.ecology.removed, 1);
  assert.equal(stepCultureLooting(w), 0, 'nothing to loot after');
  for (let k = 0; k < c.n; k++) assert.equal(w.soil.wither[c.first + k], 0, 'a gone body carries no soil clock');
  ok('the corpse: no muscle, no age, no gait; its look fades by its decay; lootable to 29.99 s; gone at 30 s');
}

// 8 — looting and attaching.
{
  const w = world(7);
  fullAll(w);
  place(w, 1, 900, 500, 0);
  starveNow(w, 1);
  // a corpse does not loot: in a twin dish, citizen 0 dies too and lies with its head on 1's
  const z = world(7);
  fullAll(z);
  place(z, 1, 900, 500, 0);
  starveNow(z, 1);
  place(z, 0, 945, 500, Math.PI);
  starveNow(z, 0);
  assert.equal(stepCultureLooting(z), 0, 'the dead loot nothing');
  place(w, 0, 945, 500, Math.PI);
  const A = w.citizens.list[0];
  const B = w.citizens.list[1];
  const lifeA = w.ecology.lives[0];
  const lifeB = w.ecology.lives[1];
  const bSlots = lifeB.sockets[0].slots.slice();
  const bLooks = lifeB.sockets[0].slots.map((i) => B.body.parts[i - B.first].look);
  const bRadii = lifeB.sockets[0].slots.map((i) => w.bodies.radius[i]);
  const count0 = w.bodies.count;
  const links0 = w.links.count;
  assert.equal(stepCultureLooting(w), 1, 'a head on a corpse takes a limb');
  const s2 = lifeA.sockets[2];
  assert.equal(s2.id, 'spine.1.l', 'into the first free plan socket that accepts it');
  assert.equal(s2.looted, 1);
  assert.equal(s2.from, 1);
  assert.equal(s2.kind, 'limb');
  assert.deepEqual(s2.slots, [count0, count0 + 1, count0 + 2], 'fresh slots on the looter');
  assert.deepEqual(
    s2.parts.map((p) => p.look),
    bLooks,
    'its ORIGINAL look, part for part',
  );
  assert.deepEqual(
    s2.slots.map((i) => w.bodies.radius[i]),
    bRadii,
    'and its radii',
  );
  for (const i of bSlots) assert.equal(w.bodies.alive[i], 0, 'the corpse’s limb is gone from it');
  assert.equal(lifeB.sockets[0].occupant, -1);
  assert.equal(w.links.count, links0 + 3);
  assert.equal(w.links.a[links0], A.first + A.body.sockets[2].part, 'joined to the socket’s host');
  assert.equal(w.links.b[links0], count0);
  assert.equal(
    w.links.rest[links0],
    Math.fround((A.body.parts[A.body.sockets[2].part].radius + s2.parts[0].radius) * CULTURE_BODY_REST_OVERLAP),
    'at the overlap rule',
  );
  assert.deepEqual(cultureBodyFaults(cultureWornBody(A, lifeA)), [], 'LOIS admits the worn body');
  // the layout: the worn limb follows the born parts, its original look, its provenance
  const lay = cultureCitizenAt(w, 0);
  const worn = lay.parts.filter((p) => p.looted);
  assert.equal(worn.length, 3);
  assert.deepEqual(
    worn.map((p) => p.look),
    bLooks,
  );
  assert.equal(worn[0].looted.from, 1);
  assert.equal(lay.parts[worn[1].parent], worn[0], 'the chain hangs together in the layout');
  // the looter pays for it
  const f = lifeA.fat;
  w.step += 1;
  stepCultureMetabolism(w);
  assert.equal(lifeA.fat, f - 3, 'body 2 + carried limb 1 ticks a step');
  // the second limb, the second free socket; then none
  assert.equal(stepCultureLooting(w), 1);
  assert.equal(lifeA.sockets[3].id, 'spine.1.r');
  assert.equal(lifeA.sockets[3].looted, 1);
  place(w, 2, 900, 800, 0);
  starveNow(w, 2);
  place(w, 0, 945, 800, Math.PI);
  const cSlots = w.ecology.lives[2].sockets[0].slots.slice();
  assert.equal(stepCultureLooting(w), 0, 'no free socket: no loot');
  for (const i of cSlots) assert.equal(w.bodies.alive[i], 1, 'the corpse keeps its limb');
  // a lost limb frees its socket: re-socket
  w.bodies.alive[lifeA.sockets[0].occupant] = 0;
  assert.equal(stepCultureLooting(w), 1, 'a socket whose limb is lost takes a looted one');
  assert.equal(lifeA.sockets[0].looted, 1);
  assert.equal(lifeA.sockets[0].from, 2);
  assert.deepEqual(cultureBodyFaults(cultureWornBody(A, lifeA)), []);
  // the cap and the sockets are the PLAN's: a forged extra socket on the life is never offered, even when it is the
  // only free one (every real socket is occupied here)
  lifeA.sockets.push({ ...lifeA.sockets[3], id: 'forged', occupant: -1, looted: 0, kind: '', slots: [], parts: [] });
  assert.equal(stepCultureLooting(w), 0, 'a socket the plan does not declare is never offered');
  lifeA.sockets.pop();
  // over the plan: refused loudly
  lifeA.sockets.push({ ...lifeA.sockets[3], id: 'forged' });
  w.bodies.alive[lifeA.sockets[1].occupant] = 0;
  assert.throws(() => stepCultureLooting(w), /LOIS refuses citizen 0's worn body: .*over the plan cap/);
  lifeA.sockets.pop();
  // the moth: never a dish limb; a moth's into its one free socket (any kind the plan uses)
  const m = world(7, DISH2_MOTH2);
  fullAll(m);
  place(m, 0, 700, 500, 0);
  starveNow(m, 0);
  place(m, 3, 700, 800, 0);
  starveNow(m, 3);
  const mi = 2;
  const reach = (ww, a, b) => ww.citizens.list[a].body.parts[0].radius + ww.citizens.list[b].body.parts[0].radius - 2;
  place(m, mi, 700 + reach(m, mi, 0), 500, Math.PI);
  const dx0 = m.bodies.x[m.citizens.list[mi].first] - m.bodies.x[m.citizens.list[0].first];
  assert.ok(Math.abs(dx0) < reach(m, mi, 0) + 2, 'the fixture: the moth’s head is on the dish corpse’s head');
  assert.equal(stepCultureLooting(m), 0, 'a moth takes no dish limb (its plan uses wings and antennae)');
  const mothCorpse = m.citizens.list[3];
  place(m, mi, 700 + reach(m, mi, 3), 800, Math.PI);
  const look0 = m.ecology.lives[3].sockets[0].slots.map((i) => mothCorpse.body.parts[i - mothCorpse.first].look);
  assert.equal(stepCultureLooting(m), 1, 'a moth takes a moth’s limb');
  const ms = m.ecology.lives[mi].sockets[4];
  assert.equal(ms.id, 'spine.1.free');
  assert.equal(ms.kind, 'antenna', 'the corpse’s first living limb, in its socket order');
  assert.deepEqual(
    ms.parts.map((p) => p.look),
    look0,
    'its original look',
  );
  assert.deepEqual(cultureBodyFaults(cultureWornBody(m.citizens.list[mi], m.ecology.lives[mi])), []);
  // the strandbeest: no free socket until a hip is lost; then it re-sockets a leg
  const b = world(7, { plan: 'strandbeest', count: 2 });
  fullAll(b);
  place(b, 1, 900, 500, 0);
  starveNow(b, 1);
  place(b, 0, 900 + 28, 500, Math.PI);
  assert.equal(stepCultureLooting(b), 0, 'a whole beast has no free socket');
  b.bodies.alive[b.ecology.lives[0].sockets[3].occupant] = 0;
  assert.equal(stepCultureLooting(b), 1, 'a beast that lost a hip re-sockets a looted leg');
  assert.equal(b.ecology.lives[0].sockets[3].kind, 'leg');
  assert.deepEqual(cultureBodyFaults(cultureWornBody(b.citizens.list[0], b.ecology.lives[0])), []);
  ok(
    'looting: the first free plan socket of the kind; original look and radii; the corpse loses it; upkeep paid; none free, none taken; moth and beast by their plans; over-plan refused loudly',
  );
}

// 9 — determinism, the hash, and the ecology over a minute.
{
  const fed = (seed) => {
    const w = createCultureWorld({ seed });
    castCultureTake(w, {
      roster: [
        { plan: 'dish', count: 3 },
        { plan: 'moth', count: 2 },
        { plan: 'strandbeest', count: 2 },
      ],
    });
    setCultureRoom(w, { energy: 'mid', silent: 0, bpm: 120 });
    return w;
  };
  const a = fed(42);
  const b = fed(42);
  for (let s = 0; s < 120 * 60; s++) {
    stepCultureWorld(a);
    stepCultureWorld(b);
  }
  assert.equal(cultureWorldHash(a), cultureWorldHash(b), 'twin fed worlds, bit-identical over a minute');
  assert.ok(a.ecology.eaten > 0);
  assert.equal(JSON.stringify(cultureMorsels(a)), JSON.stringify(cultureMorsels(b)));
  // the hash covers every piece of new state
  const h = cultureWorldHash(a);
  const e = a.ecology;
  const life = e.lives[0];
  const touch = [
    ['fat', () => (life.fat += 1), () => (life.fat -= 1)],
    ['starve', () => (life.starve += 1), () => (life.starve -= 1)],
    ['removed', () => (life.removed ^= 1), () => (life.removed ^= 1)],
    ['killer', () => (life.killer += 1), () => (life.killer -= 1)],
    ['loots', () => (life.loots += 1), () => (life.loots -= 1)],
    ['socket occupant', () => (life.sockets[0].occupant += 1), () => (life.sockets[0].occupant -= 1)],
    ['socket looted', () => (life.sockets[0].looted ^= 1), () => (life.sockets[0].looted ^= 1)],
    ['socket from', () => (life.sockets[0].from += 1), () => (life.sockets[0].from -= 1)],
    [
      'socket kind',
      () => (life.sockets[0].kind += 'x'),
      () => (life.sockets[0].kind = life.sockets[0].kind.slice(0, -1)),
    ],
    ['eco step', () => (e.step += 1), () => (e.step -= 1)],
    ['serial', () => (e.serial += 1), () => (e.serial -= 1)],
    ['eaten', () => (e.eaten += 1), () => (e.eaten -= 1)],
    ['loots tally', () => (e.loots += 1), () => (e.loots -= 1)],
    ['starved tally', () => (e.starved += 1), () => (e.starved -= 1)],
    ['preyed tally', () => (e.preyed += 1), () => (e.preyed -= 1)],
  ];
  assert.ok(e.morsels.length, 'the fixture: morsels stand');
  const mo = e.morsels[0];
  const x0 = mo.x;
  const y0 = mo.y;
  touch.push(['morsel x', () => (mo.x = x0 + 1e-9), () => (mo.x = x0)]);
  touch.push(['morsel y', () => (mo.y = y0 + 1e-9), () => (mo.y = y0)]);
  touch.push(['morsel born', () => (mo.born += 1), () => (mo.born -= 1)]);
  touch.push(['morsel serial', () => (mo.serial += 1), () => (mo.serial -= 1)]);
  // QA fix-forward: every socket column, including the slots and each carried part's radius and look (shape, tone)
  const sk = life.sockets[0];
  assert.ok(sk.slots.length && sk.parts.length, 'the fixture: a socket holding a limb');
  const p0 = sk.parts[0];
  touch.push(['socket slots', () => (sk.slots[0] += 1), () => (sk.slots[0] -= 1)]);
  touch.push(['socket slot count', () => sk.slots.push(7), () => sk.slots.pop()]);
  touch.push([
    'carried part radius',
    () => (sk.parts[0] = { ...p0, radius: p0.radius + 1e-9 }),
    () => (sk.parts[0] = p0),
  ]);
  touch.push([
    'carried part look shape',
    () => (sk.parts[0] = { ...p0, look: { ...p0.look, shape: p0.look.shape === 'dot' ? 'ring' : 'dot' } }),
    () => (sk.parts[0] = p0),
  ]);
  touch.push([
    'carried part look tone',
    () => (sk.parts[0] = { ...p0, look: { ...p0.look, tone: p0.look.tone === 'ink' ? 'main' : 'ink' } }),
    () => (sk.parts[0] = p0),
  ]);
  touch.push(['socket id', () => (sk.id += 'x'), () => (sk.id = sk.id.slice(0, -1))]);
  for (const [what, set, undo] of touch) {
    set();
    assert.notEqual(cultureWorldHash(a), h, `the world hash covers ${what}`);
    undo();
    assert.equal(cultureWorldHash(a), h);
  }
  // over four seeds a fed dish outlives an unfed one; the unfed is emptied by the law within the minute
  let fedAlive = 0;
  let unfedAlive = 0;
  for (const seed of [1, 2, 3, 4]) {
    const f = fed(seed);
    const u = createCultureWorld({ seed });
    castCultureTake(u, {
      roster: [
        { plan: 'dish', count: 3 },
        { plan: 'moth', count: 2 },
        { plan: 'strandbeest', count: 2 },
      ],
    });
    for (let s = 0; s < 120 * 60; s++) {
      stepCultureWorld(f);
      stepCultureWorld(u);
    }
    fedAlive += f.citizens.list.filter((c) => c.alive).length;
    unfedAlive += u.citizens.list.filter((c) => c.alive).length;
    for (const c of u.citizens.list) assert.ok(c.cause !== '', `unfed (seed ${seed}): every citizen died`);
  }
  assert.equal(unfedAlive, 0);
  assert.ok(fedAlive > 0, `the fed dish lives on (${fedAlive} alive after a minute over four seeds)`);
  ok(
    `determinism: twin fed worlds bit-identical; the hash covers every piece of new state; fed dishes live on (${fedAlive}), unfed die`,
  );
}

// 10 — RULED (Matt, 2026-11-24): a strandbeest's planted feet eat too.
{
  const b = world(7, { plan: 'strandbeest', count: 2 });
  place(b, 0, 900, 500, 0);
  place(b, 1, 400, 800, 0);
  const beast = b.citizens.list[0];
  const life = b.ecology.lives[0];
  b.ecology.lives[1].fat = CULTURE_FAT_MAX_TICKS;
  // turn the crank until the feet show both bands
  let feet = cultureBeastFeet(b.bodies, beast);
  for (
    let t = 0;
    t < 400 && !(feet.some((f) => f.alive && f.planted) && feet.some((f) => f.alive && !f.planted));
    t++
  ) {
    beast.pA += 0.013;
    beast.pB += 0.017;
    feet = cultureBeastFeet(b.bodies, beast);
  }
  const head = { x: b.bodies.x[beast.first], y: b.bodies.y[beast.first], r: b.bodies.radius[beast.first] };
  const far = (f) => Math.hypot(f.x - head.x, f.y - head.y) > head.r + CULTURE_MORSEL_RADIUS + 20;
  const planted = feet.find((f) => f.alive && f.planted && far(f));
  const swinging = feet.find((f) => f.alive && !f.planted && far(f));
  assert.ok(planted && swinging, 'the fixture: a planted foot and a swinging one, both away from the head');
  const mouths = cultureMouths(b.bodies, b.citizens, b.ecology);
  assert.deepEqual(
    mouths.filter((m) => m.idx === 0).map((m) => m.rank),
    [0, ...feet.filter((f) => f.alive && f.planted).map(() => 1)],
    'its mouths: its head, then each planted foot in leg order — and no swinging foot',
  );
  life.fat = 1000;
  b.ecology.morsels = [{ serial: 1, x: planted.x + 1, y: planted.y, born: b.step }];
  assert.equal(stepCultureEating(b), 1, 'a planted foot eats');
  assert.equal(life.fat, 3400, 'the same +10 as a head');
  b.ecology.morsels = [{ serial: 2, x: swinging.x + 1, y: swinging.y, born: b.step }];
  assert.equal(stepCultureEating(b), 0, 'a swinging foot eats nothing');
  assert.equal(life.fat, 3400);
  const hip = b.bodies.radius[beast.first + beast.body.sockets[planted.leg].occupant];
  b.ecology.morsels = [{ serial: 3, x: planted.x + hip + CULTURE_MORSEL_RADIUS + 0.01, y: planted.y, born: b.step }];
  assert.equal(stepCultureEating(b), 0, 'beyond the foot’s reach (its hip disc’s radius + the morsel’s), nothing');
  // the order on a tie: the earlier citizen, a citizen's head before its feet, the earlier leg
  const eco = { lives: [{ fat: 0 }, { fat: 0 }] };
  const m = { x: 0, y: 0 };
  const at = (idx, rank, x) => ({ idx, rank, x, y: 0, reach: 10 });
  assert.equal(cultureMouthReaching([at(0, 1, 3), at(1, 0, -3)], eco, m), 0, 'a tie: the earlier citizen (its foot)');
  assert.equal(
    cultureMouthReaching([at(1, 0, -3), at(0, 1, 3)], eco, m),
    1,
    'the canonical order decides, never chance',
  );
  assert.equal(cultureMouthReaching([at(0, 1, 3), at(1, 0, -2)], eco, m), 1, 'the nearer mouth wins');
  eco.lives[1].fat = CULTURE_FAT_MAX_TICKS;
  assert.equal(cultureMouthReaching([at(1, 0, -2), at(0, 1, 3)], eco, m), 0, 'a full citizen’s mouth passes');
  ok(
    'RULED: a strandbeest’s planted feet eat too (+10), a swinging foot never; the nearest mouth wins, ties in canonical order',
  );
}

console.log(`cultureEcology.selfcheck: ${checks}/10 groups OK`);
