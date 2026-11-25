// node src/engine/cultureBreed.selfcheck.mjs
// CULTURE Phase 6, slice B — breeding, growth, and casting per take (engine/cultureBreed.mjs + the world's breeding step,
// engine/cultureWorld.mjs; growth in engine/cultureEcology.mjs; the hunger gene in engine/cultureMotion.mjs).
//   1. the defaults: the ruled constants, the growth stage and scale, the registered 'culture-breed' channel
//   2. the breeding law: same plan only; fat ≥ 60 and stage ≥ 2, both sides of both lines; in the dish: touching
//      eligible same-plan citizens → a baby; each parent pays 25 exactly; the baby is born with 50, stage 1, its parents
//      recorded; contact either way; not touching, nothing; one birth a parent a step
//   3. the body mix: per part a coin flip — each part's radius AND look are exactly one parent's (never a blend), as the
//      channel draws; a strandbeest's linkage whole from one parent; looted limbs are not inherited
//   4. the recipe blend: every dial the parents' mean (timing in whole steps), the hunger gene included
//   5. LOIS gates the baby: a refused body → no birth, no fat paid, counted; the living cap → no birth, no fat, counted
//   6. growth: +1 stage every 5 morsels, cap 3; each stage ×1.08 every born radius in the table, the joints at the overlap
//      rule, the body read by LOIS clean; size (predation's) ×1.08² a stage; carried limbs not grown
//   7. hunger as a recipe gene: the motion reads the recipe's gene (0 ignores food, 4 pulls twice as hard as 2); the
//      native gene reproduces 6A: the bodies equal origin/main dcc1ac6's to the bit — unfed over 60 s, fed up to the step
//      before the first growth
//   8. the baby preview (T3): deterministic, pure (frozen parents untouched, the world's hash unchanged), and the baby the
//      world deals IS its preview; the bench drives it on its parents' gait
//   9. fresh cast per take: a new take's world is the pristine cast — no babies, no growth, no loot carried; the shell
//      casts fresh each time
//  10. determinism and the hash: twin worlds with births bit-identical; the hash covers every piece of new state
import assert from 'node:assert/strict';
import {
  createCultureWorld,
  stepCultureWorld,
  castCultureTake,
  setCultureRoom,
  cultureWorldHash,
  cultureCitizenLife,
  stepCultureBreeding,
  cultureBabyPreviewOf,
  standingCultureWorld,
} from './cultureWorld.mjs';
import {
  CULTURE_BREED_FAT,
  CULTURE_BREED_STAGE,
  CULTURE_BIRTH_COST_FAT,
  CULTURE_BABY_FAT,
  CULTURE_GROWTH_MEALS,
  CULTURE_GROWTH_STAGE_MAX,
  CULTURE_GROWTH_STAGE_SCALE,
  CULTURE_POPULATION_CAP,
  CULTURE_BREED_DRAWS,
  cultureGrowthStage,
  cultureGrowthScale,
  cultureBreedAllowed,
  cultureBlendRecipe,
  cultureBabyPreview,
} from './cultureBreed.mjs';
import {
  CULTURE_FAT_TICKS,
  CULTURE_FAT_MAX_TICKS,
  CULTURE_STARVE_STEPS,
  stepCultureMetabolism,
  stepCultureEating,
  stepCultureFoodSense,
  cultureAttachLimb,
  cultureFreeSocketFor,
  cultureCitizenSize,
  cultureWornBody,
  cultureEcologyHash,
} from './cultureEcology.mjs';
import {
  assembleCultureBody,
  cultureBodyRestPose,
  cultureBodyFaults,
  mixCultureBodies,
  growCultureBody,
  CULTURE_BODY_REST_OVERLAP,
  CULTURE_LOOK_SHAPES,
} from './cultureBody.mjs';
import { cultureSenses, cultureDesire, normalizeCultureRecipe, CULTURE_RECIPE_BOUNDS } from './cultureMotion.mjs';
import { kineticAssemble, davisWrite, CULTURE_NATIVE_RECIPES, CULTURE_TAKE_SHEET } from './cultureLab.mjs';
import { cultureTestDrive, cultureTestDriveBaby } from './cultureTestDrive.mjs';
import { cultureSwarmHash } from './cultureSwarm.mjs';
import { hashU01, STRING_CHANNEL_GROUPS } from './kernel/rng.js';
import { runCultureShell } from '../hooks/useCultureWorld.js';

