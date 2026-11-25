// node src/engine/cultureBeast.selfcheck.mjs
// CULTURE Phase 5, slice C — the Strandbeest as a citizen (the parent epic 1863 as a CULTURE body).
//   1. the plan: an assembled tree of discs (beam of hubs, six hips), six sockets, cap 6, every one a crank throw;
//      a layout, not a sticker; the cap and sockets are the PLAN's
//   2. KINETIC's genes and LOIS's stillbirth: seeded, legal, deterministic measures; an unassemblable set is a hard
//      fault (never a low score); the cast records it
//   3. the legs are CLOSED FORM: every bone is the Jansen solver's own joint, laid flat beside the beam; the bones are
//      the beast adapter's nodes; a planted foot is in its stance band, at the outer edge of its reach
//   4. the walking law: bank targets (inner bank braked, never backwards, no desire no crank), the closed-form motion,
//      and a gripped free frame moves at the closed-form speed — advance 0 walks in place, a stopped crank stands
//   5. steering is differential phase: the heading turns only by the banks' difference, toward the desire
//   6. it stands on the soil: dead ground slips the feet, a withered hip loses its leg, a withered head kills
//   7. it lives: 20 seeds × 60 s in the gated world — inside the dish, alive, walking
//   8. determinism and the hash: twin worlds bit-identical; the hash covers the crank and the genes; the swimmers'
//      worlds are slice B's to the bit (pinned against origin/main f0e7a7b)
//   9. the gait: the beast wears its gait through the beast adapter, the layout carries it per bone; gait never moves a body
import assert from 'node:assert/strict';
import { STAGE_COLS, STAGE_ROWS } from './dishLifeStage.mjs';
import {
  assembleCultureBody,
  cultureBodyFaults,
  cultureBodyPlan,
  cultureBodyRestPose,
  cultureLinkageFeasible,
  CULTURE_PLAN_STRANDBEEST,
  CULTURE_BODY_PLANS,
} from './cultureBody.mjs';
import {
  cultureBeastFrame,
  cultureBeastBones,
  cultureBeastFeet,
  cultureBeastTheta,
  cultureBeastGaitNumbers,
  cultureBeastBankTargets,
  cultureBeastMotion,
  cultureBeastSteer,
  CULTURE_BEAST_PX,
  CULTURE_BEAST_DEAD_GRIP,
  CULTURE_BEAST_DIAL_READING,
  CULTURE_BEAST_STEP_S,
} from './cultureBeast.mjs';
import {
  curatorAudition,
  curatorCast,
  kineticMeasures,
  loisGate,
  CULTURE_NATIVE_RECIPES,
  CULTURE_TAKE_SHEET,
  CULTURE_CAST_SHEET,
  CULTURE_KINETIC_MEASURE_LEAN,
} from './cultureLab.mjs';
import { normalizeCultureRecipe, CULTURE_RECIPE_BOUNDS } from './cultureMotion.mjs';
import {
  stepCultureCitizens,
  rehomeCultureCitizens,
  cultureCitizensHash,
  enrolCultureCitizen,
} from './cultureCitizens.mjs';
import { stepCultureSwarm, cultureSwarmHash } from './cultureSwarm.mjs';
import { stepCultureSolver } from './cultureSolver.mjs';
import { cultureTreeOf, cultureGaitHash } from './cultureGait.mjs';
import { CULTURE_FAT_BIRTH_TICKS, CULTURE_UPKEEP_BODY_TICKS, CULTURE_STARVE_STEPS } from './cultureEcology.mjs';

/**
 * The cast at hunger lean 0 — 6A/6B's hunger: every citizen's gene back at its plan's native (2). The cast itself
 * (bodies, spots, every other dial) is lean-independent (LOIS never reads the gene), so this is exactly the lean-0 cast.
 */
const atLeanZero = (w) => {
  for (const c of w.citizens.list)
    c.recipe = normalizeCultureRecipe({
      ...c.recipe,
      drives: { ...c.recipe.drives, hunger: CULTURE_NATIVE_RECIPES[c.plan].drives.hunger },
    });
  return w;
};

/** Phase 6A: an unfed citizen cast at step 0 starves on this world step (fat 0 at 6,000, then 600 steps at 0). */
const STARVED_AT = CULTURE_FAT_BIRTH_TICKS / CULTURE_UPKEEP_BODY_TICKS + CULTURE_STARVE_STEPS - 1;
import {
  createCultureWorld,
  castCultureTake,
  stepCultureWorld,
  cultureWorldHash,
  cultureCitizenAt,
  setCultureRoom,
} from './cultureWorld.mjs';
import { solvePose } from './jansenSolver.js';
import { BEAST_BARS } from './beastBuilder.js';
import { JANSEN_RELATIVE, MEASURE_IDS, MEASURE_RANGES } from './jansenMeasures.js';

let checks = 0;
const ok = (name) => {
  checks++;
  console.log(`  ok ${checks} — ${name}`);
};
const field = (v) => ({
  cols: STAGE_COLS,
  rows: STAGE_ROWS,
  gen: 0,
  level: new Float32Array(STAGE_COLS * STAGE_ROWS).fill(v),
});
const LIVE = field(1);