let checks = 0;
const ok = (msg) => {
  checks++;
  console.log(`  ok ${checks} — ${msg}`);
};
const T = CULTURE_FAT_TICKS;
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
/** Make citizens eligible (fat, stage) — the breeding law reads only these. */
const ready = (w, idxs, fat = 80 * T, stage = 2) => {
  for (const i of idxs) {
    w.ecology.lives[i].fat = fat;
    w.ecology.lives[i].stage = stage;
  }
};
/** Two citizens face to face, heads touching (head 0 at 600, head 1 one head radius to its right). */
const touchPair = (w, a = 0, b = 1, far = [2]) => {
  place(w, a, 600, 500, 0);
  place(w, b, 600 + w.bodies.radius[w.citizens.list[a].first], 500, Math.PI);
  far.forEach((i, k) => place(w, i, 1500, 250 + 400 * k));
};
const kidOf = (w) => w.citizens.list.length - 1;
const deepFreeze = (o) => {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
};

// 1 — the defaults.
{
  assert.equal(CULTURE_BREED_FAT, 60, 'defaults: breeding at fat ≥ 60');
  assert.equal(CULTURE_BREED_STAGE, 2, 'defaults: breeding at growth stage ≥ 2');
  assert.equal(CULTURE_BIRTH_COST_FAT, 25, 'ruled: each parent pays 25 fat');
  assert.equal(CULTURE_BABY_FAT, 50, 'ruled: the baby is born with 50');
  assert.equal(CULTURE_GROWTH_MEALS, 5, 'ruled: a stage every 5 morsels');
  assert.equal(CULTURE_GROWTH_STAGE_MAX, 3, 'ruled: stage cap 3');
  assert.equal(CULTURE_GROWTH_STAGE_SCALE, 1.08, 'recorded: radius ×1.08 a stage');
  assert.equal(CULTURE_POPULATION_CAP, 32, 'recorded: at most 32 living');
  assert.deepEqual(
    [0, 4, 5, 9, 10, 14, 15, 99].map(cultureGrowthStage),
    [1, 1, 2, 2, 3, 3, 3, 3],
    'stage 1 at birth, +1 every 5 morsels, at most 3',
  );
  assert.equal(cultureGrowthScale(1), 1);
  assert.equal(cultureGrowthScale(2), 1.08);
  assert.equal(cultureGrowthScale(3), 1.08 * 1.08);
  assert.equal(STRING_CHANNEL_GROUPS['culture-breed'], 'spatial', 'births draw on a registered channel');
  assert.equal(CULTURE_BREED_DRAWS, 64);
  ok(
    'the defaults: 60 / stage 2, 25 a parent, 50 a baby, 5 morsels a stage to 3 at ×1.08, a 32 cap, a registered channel',
  );
}

// 2 — the breeding law.
{
  const L = (fat, stage) => ({ fat, stage });
  const E = L(60 * T, 2);
  assert.equal(cultureBreedAllowed('dish', E, 'dish', E, T), true, 'fat exactly 60 and stage exactly 2: allowed');
  assert.equal(cultureBreedAllowed('dish', E, 'moth', E, T), false, 'different plans: never');
  assert.equal(cultureBreedAllowed('dish', L(60 * T - 1, 2), 'dish', E, T), false, 'a tick under 60: no');
  assert.equal(cultureBreedAllowed('dish', E, 'dish', L(60 * T - 1, 2), T), false, 'either parent under 60: no');
  assert.equal(cultureBreedAllowed('dish', L(100 * T, 1), 'dish', E, T), false, 'stage 1: no');
  assert.equal(cultureBreedAllowed('dish', E, 'dish', L(100 * T, 1), T), false, 'either parent at stage 1: no');
  assert.equal(cultureBreedAllowed('dish', L(100 * T, 3), 'dish', L(100 * T, 3), T), true);
  // in the dish
  const w = world(7);
  touchPair(w);
  ready(w, [0, 1], 70 * T);
  const n0 = w.citizens.list.length;
  const bodies0 = w.bodies.count;
  assert.equal(stepCultureBreeding(w), 1, 'touching, eligible, one plan: a birth');
  assert.equal(w.citizens.list.length, n0 + 1);
  assert.equal(w.ecology.lives[0].fat, 45 * T, 'parent A paid exactly 25');
  assert.equal(w.ecology.lives[1].fat, 45 * T, 'parent B paid exactly 25');
  const kid = kidOf(w);
  const life = cultureCitizenLife(w, kid);
  assert.equal(w.ecology.lives[kid].fat, 50 * T, 'the baby is born with 50 fat');
  assert.equal(life.stage, 1, 'born at stage 1');
  assert.deepEqual(life.parents, [0, 1]);
  assert.equal(w.ecology.lives[0].children, 1);
  assert.equal(w.ecology.births, 1);
  const c = w.citizens.list[kid];
  assert.equal(c.first, bodies0, 'dealt after the table’s last slot');
  assert.equal(c.plan, 'dish');
  assert.equal(c.bornStep, w.step);
  assert.equal(w.bodies.count, bodies0 + c.n);
  for (let k = 0; k < c.n; k++) assert.equal(w.bodies.alive[c.first + k], 1);
  assert.equal(stepCultureBreeding(w), 0, 'the parents, now at 45, no longer breed');
  // the baby's fat is the ruled 50 even when the parents were fuller
  const f = world(7);
  touchPair(f);
  ready(f, [0, 1], 100 * T);
  stepCultureBreeding(f);
  assert.equal(f.ecology.lives[kidOf(f)].fat, 50 * T, 'baby 50, never the parents’ fat');
  assert.equal(f.ecology.lives[0].fat, 75 * T);
  // different plans, both eligible and touching: nothing
  const m = world(7, {
    roster: [
      { plan: 'dish', count: 1 },
      { plan: 'moth', count: 1 },
    ],
  });
  touchPair(m, 0, 1, []);
  ready(m, [0, 1]);
  assert.equal(stepCultureBreeding(m), 0, 'a dish creature and a moth never breed');
  // eligible but not touching: nothing
  const apart = world(7);
  place(apart, 0, 500, 500);
  place(apart, 1, 1100, 500);
  place(apart, 2, 1500, 300);
  ready(apart, [0, 1]);
  assert.equal(stepCultureBreeding(apart), 0, 'not touching: no birth');
  // contact either way: only B's head touches A's tail
  const tail = world(7);
  place(tail, 0, 600, 500, 0); // A faces +x, its tail trails to the left
  const tc = tail.citizens.list[0];
  const tx = tail.bodies.x[tc.first + 4];
  place(tail, 1, tx - tail.bodies.radius[tc.first + 4], 500, Math.PI); // B's head on A's tail, B facing away
  place(tail, 2, 1500, 300);
  ready(tail, [0, 1]);
  assert.equal(stepCultureBreeding(tail), 1, 'B’s head on A’s body is contact (either way)');
  // one birth a parent a step: three eligible dish creatures all touching
  const three = world(7);
  place(three, 0, 600, 500, 0);
  place(three, 1, 627, 500, Math.PI);
  place(three, 2, 600, 527, -Math.PI / 2);
  ready(three, [0, 1, 2]);
  assert.equal(stepCultureBreeding(three), 1, 'three touching: one pair breeds, the third waits');
  assert.equal(three.ecology.lives[2].fat, 80 * T, 'the third paid nothing');
  // the dead do not breed
  const dead = world(7);
  touchPair(dead);
  ready(dead, [0, 1]);
  dead.citizens.list[1].alive = 0;
  assert.equal(stepCultureBreeding(dead), 0, 'the dead do not breed');
  ok(
    'the breeding law: same plan, fat ≥ 60, stage ≥ 2 (both lines exact); touch either way → a 50-fat stage-1 baby, 25 a parent',
  );
}