/** The first admitted strandbeest candidate for a seed (LOIS's gate over a living field). */
function admitted(seed, slot = 0) {
  for (let a = 0; a < 16; a++) {
    const c = curatorAudition(CULTURE_PLAN_STRANDBEEST, seed, slot, a);
    if (loisGate(c, LIVE).admitted) return c;
  }
  throw new Error('no admitted strandbeest');
}

/**
 * A bench world: one strandbeest dealt into a fresh world's tables at (x, y, heading), stepped by its own harness —
 * citizens' muscle → swarm → rehome → solver on a FIXED soil field (no culture growing under it), so the walking law
 * is read alone. `recipe` overrides the native.
 */
function bench({ x = 960, y = 540, heading = 0, recipe = null, seed = 7 } = {}) {
  const w = createCultureWorld({ seed });
  // the Lab's admitted member, placed where the bench wants it, dealt into the tables as the cast door deals
  const m = admitted(seed);
  const member = { ...m, x, y, heading, recipe: recipe || m.recipe };
  const first = w.bodies.count;
  const pose = cultureBodyRestPose(member.body, x, y, heading);
  member.body.parts.forEach((p, k) => {
    w.bodies.alive[first + k] = 1;
    w.bodies.x[first + k] = pose[k].x;
    w.bodies.y[first + k] = pose[k].y;
    w.bodies.mass[first + k] = 60;
    w.bodies.radius[first + k] = p.radius;
  });
  w.bodies.count += member.body.parts.length;
  for (const l of member.body.links) {
    const i = w.links.count;
    w.links.a[i] = first + l.a;
    w.links.b[i] = first + l.b;
    w.links.rest[i] = l.rest;
    w.links.count += 1;
  }
  // enrolled through the citizens' own table door
  enrolCultureCitizen(w.citizens, { ...member, seed: 99 }, first, 0);
  w.citizens.cast = 1;
  return w;
}
function benchStep(w, f = LIVE) {
  stepCultureCitizens(w.bodies, w.citizens, f, w.step);
  stepCultureSwarm(w.bodies);
  rehomeCultureCitizens(w.bodies, w.citizens);
  stepCultureSolver(w.bodies, w.statics, w.links);
  w.step += 2;
}
const head = (w) => ({ x: w.bodies.x[0], y: w.bodies.y[0] });
const recipeWith = (base, patch) =>
  normalizeCultureRecipe({
    name: base.name,
    drives: { ...base.drives, ...(patch.drives || {}) },
    physics: { ...base.physics, ...(patch.physics || {}) },
    seasoning: { ...base.seasoning, ...(patch.seasoning || {}) },
  });

// 1 — the plan.
{
  assert.ok(CULTURE_BODY_PLANS.includes(CULTURE_PLAN_STRANDBEEST));
  const b = assembleCultureBody(CULTURE_PLAN_STRANDBEEST);
  assert.deepEqual(cultureBodyFaults(b), [], 'the wild type assembles clean');
  assert.equal(b.parts.length, 10, 'head + 3 spine (two hubs and a tail) + 6 hips');
  assert.equal(b.links.length, 9, 'one tree');
  assert.deepEqual(
    b.parts.map((p) => p.role),
    ['head', 'spine', 'spine', 'spine', 'limb', 'limb', 'limb', 'limb', 'limb', 'limb'],
  );
  assert.equal(b.sockets.length, 6);
  assert.equal(b.socketCap, 6);
  assert.ok(
    b.sockets.every((s) => s.occupant >= 0 && s.accepts === 'leg'),
    'every socket born occupied by its hip: a crank throw',
  );
  assert.ok(new Set(b.parts.map((p) => p.look.shape)).size >= 3, 'a layout of at least three shapes');
  assert.ok(Object.isFrozen(b.linkage) && Object.isFrozen(b.linkage.measures));
  for (const id of MEASURE_IDS) assert.equal(b.linkage.measures[id], JANSEN_RELATIVE[id], `${id}: the wild type`);
  assert.equal(b.linkage.measures.legCount, cultureBodyPlan(CULTURE_PLAN_STRANDBEEST).linkage.legs);
  // the cap and the socket set are the PLAN's: a forged seventh socket, a raised cap, are refused
  const forged = { ...b, sockets: [...b.sockets, { ...b.sockets[0], id: 'tail.x' }], socketCap: 7 };
  const f = cultureBodyFaults(forged);
  assert.ok(f.includes('sockets over the plan cap') && f.includes("socket cap is not the plan's"), f.join('; '));
  // a linkage on a swimmer's plan is refused; a beast with no linkage is refused
  assert.ok(
    cultureBodyFaults({ ...assembleCultureBody('dish'), linkage: b.linkage }).includes(
      'a linkage on a plan that has none',
    ),
  );
  const { linkage: _drop, ...bare } = b;
  assert.ok(cultureBodyFaults(bare).includes('no linkage'));
  // swimmers assemble exactly as before: no linkage key at all
  assert.ok(!('linkage' in assembleCultureBody('dish')) && !('linkage' in assembleCultureBody('moth')));
  // the recipe reading: every dial accounted for
  const dials = Object.keys(CULTURE_RECIPE_BOUNDS).flatMap((g) =>
    Object.keys(CULTURE_RECIPE_BOUNDS[g]).map((k) => `${g}.${k}`),
  );
  assert.deepEqual(Object.keys(CULTURE_BEAST_DIAL_READING).sort(), dials.sort());
  ok('the plan: a beam of hubs and six hips, one tree, six crank-throw sockets capped by the plan, a layout of marks');
}

// 2 — KINETIC's genes, LOIS's stillbirth.
{
  const a = kineticMeasures(7, 3);
  assert.deepEqual(a, kineticMeasures(7, 3), 'seeded: the same draw');
  assert.notDeepEqual(a, kineticMeasures(7, 4));
  for (let c = 0; c < 64; c++) {
    const m = kineticMeasures(11, c);
    for (const id of MEASURE_IDS) {
      const r = MEASURE_RANGES[id];
      assert.ok(m[id] >= r.min && m[id] <= r.max, `${id} in range`);
      assert.ok(
        Math.abs(m[id] / JANSEN_RELATIVE[id] - 1) <= CULTURE_KINETIC_MEASURE_LEAN + 1e-12,
        `${id} leaned at most ±${CULTURE_KINETIC_MEASURE_LEAN}`,
      );
    }
  }
  // stillbirths exist in the seeded deal and are HARD faults, never low praise
  let still = 0;
  let live = 0;
  for (let c = 0; c < 64; c++) {
    const cand = curatorAudition(CULTURE_PLAN_STRANDBEEST, 5, 0, c % 16);
    const b = assembleCultureBody(CULTURE_PLAN_STRANDBEEST, { measures: kineticMeasures(5, c) });
    const feasible = cultureLinkageFeasible(b.linkage);
    const faults = cultureBodyFaults(b);
    assert.equal(faults.includes('a stillbirth: the linkage cannot assemble'), !feasible);
    if (feasible) live++;
    else {
      still++;
      const v = loisGate({ ...cand, body: b }, LIVE);
      assert.equal(v.admitted, false);
      assert.equal(v.praise, 0, 'a stillbirth is refused outright, never scored');
      assert.ok(v.faults.includes('a stillbirth: the linkage cannot assemble'));
    }
  }
  assert.ok(still > 0 && live > still, `stillbirths happen and are the minority (${still} of 64)`);
  // a cast of strandbeests: members all assemble; a slot where every audition is stillborn is refused and recorded
  const cast = curatorCast(7, LIVE, { plan: CULTURE_PLAN_STRANDBEEST, count: 4 });
  assert.ok(cast.members.length >= 1);
  for (const m of cast.members) assert.ok(cultureLinkageFeasible(m.body.linkage));
  assert.deepEqual(
    cultureBodyFaults(assembleCultureBody(CULTURE_PLAN_STRANDBEEST, { measures: { ...JANSEN_RELATIVE, j: 0.9 } })),
    ['a stillbirth: the linkage cannot assemble'],
  );
  ok('KINETIC deals seeded, legal, leaned measure genes; a stillbirth is a hard fault LOIS refuses, never a low score');
}

// 3 — the legs are closed form.
{
  const w = bench();
  const c = w.citizens.list[0];
  const fr = cultureBeastFrame(c.body);
  assert.equal(fr.px, CULTURE_BEAST_PX * c.body.scale);
  c.pA = 0.137;
  c.pB = 0.611;
  c.heading = 0.4;
  const bones = cultureBeastBones(w.bodies, c);
  const tree = cultureTreeOf('beast', c.linkage);
  assert.equal(bones.length, tree.nodes.length, 'the bones are the beast adapter’s nodes, one for one');
  assert.equal(bones.length, 1 + 6 * BEAST_BARS.length);
  assert.equal(bones[0].id, 'beam');
  // every bar is the solver's own joint, laid flat: recompute leg 3 (bank B) independently from solvePose
  const li = 3;
  const L = fr.legs[li];
  assert.equal(L.bank, 1);
  assert.equal(L.side, -1);
  const theta = cultureBeastTheta(c.linkage, li, c.pB);
  const sol = solvePose(c.linkage.measures, theta, 1);
  const P = { O: { x: 0, y: 0 }, G: { x: -c.linkage.measures.a, y: -c.linkage.measures.l }, ...sol.joints };
  const hx = w.bodies.x[c.first + L.hip];
  const hy = w.bodies.y[c.first + L.hip];
  const ux = Math.cos(c.heading);
  const uy = Math.sin(c.heading);
  const ox = -uy * L.side;
  const oy = ux * L.side;
  const at = (p) => ({ x: hx + (ux * p.x - ox * p.y) * fr.px, y: hy + (uy * p.x - oy * p.y) * fr.px });
  BEAST_BARS.forEach(([name, from, to], b) => {
    const bone = bones[1 + li * BEAST_BARS.length + b];
    assert.equal(bone.id, `${li}:${name}`);
    assert.ok(
      Math.abs(bone.x - at(P[from]).x) < 1e-9 && Math.abs(bone.ty - at(P[to]).y) < 1e-9,
      `${name}: closed form`,
    );
  });
  // the bars keep their lengths: a rigid linkage at every crank angle (bar b is G–J2 at measure b × px)
  for (let k = 0; k < 12; k++) {
    c.pA = k / 12;
    c.pB = k / 12;
    const bb = cultureBeastBones(w.bodies, c);
    for (let leg = 0; leg < 6; leg++) {
      const bar = bb.find((q) => q.id === `${leg}:b`);
      assert.ok(Math.abs(bar.len - c.linkage.measures.b * fr.px) < 1e-9, 'bar b keeps its length');
    }
  }
  // a planted foot is in its stance band — and at the outer edge of the leg's reach (the profile laid flat)
  const g = cultureBeastGaitNumbers(c.linkage);
  let seen = 0;
  for (let k = 0; k < 60; k++) {
    c.pA = k / 60;
    c.pB = k / 60;
    for (const f of cultureBeastFeet(w.bodies, c)) {
      const Lg = fr.legs[f.leg];
      const th = cultureBeastTheta(c.linkage, f.leg, Lg.bank === 0 ? c.pA : c.pB);
      const Fy = solvePose(c.linkage.measures, th, 1).joints.F.y;
      assert.equal(f.planted, Fy <= g.stanceY);
      if (f.planted) {
        seen++;
        // outward distance of the planted foot from its hip, on its own side
        const sx = -uy * Lg.side;
        const sy = ux * Lg.side;
        const reach = (f.x - w.bodies.x[c.first + Lg.hip]) * sx + (f.y - w.bodies.y[c.first + Lg.hip]) * sy;
        assert.ok(reach > -g.minY * fr.px * 0.95, 'a planted foot stands at the outer edge of its reach');
      }
    }
  }
  assert.ok(seen > 0);
  ok(
    'the legs are closed form: every bar is the Jansen solver’s joint laid flat; the bones are the beast adapter’s nodes; planted feet stand outermost',
  );
}