// 3 — the body mix.
{
  const swap = (look) => ({ ...look, shape: CULTURE_LOOK_SHAPES[(CULTURE_LOOK_SHAPES.indexOf(look.shape) + 1) % 4] });
  const A = { body: assembleCultureBody('dish', { scale: 0.9 }), recipe: CULTURE_NATIVE_RECIPES.dish };
  const bB = assembleCultureBody('dish', { scale: 1.1 });
  const B = { body: { ...bB, parts: bB.parts.map((p) => ({ ...p, look: swap(p.look) })) }, recipe: A.recipe };
  let fromA = 0;
  let fromBn = 0;
  for (let serial = 0; serial < 12; serial++) {
    const kid = cultureBabyPreview(A, B, { seed: 7, serial });
    assert.equal(kid.admitted, true, `serial ${serial}: LOIS admits`);
    kid.body.parts.forEach((p, k) => {
      const want = hashU01(7, 'culture-breed', serial * CULTURE_BREED_DRAWS + k) < 0.5 ? 1 : 0;
      assert.equal(kid.fromB[k], want, 'the flip is the channel’s draw');
      const src = want ? B.body : A.body;
      assert.equal(p.radius, src.parts[k].radius, 'the size is exactly one parent’s');
      assert.deepEqual(p.look, src.parts[k].look, 'and the look the same parent’s');
      if (want) fromBn++;
      else fromA++;
    });
    for (const l of kid.body.links)
      assert.equal(l.rest, (kid.body.parts[l.a].radius + kid.body.parts[l.b].radius) * CULTURE_BODY_REST_OVERLAP);
    assert.deepEqual(cultureBodyFaults(kid.body), []);
  }
  assert.ok(fromA > 20 && fromBn > 20, `both parents give parts (${fromA} / ${fromBn})`);
  assert.throws(() => mixCultureBodies(A.body, assembleCultureBody('moth'), []), /two parents of one plan/);
  assert.throws(() => cultureBabyPreview(A, { body: assembleCultureBody('moth'), recipe: A.recipe }), /one plan/);
  // a strandbeest's linkage comes whole from one parent, its bones at that parent's scale
  let beasts = 0;
  for (let cand = 0; cand < 40 && beasts < 6; cand++) {
    const ba = kineticAssemble('strandbeest', 3, cand);
    const bb = kineticAssemble('strandbeest', 5, cand);
    if (cultureBodyFaults(ba).length || cultureBodyFaults(bb).length) continue;
    beasts++;
    const r = CULTURE_NATIVE_RECIPES.strandbeest;
    const kid = cultureBabyPreview({ body: ba, recipe: r }, { body: bb, recipe: r }, { seed: 9, serial: cand });
    assert.equal(kid.linkageFromB, hashU01(9, 'culture-breed', cand * CULTURE_BREED_DRAWS + 60) < 0.5 ? 1 : 0);
    const src = kid.linkageFromB ? bb : ba;
    assert.equal(kid.body.linkage, src.linkage, 'the linkage whole from one parent');
    assert.equal(kid.body.scale, src.scale, 'its bones at that parent’s scale');
    assert.equal(kid.admitted, true);
  }
  assert.equal(beasts, 6);
  assert.equal(cultureBabyPreview(A, B).linkageFromB, -1, 'a swimmer has no linkage flip');
  // looted limbs are NOT inherited: parent 0 wears a looted limb; the baby is the born plan
  const w = world(7);
  place(w, 0, 600, 500, 0);
  place(w, 1, 627, 500, Math.PI);
  place(w, 2, 1300, 500);
  const life2 = w.ecology.lives[2];
  life2.fat = 0;
  life2.starve = CULTURE_STARVE_STEPS - 1;
  stepCultureMetabolism(w);
  const k0 = cultureFreeSocketFor(w.bodies, w.citizens.list[0], w.ecology.lives[0], 'limb');
  assert.ok(k0 >= 0);
  assert.equal(cultureAttachLimb(w, 0, k0, 2, 0), true, 'parent A loots a limb');
  assert.ok(cultureWornBody(w.citizens.list[0], w.ecology.lives[0]).parts.length > w.citizens.list[0].n);
  ready(w, [0, 1]);
  assert.equal(stepCultureBreeding(w), 1);
  const kid = w.citizens.list[kidOf(w)];
  assert.equal(kid.n, w.citizens.list[0].n, 'the baby has the born parts only');
  assert.equal(
    kid.body.parts.some((p) => p.id.startsWith('looted')),
    false,
  );
  assert.deepEqual(
    w.ecology.lives[kidOf(w)].sockets.map((s) => [s.id, s.occupant >= 0, s.looted]),
    [
      ['head.l', true, 0],
      ['head.r', true, 0],
      ['spine.1.l', false, 0],
      ['spine.1.r', false, 0],
    ],
    'the plan’s born sockets: the parent’s looted limb is not inherited',
  );
  ok(
    'the body mix: per part a coin flip — look and size exactly one parent’s; the linkage whole; looted limbs never inherited',
  );
}

// 4 — the recipe blend.
{
  const ra = davisWrite('dish', 7, 1).recipe;
  const rb0 = davisWrite('dish', 7, 2).recipe;
  const rb = normalizeCultureRecipe({ ...rb0, drives: { ...rb0.drives, hunger: 3 } });
  const raH = normalizeCultureRecipe({ ...ra, drives: { ...ra.drives, hunger: 1 } });
  const kid = cultureBabyPreview(
    { body: assembleCultureBody('dish'), recipe: raH },
    { body: assembleCultureBody('dish'), recipe: rb },
    { seed: 1 },
  );
  assert.equal(kid.recipe.name, 'dish/bred');
  for (const g of Object.keys(CULTURE_RECIPE_BOUNDS))
    for (const k of Object.keys(CULTURE_RECIPE_BOUNDS[g])) {
      const mean = (raH[g][k] + rb[g][k]) / 2;
      assert.equal(kid.recipe[g][k], k === 'timing' ? Math.round(mean) : mean, `${g}.${k}: the parents’ mean`);
    }
  assert.equal(kid.recipe.drives.hunger, 2, 'the hunger gene blends (1 and 3 → 2)');
  assert.notEqual(kid.recipe.physics.thrust, raH.physics.thrust, 'not parent A’s');
  assert.notEqual(kid.recipe.physics.thrust, rb.physics.thrust, 'not parent B’s');
  assert.ok(Number.isInteger(kid.recipe.seasoning.timing), 'timing in whole steps');
  assert.deepEqual(
    cultureBlendRecipe(ra, ra, 'dish').physics,
    { ...ra.physics },
    'a parent with itself: its own dials',
  );
  ok('the recipe blend: every dial the parents’ mean, timing in whole steps, the hunger gene included');
}

// 5 — LOIS gates the baby; the cap.
{
  // a fault on BOTH parents' part 3 refuses whatever the flip
  const r = world(7);
  touchPair(r);
  ready(r, [0, 1]);
  for (const i of [0, 1]) {
    const bb = r.ecology.lives[i].bornBody;
    r.ecology.lives[i].bornBody = {
      ...bb,
      parts: bb.parts.map((p, k) => (k === 3 ? { ...p, look: { shape: 'blob', tone: 'main' } } : p)),
    };
  }
  const pv = cultureBabyPreviewOf(r, 0, 1);
  assert.equal(pv.admitted, false);
  assert.ok(pv.faults.includes('part 3: look'), 'LOIS names the fault');
  const nr = r.citizens.list.length;
  assert.equal(stepCultureBreeding(r), 0, 'LOIS refuses the baby: no birth');
  assert.equal(r.citizens.list.length, nr);
  assert.equal(r.ecology.lives[0].fat, 80 * T, 'a refused birth costs parent A nothing');
  assert.equal(r.ecology.lives[1].fat, 80 * T, 'nor parent B');
  assert.equal(r.ecology.birthsRefused, 1, 'counted');
  assert.equal(r.ecology.births, 0);
  // a refused RECIPE refuses too
  const rr = world(7);
  touchPair(rr);
  ready(rr, [0, 1]);
  rr.citizens.list[1].recipe = {
    ...rr.citizens.list[1].recipe,
    physics: { ...rr.citizens.list[1].recipe.physics, thrust: 99 },
  };
  assert.equal(stepCultureBreeding(rr), 0, 'a blend the reading refuses: no birth');
  assert.equal(rr.ecology.birthsRefused, 1);
  // the living cap: the dish already at 32 living → no birth, no fat, counted
  const cap = world(7);
  touchPair(cap);
  ready(cap, [0, 1]);
  while (cap.citizens.list.length < CULTURE_POPULATION_CAP) {
    cap.citizens.list.push({ ...cap.citizens.list[2] });
    cap.ecology.lives.push({ ...cap.ecology.lives[2], fat: 0, stage: 1 });
  }
  assert.equal(stepCultureBreeding(cap), 0, 'at the living cap: no birth');
  assert.equal(cap.ecology.birthsCapped, 1);
  assert.equal(cap.ecology.lives[0].fat, 80 * T, 'the cap costs nothing');
  cap.citizens.list[5].alive = 0; // one below the cap
  assert.equal(stepCultureBreeding(cap), 1, 'one under the cap: the birth');
  ok('LOIS gates the baby: a faulted body or recipe → no birth, no fat paid, counted; the 32-living cap likewise');
}