// 4 — the walking law.
{
  const r = CULTURE_NATIVE_RECIPES[CULTURE_PLAN_STRANDBEEST];
  const base = 1 / (r.seasoning.timing * CULTURE_BEAST_STEP_S);
  assert.deepEqual(cultureBeastBankTargets(r, 0, 1), { rA: base, rB: base }, 'straight: both banks at the timing rate');
  const left = cultureBeastBankTargets(r, 1, 1);
  assert.equal(left.rB, base, 'turning left: the outer (right) bank holds');
  assert.ok(Math.abs(left.rA - base * (1 - 2 * r.physics.paddle)) < 1e-12, 'the inner (left) bank brakes by 2·g');
  const hard = cultureBeastBankTargets(recipeWith(r, { physics: { paddle: 0.6 } }), -1, 1);
  assert.equal(hard.rB, 0, 'an inner bank never runs backwards');
  assert.deepEqual(cultureBeastBankTargets(r, 0.3, 0), { rA: 0, rB: 0 }, 'no desire, no crank');
  assert.equal(cultureBeastSteer(0, r.seasoning), 0);
  assert.equal(cultureBeastSteer(10, r.seasoning), 1);
  assert.equal(cultureBeastSteer(-10, r.seasoning), -1);
  const fr = cultureBeastFrame(admitted(7).body);
  const mo = cultureBeastMotion(fr, r, 1, 1);
  assert.ok(Math.abs(mo.v - fr.stride * Math.min(1, r.physics.thrust)) < 1e-9 && mo.w === 0);
  // a desire straight ahead: the rim drive alone, the bench at the left wall facing +x — it walks away from the wall
  const rim = recipeWith(r, { drives: { wander: 0, ground: 0, rim: 3 } });
  const walk = (recipe, f = LIVE) => {
    const w = bench({ recipe, x: 40, y: 540, heading: 0 });
    const h0 = head(w);
    for (let s = 0; s < 120; s++) benchStep(w, f);
    return Math.hypot(head(w).x - h0.x, head(w).y - h0.y);
  };
  const go = walk(rim);
  const inPlace = walk(recipeWith(rim, { physics: { thrust: 0 } }));
  assert.ok(go > 30, `it walks (${go.toFixed(1)} px in 2 s)`);
  assert.ok(inPlace < go / 8, `advance 0 walks in place (${inPlace.toFixed(1)} px)`);
  const stand = (() => {
    const w = bench({ recipe: recipeWith(r, { drives: { wander: 0, ground: 0, rim: 0 } }), x: 960, heading: 0 });
    const c = w.citizens.list[0];
    const h0 = head(w);
    for (let s = 0; s < 120; s++) benchStep(w);
    return { d: Math.hypot(head(w).x - h0.x, head(w).y - h0.y), c };
  })();
  assert.equal(stand.c.rA, 0);
  assert.equal(stand.c.rB, 0);
  // the crank is stopped; only the swarm's own flocking over its parts (the dish's physics, every body's) still
  // nudges it — a small drift against the walk, the planted feet braking it
  assert.ok(
    stand.d < go / 5,
    `a stopped crank is a beast that stands (${stand.d.toFixed(2)} px vs ${go.toFixed(1)} walking)`,
  );
  // the closed-form speed bounds the walk: never faster than stride × advance × the fastest bank
  const fr2 = cultureBeastFrame(bench().citizens.list[0].body);
  assert.ok(go <= fr2.stride * base * 2 * 1.05, 'never faster than the stance stroke allows');
  ok(
    'the walking law: inner-bank braking, never backwards; the stance stroke is the motor — advance 0 walks in place, a stopped crank stands',
  );
}