// 6 — growth.
{
  const w = world(7);
  place(w, 0, 600, 500, 0);
  place(w, 1, 1100, 500);
  place(w, 2, 1500, 300);
  const c = w.citizens.list[0];
  const life = w.ecology.lives[0];
  const born = life.bornBody;
  const size0 = cultureCitizenSize(w.bodies, c, life);
  const eat = () => {
    life.fat = 10 * T;
    w.ecology.morsels = [{ serial: 0, x: w.bodies.x[c.first], y: w.bodies.y[c.first], born: w.step }];
    assert.equal(stepCultureEating(w), 1);
  };
  for (let n = 1; n <= 4; n++) eat();
  assert.equal(life.stage, 1, '4 morsels: still stage 1');
  assert.equal(w.bodies.radius[c.first], Math.fround(born.parts[0].radius));
  eat();
  assert.equal(life.stage, 2, 'the 5th morsel: stage 2');
  assert.equal(life.meals, 5);
  for (let k = 0; k < c.n; k++)
    assert.equal(w.bodies.radius[c.first + k], Math.fround(born.parts[k].radius * 1.08), `part ${k} ×1.08`);
  const size2 = cultureCitizenSize(w.bodies, c, life);
  assert.ok(Math.abs(size2 / size0 - 1.08 * 1.08) < 1e-6, 'size (predation’s) ×1.08² a stage (the table is float32)');
  assert.ok(Math.abs(c.body.length / born.length - 1.08) < 1e-12, 'the length grows (and the sensory range with it)');
  assert.deepEqual(cultureBodyFaults(c.body), [], 'LOIS reads the grown body clean');
  assert.deepEqual(cultureBodyFaults(cultureWornBody(c, life)), []);
  // the joints in the table follow
  for (let j = 0; j < born.links.length; j++) {
    const l = c.body.links[j];
    assert.equal(w.links.rest[life.linkFirst + j], Math.fround(l.rest), `joint ${j} at the grown rest`);
    assert.equal(w.links.a[life.linkFirst + j], c.first + l.a);
  }
  for (let n = 6; n <= 9; n++) eat();
  assert.equal(life.stage, 2);
  eat();
  assert.equal(life.stage, 3, 'the 10th: stage 3');
  for (let k = 0; k < c.n; k++)
    assert.equal(w.bodies.radius[c.first + k], Math.fround(born.parts[k].radius * 1.08 * 1.08), `part ${k} ×1.08²`);
  for (let n = 11; n <= 25; n++) eat();
  assert.equal(life.stage, 3, 'capped at 3');
  assert.equal(w.ecology.grown, 2, 'two growth events, no more');
  assert.equal(growCultureBody(born, 1), born);
  assert.throws(() => growCultureBody(born, 0.9), /≥ 1/);
  // a strandbeest grows its bones with its discs (scale)
  const bw = world(7, { plan: 'strandbeest', count: 1 });
  const bl = bw.ecology.lives[0];
  bl.meals = 4;
  bl.fat = 10 * T;
  const bc = bw.citizens.list[0];
  bw.ecology.morsels = [{ serial: 0, x: bw.bodies.x[bc.first], y: bw.bodies.y[bc.first], born: 0 }];
  stepCultureEating(bw);
  assert.equal(bl.stage, 2);
  assert.equal(bc.body.scale, bl.bornBody.scale * 1.08, 'the beast’s bones at the grown scale');
  assert.equal(bc.body.linkage, bl.bornBody.linkage, 'its genes kept');
  // carried limbs keep their size: grow a looter
  const g = world(7);
  place(g, 0, 600, 500, 0);
  place(g, 1, 1300, 500);
  place(g, 2, 1600, 300);
  g.ecology.lives[1].fat = 0;
  g.ecology.lives[1].starve = CULTURE_STARVE_STEPS - 1;
  stepCultureMetabolism(g);
  const k0 = cultureFreeSocketFor(g.bodies, g.citizens.list[0], g.ecology.lives[0], 'limb');
  cultureAttachLimb(g, 0, k0, 1, 0);
  const carried = g.ecology.lives[0].sockets[k0].slots.map((i) => g.bodies.radius[i]);
  g.ecology.lives[0].meals = 4;
  g.ecology.lives[0].fat = 10 * T;
  const gc = g.citizens.list[0];
  g.ecology.morsels = [{ serial: 0, x: g.bodies.x[gc.first], y: g.bodies.y[gc.first], born: 0 }];
  stepCultureEating(g);
  assert.equal(g.ecology.lives[0].stage, 2);
  assert.deepEqual(
    g.ecology.lives[0].sockets[k0].slots.map((i) => g.bodies.radius[i]),
    carried,
    'a carried limb is worn, not grown',
  );
  // a born limb's recorded size follows the growth (a looter takes it as it is)
  const hs = g.ecology.lives[0].sockets[0];
  assert.equal(hs.parts[0].radius, gc.body.parts[hs.slots[0] - gc.first].radius);
  ok('growth: a stage every 5 morsels to 3; ×1.08 radii, joints, length; size ×1.08²; LOIS clean; carried limbs kept');
}

// 7 — hunger as a recipe gene, and the native gene reproduces 6A.
{
  const w = world(7);
  place(w, 0, 800, 540);
  const c = w.citizens.list[0];
  assert.equal(c.recipe.drives.hunger, 2, 'the cast carries the native gene');
  w.ecology.morsels = [{ serial: 0, x: 900, y: 540, born: 0 }];
  w.ecology.lives[0].fat = 0;
  stepCultureFoodSense(w.bodies, w.citizens, w.ecology);
  const field = w.life.field;
  const desire = (hunger) => {
    const cc = { ...c, recipe: normalizeCultureRecipe({ ...c.recipe, drives: { ...c.recipe.drives, hunger } }) };
    return cultureDesire(cultureSenses(w.bodies, field, cc), cc);
  };
  const food = c.food;
  c.food = null;
  const none = cultureDesire(cultureSenses(w.bodies, field, c), c);
  c.food = food;
  const d0 = desire(0);
  assert.deepEqual([d0.x, d0.y], [none.x, none.y], 'gene 0: the food is ignored');
  const d2 = desire(2);
  const d4 = desire(4);
  assert.ok(Math.abs(d4.x - none.x - 2 * (d2.x - none.x)) < 1e-12, 'gene 4 pulls twice as hard as gene 2');
  assert.ok(d2.x > none.x, 'the gene pulls toward the morsel');
  // the native gene reproduces 6A: bodies equal origin/main dcc1ac6 (6A) to the bit — pinned on a pristine worktree.
  // Unfed (no room) over 60 s: nobody eats, so nobody grows or breeds.
  for (const [seed, pin] of [
    [7, 3213499357],
    [42, 1364707529],
  ]) {
    const u = world(seed, CULTURE_TAKE_SHEET);
    for (let s = 0; s < 7200; s++) stepCultureWorld(u);
    assert.equal(u.ecology.grown + u.ecology.births, 0);
    assert.equal(cultureSwarmHash(u.bodies), pin, `unfed take sheet, seed ${seed}, 60 s: the bodies are 6A’s`);
  }
  // Fed (mid, 120 bpm): 6A's bodies to the bit up to the step before the first growth; the growth then changes them.
  for (const [seed, first, pin, mainAt] of [
    [7, 1976, 774063707, 3615503007],
    [42, 1836, 1179149084, 1254146995],
  ]) {
    const f = world(seed, CULTURE_TAKE_SHEET);
    setCultureRoom(f, { energy: 'mid', silent: 0, bpm: 120 });
    for (let s = 1; s < first; s++) stepCultureWorld(f);
    assert.equal(f.ecology.grown, 0);
    assert.equal(cultureSwarmHash(f.bodies), pin, `fed, seed ${seed}: 6A’s bodies at step ${first - 1}`);
    stepCultureWorld(f);
    assert.equal(f.ecology.grown, 1, `the first growth at step ${first}`);
    assert.notEqual(cultureSwarmHash(f.bodies), mainAt, 'growth: the bodies leave 6A’s (a new law)');
  }
  ok(
    'hunger is the recipe’s gene (0 ignores food, 4 = 2 × 2); the native gene is 6A’s hunger, bodies equal to the bit',
  );
}