// 5 — steering is differential phase.
{
  const r = CULTURE_NATIVE_RECIPES[CULTURE_PLAN_STRANDBEEST];
  const ground = recipeWith(r, { drives: { wander: 0, ground: 2, rim: 0 } });
  // half the dish living: the ground drive leans the beast toward it. Facing up (−90°) on dead ground just left of a
  // living right half, the desire is +x (a turn toward +angle); mirrored, it is −x (toward −angle).
  const half = (livingRight) => {
    const f = field(0);
    for (let cy = 0; cy < STAGE_ROWS; cy++)
      for (let cx = 0; cx < STAGE_COLS; cx++)
        if (cx >= STAGE_COLS / 2 === livingRight) f.level[cy * STAGE_COLS + cx] = 1;
    return f;
  };
  const turn = (livingRight, recipe) => {
    const f = half(livingRight);
    const w = bench({ recipe, x: livingRight ? 900 : 1020, y: 540, heading: -Math.PI / 2 });
    const c = w.citizens.list[0];
    const h0 = c.heading;
    for (let s = 0; s < 180; s++) benchStep(w, f);
    return { dh: c.heading - h0, dp: c.pB - c.pA };
  };
  const L = turn(true, ground);
  const R = turn(false, ground);
  assert.ok(L.dp > 0, 'toward +angle the right (outer) bank runs ahead');
  assert.ok(R.dp < 0, 'toward −angle the left (outer) bank runs ahead');
  assert.ok(
    L.dh > 0.2 && R.dh < -0.2,
    `each turns toward its desire (${(L.dh * 57.3).toFixed(0)}°, ${(R.dh * 57.3).toFixed(0)}°)`,
  );
  // the heading is the crank's: with the banks together it does not turn at all, whatever the dish does to the discs
  const L0 = turn(true, recipeWith(ground, { physics: { paddle: 0 } }));
  const R0 = turn(false, recipeWith(ground, { physics: { paddle: 0 } }));
  assert.equal(L0.dp, 0, 'turn gain 0: the banks never part');
  assert.equal(R0.dp, 0);
  assert.equal(L0.dh, 0, 'and the heading never turns');
  assert.equal(R0.dh, 0);
  ok(
    'steering is differential phase: the outer bank runs ahead and the heading turns toward the desire; equal banks never turn',
  );
}

// 6 — it stands on the soil.
{
  const r = CULTURE_NATIVE_RECIPES[CULTURE_PLAN_STRANDBEEST];
  const rim = recipeWith(r, { drives: { wander: 0, ground: 0, rim: 3 } });
  const walk = (f) => {
    const w = bench({ recipe: rim, x: 40, y: 540, heading: 0 });
    const h0 = head(w);
    for (let s = 0; s < 120; s++) benchStep(w, f);
    return Math.hypot(head(w).x - h0.x, head(w).y - h0.y);
  };
  const living = walk(LIVE);
  const dead = walk(field(0));
  assert.ok(
    dead < living * 0.8 && dead > 0,
    `feet on dead ground slip (${dead.toFixed(1)} vs ${living.toFixed(1)} px)`,
  );
  assert.ok(CULTURE_BEAST_DEAD_GRIP > 0 && CULTURE_BEAST_DEAD_GRIP < 1);
  // a withered hip: its leg's bones are gone, its foot never plants
  const w = bench();
  const c = w.citizens.list[0];
  const hip = cultureBeastFrame(c.body).legs[2].hip;
  w.bodies.alive[c.first + hip] = 0;
  const bones = cultureBeastBones(w.bodies, c);
  assert.ok(bones.filter((b) => b.leg === 2).every((b) => !b.alive && b.len === 0));
  assert.ok(bones.filter((b) => b.leg === 1).every((b) => b.alive));
  for (let k = 0; k < 30; k++) {
    c.pA = k / 30;
    assert.equal(cultureBeastFeet(w.bodies, c)[2].planted, false);
  }
  // the head withers in the real world: the beast is dead, cause soil (the soil judges its discs like anyone's)
  const world = createCultureWorld({ seed: 7 });
  castCultureTake(world, { plan: CULTURE_PLAN_STRANDBEEST, count: 1 });
  const b = world.citizens.list[0];
  world.bodies.alive[b.first] = 0;
  stepCultureWorld(world);
  stepCultureWorld(world);
  assert.equal(b.alive, 0);
  assert.equal(b.cause, 'soil');
  ok(
    'it stands on the soil: dead ground slips its feet, a withered hip loses its leg, a withered head is a dead beast',
  );
}

// 7 — it lives in the gated world.
{
  let n = 0;
  let axisSum = 0;
  let axisN = 0;
  let axisWorst = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const w = createCultureWorld({ seed });
    castCultureTake(w, CULTURE_TAKE_SHEET);
    const beasts = w.citizens.list.filter((c) => c.plan === CULTURE_PLAN_STRANDBEEST);
    const start = beasts.map((c) => [w.bodies.x[c.first], w.bodies.y[c.first]]);
    const path = beasts.map(() => 0);
    let prev = start.map((p) => [...p]);
    for (let s = 1; s <= 120 * 60; s++) {
      stepCultureWorld(w);
      if (s % 60) continue;
      beasts.forEach((c, i) => {
        // LOUD RE-PIN (Phase 6A): measured while the beast lives — a corpse has no crank, no chassis hold, no drives
        if (!c.alive) return;
        const x = w.bodies.x[c.first];
        const y = w.bodies.y[c.first];
        assert.ok(x >= 0 && x <= 1920 && y >= 0 && y <= 1080, `seed ${seed}: beast ${i} stays in the dish`);
        path[i] += Math.hypot(x - prev[i][0], y - prev[i][1]);
        prev[i] = [x, y];
        // the chassis holds its shape at the crank's heading: head to the mean of its two spine hubs (while they live —
        // the soil may wither a hub, and a beam with a hub gone has no axis to read)
        const h = c.first;
        if (!w.bodies.alive[h + 1] || !w.bodies.alive[h + 2]) return;
        const ax = Math.atan2(
          y - (w.bodies.y[h + 1] + w.bodies.y[h + 2]) / 2,
          x - (w.bodies.x[h + 1] + w.bodies.x[h + 2]) / 2,
        );
        const d = Math.abs(((ax - c.heading + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
        axisSum += d;
        axisN++;
        if (d > axisWorst) axisWorst = d;
      });
    }
    beasts.forEach((c, i) => {
      n++;
      // LOUD RE-PIN (Phase 6A — a changed law, spec §2.5 / §4 Q1): no room reading here, so no beat lands and no beast is
      // fed. Born with 50 fat at 1 fat/s, an unfed beast starves at fat 0 sustained 5 s — world step 6,599, inside this
      // minute — unless a hungry swimmer 1.2× its size (its legs are bones, so its disc area is small) kills it first.
      // Not fed here: "alive at 60 s" is now "lived until the new law took it"; the walk is measured over its life.
      const life = w.ecology.lives[w.citizens.list.indexOf(c)];
      assert.equal(c.alive, 0, `seed ${seed}: beast ${i}, unfed, does not outlive the minute`);
      assert.ok(c.cause === 'starvation' || c.cause === 'predation', `seed ${seed}: beast ${i} died by the new law`);
      if (c.cause === 'starvation' && life.loots === 0) assert.equal(c.diedStep, STARVED_AT, 'on the law’s step');
      const lifeS = c.diedStep / 120;
      assert.ok(path[i] / lifeS > 8, `seed ${seed}: beast ${i} walks (${(path[i] / lifeS).toFixed(1)} px/s)`);
      assert.ok(path[i] / lifeS < 90, `seed ${seed}: beast ${i} plods (${(path[i] / lifeS).toFixed(1)} px/s)`);
    });
  }
  assert.ok(n >= 30, `${n} beasts`);
  assert.ok(
    axisSum / axisN < 2 / 57.3,
    `the chassis stands on its heading (mean ${((axisSum / axisN) * 57.3).toFixed(2)}°)`,
  );
  assert.ok(axisWorst < 15 / 57.3, `never twisted far (worst ${(axisWorst * 57.3).toFixed(1)}°)`);
  ok(
    `it lives: 20 seeds × 60 s in the gated world — ${n} strandbeests, all inside the dish, walking, the chassis on its heading, until the new law (unfed)`,
  );
}

// 8 — determinism and the hash.
{
  const twin = () => {
    const w = createCultureWorld({ seed: 42 });
    castCultureTake(w, CULTURE_TAKE_SHEET);
    setCultureRoom(w, { energy: 'high', silent: 0, bpm: 128 });
    for (let s = 0; s < 1200; s++) stepCultureWorld(w);
    return w;
  };
  const a = twin();
  const b = twin();
  assert.equal(cultureWorldHash(a), cultureWorldHash(b), 'twin worlds bit-identical');
  const ia = a.citizens.list.findIndex((c) => c.plan === CULTURE_PLAN_STRANDBEEST);
  assert.equal(JSON.stringify(cultureCitizenAt(a, ia)), JSON.stringify(cultureCitizenAt(b, ia)), 'layouts too');
  const h = cultureCitizensHash(a.citizens);
  const c = a.citizens.list[ia];
  for (const k of ['pA', 'pB', 'rA', 'rB']) {
    const v = c[k];
    c[k] = v + 1e-9;
    assert.notEqual(cultureCitizensHash(a.citizens), h, `the hash covers ${k}`);
    c[k] = v;
  }
  const lk = c.linkage;
  c.linkage = { ...lk, measures: { ...lk.measures, h: lk.measures.h + 1e-9 } };
  assert.notEqual(cultureCitizensHash(a.citizens), h, 'the hash covers the measure genes');
  c.linkage = lk;
  assert.equal(cultureCitizensHash(a.citizens), h);
  // LOUD RE-PIN (Phase 6A — a changed law: creatures eat beats, every citizen carries fat, and the world hash folds the
  // ecology). The slice C claim was "the swimmers' worlds are slice B's to the bit", pinned as WHOLE world hashes with the
  // room on (origin/main f0e7a7b: 2889846307, 55187148, 1880458193, 3345345550). Under the new law:
  //   (a) room OFF — no beat lands, no food is sensed, and in 1,200 steps (10 s) nobody is hungry (fat 40 > 30) or
  //       starving: the body table, the citizens and the gait layer are slice B's / slice C's to the bit — the swarm,
  //       citizens and gait hashes are pinned against origin/main 75985b0 (computed on a pristine detached worktree);
  //       only the world hash moves, by the ecology's fold.
  //   (b) room ON — the beats land as morsels and the citizens turn toward them and eat: the bodies move differently by
  //       law. The whole world hashes are re-pinned to this slice's values (twin-checked above).
  const ROSTER_5B = {
    roster: [
      { plan: 'dish', count: 3 },
      { plan: 'moth', count: 2 },
    ],
  };
  const quietPins = [
    // LOUD RE-PIN (hunger lean, RULED 2026-11-25 — a changed law): DAVIS leans the hunger gene ±15 % at cast, and the
    // citizens hash folds every recipe dial, so it moves again (was, at lean 0 = Phase 6B's: 2760788251, 2284435313,
    // 4286813388, 3374000142, 3500107867, 193247732 — still reproduced at lean 0 by the lean-0 loop below). The swarm and
    // gait hashes are UNCHANGED from origin/main 75985b0 — no room, no morsel, so the gene is never read.
    // [sheet, seed, swarm hash, citizens hash, gait hash] — room off, 1,200 steps
    [CULTURE_CAST_SHEET, 7, 13186533, 434725841, 1766681291],
    [CULTURE_CAST_SHEET, 42, 1934605904, 2907873094, 1766681291],
    [ROSTER_5B, 7, 736812686, 2333414505, 1766681291],
    [ROSTER_5B, 42, 223519438, 2003383088, 1766681291],
    [CULTURE_TAKE_SHEET, 7, 2791955768, 1180817175, 1766681291],
    [CULTURE_TAKE_SHEET, 42, 735201613, 1897956750, 1766681291],
  ];
  // lean 0 (the native gene in every citizen): Phase 6B's citizens hashes, to the bit.
  const quietPinsLeanZero = [
    [CULTURE_CAST_SHEET, 7, 2760788251],
    [CULTURE_CAST_SHEET, 42, 2284435313],
    [ROSTER_5B, 7, 4286813388],
    [ROSTER_5B, 42, 3374000142],
    [CULTURE_TAKE_SHEET, 7, 3500107867],
    [CULTURE_TAKE_SHEET, 42, 193247732],
  ];
  for (const [sheet, seed, cit] of quietPinsLeanZero) {
    const w = createCultureWorld({ seed });
    castCultureTake(w, sheet);
    atLeanZero(w);
    for (let s = 0; s < 1200; s++) stepCultureWorld(w);
    assert.equal(cultureCitizensHash(w.citizens), cit, `room off, lean 0 (seed ${seed}): the citizens are 6B's`);
  }
  for (const [sheet, seed, swarm, cit, gait] of quietPins) {
    const w = createCultureWorld({ seed });
    castCultureTake(w, sheet);
    for (let s = 0; s < 1200; s++) stepCultureWorld(w);
    assert.equal(w.ecology.morsels.length + w.ecology.serial, 0, 'room off: no beat lands');
    assert.equal(cultureSwarmHash(w.bodies), swarm, `room off (seed ${seed}): the bodies are origin/main's to the bit`);
    assert.equal(cultureCitizensHash(w.citizens), cit, `room off (seed ${seed}): the citizens are origin/main's`);
    assert.equal(cultureGaitHash(w.gait), gait, `room off (seed ${seed}): the gait layer is origin/main's`);
  }
  const roomPins = [
    // LOUD RE-PIN (Phase 6B — the hunger gene and the new ecology state fold into the world hash; was, 6A's:
    // 3241583243, 1396512032, 1755287174, 548154483). Nobody grows or breeds in these 10 s, so the swarm and gait hashes
    // must be origin/main dcc1ac6's (6A's) to the bit — pinned from a pristine detached worktree: the hunger gene
    // reproduces 6A's hunger exactly. LOUD RE-PIN (hunger lean, RULED 2026-11-25): that claim now holds ONLY at lean 0 —
    // these pins are asserted on worlds cast at lean 0 (`atLeanZero`: every gene the native 2), unchanged from 6B; the
    // leaned pins follow.
    // [sheet, seed, world hash, swarm hash (= 6A's), gait hash (= 6A's)] — room on (high, 128 bpm), 1,200 steps
    [CULTURE_CAST_SHEET, 7, 3778793516, 1751784904, 2446235502],
    [CULTURE_CAST_SHEET, 42, 2137699268, 1765348224, 2446235502],
    [ROSTER_5B, 7, 896174862, 3176631088, 1298961053],
    [ROSTER_5B, 42, 1577957186, 1328351648, 1298961053],
  ];
  for (const [sheet, seed, pin, swarmPin, gaitPin] of roomPins) {
    const w = createCultureWorld({ seed });
    castCultureTake(w, sheet);
    atLeanZero(w);
    setCultureRoom(w, { energy: 'high', silent: 0, bpm: 128 });
    for (let s = 0; s < 1200; s++) stepCultureWorld(w);
    assert.ok(w.ecology.eaten > 0, 'room on: the beats fed somebody');
    assert.equal(w.ecology.grown + w.ecology.births, 0, 'room on, 10 s: nobody grows or breeds yet');
    assert.equal(
      cultureSwarmHash(w.bodies),
      swarmPin,
      `room on, lean 0 (seed ${seed}): the bodies are 6A's to the bit`,
    );
    assert.equal(cultureGaitHash(w.gait), gaitPin, `room on, lean 0 (seed ${seed}): the gait is 6A's to the bit`);
    assert.equal(cultureWorldHash(w), pin, `swimmers' world, room on, lean 0 (seed ${seed}): 6B's world hash`);
  }
  const leanedRoomPins = [
    // LOUD RE-PIN (hunger lean, RULED 2026-11-25 — a changed law): the cast's own leaned genes, fed. The bodies leave 6A's
    // (a hungrier or less hungry swimmer turns toward the beats differently), so the swarm hashes move; the gait hash
    // of the cast sheet (no strandbeest) and of the 5B roster is unchanged. Computed on this branch, twin-checked above.
    // [sheet, seed, world hash, swarm hash, gait hash] — room on (high, 128 bpm), 1,200 steps
    [CULTURE_CAST_SHEET, 7, 2186576465, 3511416458, 2446235502],
    [CULTURE_CAST_SHEET, 42, 3819731255, 2732997930, 2446235502],
    [ROSTER_5B, 7, 351445135, 2439431368, 1298961053],
    [ROSTER_5B, 42, 3880720211, 3448273385, 1298961053],
  ];
  for (const [sheet, seed, pin, swarmPin, gaitPin] of leanedRoomPins) {
    const w = createCultureWorld({ seed });
    castCultureTake(w, sheet);
    setCultureRoom(w, { energy: 'high', silent: 0, bpm: 128 });
    for (let s = 0; s < 1200; s++) stepCultureWorld(w);
    assert.ok(w.ecology.eaten > 0, 'room on: the beats fed somebody');
    assert.equal(cultureSwarmHash(w.bodies), swarmPin, `room on, leaned (seed ${seed}): the bodies, re-pinned`);
    assert.equal(cultureGaitHash(w.gait), gaitPin, `room on, leaned (seed ${seed}): the gait`);
    assert.equal(cultureWorldHash(w), pin, `swimmers' world, room on, leaned (seed ${seed}): re-pinned`);
  }
  ok(
    'determinism: twin worlds and layouts bit-identical; the hash covers the crank and the genes; quiet swimmer worlds equal origin/main (bodies, citizens, gait); fed worlds re-pinned',
  );
}

// 9 — the gait.
{
  // LOUD RE-PIN (Phase 6A — a changed law: an audible room's beats now land as morsels the citizens turn toward, so a
  // room moves bodies through FEEDING). The gait claim below is about the gait alone, so the world it compares runs with
  // its morsels cleared after every step (`unfed`) — nothing is ever sensed, nobody turns toward food, and in 10 s
  // nobody is hungry or starving: the room's only remaining reach into the dish is the gait, as in slice C.
  const run = (room, unfed = false) => {
    const w = createCultureWorld({ seed: 7 });
    castCultureTake(w, CULTURE_TAKE_SHEET);
    if (room) setCultureRoom(w, room);
    for (let s = 0; s < 120 * 10; s++) {
      stepCultureWorld(w);
      if (unfed) w.ecology.morsels.length = 0;
    }
    return w;
  };
  const w = run({ energy: 'high', silent: 0, bpm: 120 });
  const i = w.citizens.list.findIndex((c) => c.plan === CULTURE_PLAN_STRANDBEEST);
  const c = w.citizens.list[i];
  const o = w.gait.out[`citizen:${i}`];
  assert.ok(o, 'the beast wears a gait');
  assert.equal(
    o.dx.length,
    cultureTreeOf('beast', c.linkage).nodes.length,
    'through the beast adapter: one pose per bone',
  );
  assert.ok(
    w.gait.log.some((e) => e.target === `citizen:${i}` && e.by === 'queen'),
    'the QUEEN picked it, recorded',
  );
  const L = cultureCitizenAt(w, i);
  assert.equal(L.bones.length, o.dx.length);
  assert.ok(
    L.bones.every((b, k) => b.gait && b.gait.dx === o.dx[k]),
    'each bone carries its node’s pose',
  );
  assert.ok(
    L.parts.every((p) => p.gait && p.gait.dx === o.dx[0]),
    'the discs ride the root (the beam)',
  );
  assert.ok(
    L.bones.some((b) => Math.hypot(b.gait.dx, b.gait.dy) > 0.01),
    'and it moves',
  );
  // no room: no gait, the layout's bones carry none
  const still = run(null);
  assert.ok(cultureCitizenAt(still, i).bones.every((b) => b.gait === null));
  // gait is a pose offset: the bodies move exactly as in the world without a room
  const cols = (x) => JSON.stringify([...x.bodies.x.slice(0, x.bodies.count), ...x.bodies.y.slice(0, x.bodies.count)]);
  const worn = run({ energy: 'high', silent: 0, bpm: 120 }, true);
  assert.ok(worn.ecology.serial > 0, 'the room was audible: beats landed (and were cleared)');
  assert.ok(worn.gait.out[`citizen:${i}`], 'the unfed world wears its gait too');
  assert.equal(cols(worn), cols(still), 'gait never moves a body');
  assert.equal(
    JSON.stringify(worn.citizens.list[i].pA),
    JSON.stringify(still.citizens.list[i].pA),
    'nor turns a crank',
  );
  assert.notEqual(cols(w), cols(still), 'the fed world differs (feeding moves bodies — the ecology, not the gait)');
  ok(
    'the gait: the beast wears its Canon gait through the beast adapter, one pose per bone, the discs on the root; gait never moves a body',
  );
}

console.log(`cultureBeast.selfcheck: ${checks}/9 groups OK`);