// 8 — the baby preview (T3).
{
  const w = world(7);
  touchPair(w);
  ready(w, [0, 1]);
  const h0 = cultureWorldHash(w);
  const p1 = cultureBabyPreviewOf(w, 0, 1);
  const p2 = cultureBabyPreviewOf(w, 0, 1);
  assert.deepEqual(p1, p2, 'deterministic');
  assert.equal(cultureWorldHash(w), h0, 'previewing changes nothing in the world');
  assert.ok(Object.isFrozen(p1) && Object.isFrozen(p1.body));
  assert.throws(() => cultureBabyPreviewOf(w, 0, 0), /itself/);
  assert.throws(() => cultureBabyPreviewOf(w, 0, 9), /no citizen/);
  // pure over frozen parents: nothing written
  const A = deepFreeze({ body: assembleCultureBody('moth', { scale: 0.95 }), recipe: davisWrite('moth', 1, 1).recipe });
  const B = deepFreeze({ body: assembleCultureBody('moth', { scale: 1.05 }), recipe: davisWrite('moth', 1, 2).recipe });
  const before = JSON.stringify([A, B]);
  const kid = cultureBabyPreview(A, B, { seed: 3, serial: 4 });
  assert.equal(JSON.stringify([A, B]), before, 'the parents are untouched');
  assert.deepEqual(cultureBabyPreview(A, B, { seed: 3, serial: 4 }), kid);
  assert.notDeepEqual(
    cultureBabyPreview(A, B, { seed: 3, serial: 5 }).fromB,
    kid.fromB,
    'the serial reaches the draws',
  );
  // the baby the world deals IS its preview
  stepCultureBreeding(w);
  const c = w.citizens.list[kidOf(w)];
  assert.equal(JSON.stringify(c.body), JSON.stringify(p1.body), 'the body');
  assert.deepEqual(c.recipe, p1.recipe, 'the recipe');
  assert.equal(c.phase0, p1.phase0);
  assert.equal(c.heading, p1.heading);
  for (let k = 0; k < c.n; k++) assert.equal(w.bodies.radius[c.first + k], Math.fround(p1.body.parts[k].radius));
  // the bench (T3 engine): the child drives on its parents' gait
  const bench = cultureTestDriveBaby(A, B, { seed: 3, serial: 4, kind: 'performing', beats: 2.5 });
  assert.deepEqual(bench.baby, kid);
  assert.deepEqual(
    bench.drive,
    cultureTestDrive({ body: kid.body, recipe: kid.recipe, phase0: kid.phase0 }, { kind: 'performing', beats: 2.5 }),
  );
  const parentDrive = cultureTestDrive({ ...A, phase0: 0 }, { kind: 'performing', beats: 2.5 });
  assert.equal(bench.drive.gaitId, parentDrive.gaitId, 'the same gait as its parent');
  const still = cultureTestDriveBaby(A, B, { seed: 3, serial: 4, beats: 3, reducedMotion: true });
  assert.ok(
    still.drive.nodes.every((n) => n.pose.dx === 0 && n.pose.dy === 0),
    'reduced motion holds still',
  );
  const bad = deepFreeze({ ...B, body: { ...B.body, plan: 'nope' } });
  assert.throws(() => cultureTestDriveBaby(A, bad), /one plan/);
  ok(
    'the baby preview: deterministic and pure; the world’s baby is its preview; the bench drives it on the parents’ gait',
  );
}

// 9 — fresh cast per take.
{
  const seed = 2;
  const pristine = world(seed, CULTURE_TAKE_SHEET);
  const hP = cultureWorldHash(pristine);
  const lived = world(seed, CULTURE_TAKE_SHEET);
  setCultureRoom(lived, { energy: 'mid', silent: 0, bpm: 120 });
  for (let s = 0; s < 4800; s++) stepCultureWorld(lived);
  assert.ok(lived.ecology.births > 0 && lived.ecology.grown > 0, 'the take lived: births and growth');
  assert.throws(() => castCultureTake(lived, CULTURE_TAKE_SHEET), /casts fresh each take/, 'no second cast');
  // the next take is a new world: exactly the pristine cast
  const next = world(seed, CULTURE_TAKE_SHEET);
  assert.equal(cultureWorldHash(next), hP, 'the next take’s world is the pristine cast, to the bit');
  assert.equal(next.citizens.list.length, pristine.citizens.list.length, 'no baby carried');
  for (let i = 0; i < next.citizens.list.length; i++) {
    const l = cultureCitizenLife(next, i);
    assert.equal(l.stage, 1, 'no growth carried');
    assert.equal(l.fat, 50);
    assert.deepEqual(l.parents, [-1, -1], 'everyone cast, nobody bred');
    assert.ok(
      l.sockets.every((s) => !s.looted),
      'no looted limb carried',
    );
    assert.equal(next.citizens.list[i].body, next.ecology.lives[i].bornBody, 'the born body, ungrown');
  }
  // the shell: each gate-on run casts a fresh world
  const host = () => ({ requestAnimationFrame: () => 1, cancelAnimationFrame: () => {}, listen: () => () => {} });
  const stop1 = runCultureShell(true, seed, host());
  const w1 = standingCultureWorld();
  setCultureRoom(w1, { energy: 'mid', silent: 0, bpm: 120 });
  for (let s = 0; s < 4800; s++) stepCultureWorld(w1);
  assert.ok(w1.ecology.births > 0);
  stop1();
  const stop2 = runCultureShell(true, seed, host());
  const w2 = standingCultureWorld();
  assert.notEqual(w2, w1, 'a new world');
  assert.equal(w2.citizens.list.length, pristine.citizens.list.length, 'cast fresh: nothing inherited');
  assert.equal(cultureEcologyHash(w2.ecology), cultureEcologyHash(pristine.ecology), 'the ecology born fresh');
  stop2();
  assert.equal(standingCultureWorld(), null);
  ok(
    'fresh cast per take: the next take is the pristine cast — no babies, growth or loot carried; the shell casts fresh',
  );
}

// 10 — determinism and the hash.
{
  const twin = () => {
    const w = world(2, CULTURE_TAKE_SHEET);
    setCultureRoom(w, { energy: 'mid', silent: 0, bpm: 120 });
    for (let s = 0; s < 4800; s++) stepCultureWorld(w);
    return w;
  };
  const a = twin();
  const b = twin();
  assert.ok(a.ecology.births > 0);
  assert.equal(cultureWorldHash(a), cultureWorldHash(b), 'twin worlds with births bit-identical');
  const h = cultureWorldHash(a);
  const kid = a.citizens.list.length - 1;
  const life = a.ecology.lives[kid];
  const poke = (msg, fn, undo) => {
    fn();
    assert.notEqual(cultureWorldHash(a), h, `the hash covers ${msg}`);
    undo();
    assert.equal(cultureWorldHash(a), h);
  };
  for (const k of ['stage', 'meals', 'children', 'linkFirst'])
    poke(
      k,
      () => (life[k] += 1),
      () => (life[k] -= 1),
    );
  const par = life.parents;
  poke(
    'the parents',
    () => (life.parents = [par[1], par[0]]),
    () => (life.parents = par),
  );
  for (const k of ['births', 'birthsRefused', 'birthsCapped', 'birthsNoRoom', 'grown'])
    poke(
      k,
      () => (a.ecology[k] += 1),
      () => (a.ecology[k] -= 1),
    );
  const bb = life.bornBody;
  poke(
    'a born part’s radius',
    () => (life.bornBody = { ...bb, parts: bb.parts.map((p, k) => (k === 2 ? { ...p, radius: p.radius + 1e-9 } : p)) }),
    () => (life.bornBody = bb),
  );
  poke(
    'a born part’s look',
    () =>
      (life.bornBody = {
        ...bb,
        parts: bb.parts.map((p, k) =>
          k === 2 ? { ...p, look: { ...p.look, tone: 'main' === p.look.tone ? 'ink' : 'main' } } : p,
        ),
      }),
    () => (life.bornBody = bb),
  );
  const c = a.citizens.list[kid];
  const body = c.body;
  poke(
    'the grown body (scale)',
    () => (c.body = { ...body, scale: body.scale * 1.08 }),
    () => (c.body = body),
  );
  const rec = c.recipe;
  poke(
    'the hunger gene',
    () => (c.recipe = { ...rec, drives: { ...rec.drives, hunger: rec.drives.hunger + 1e-9 } }),
    () => (c.recipe = rec),
  );
  ok(
    'determinism: twin worlds with births bit-identical; the hash covers stage, meals, lineage, tallies, the born body, the gene',
  );
}

console.log(`cultureBreed.selfcheck: ${checks}/10 groups OK`);
