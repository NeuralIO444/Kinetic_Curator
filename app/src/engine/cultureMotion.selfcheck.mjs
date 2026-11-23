// node src/engine/cultureMotion.selfcheck.mjs
// CULTURE Phase 5, slice A — Motion Core's CULTURE seam (engine/cultureMotion.mjs): the one
// behaviour API citizens use — senses → drives → feel (the 12 principles) → forces.
//   1. the recipe reading: whole recipes only, every dial bounded, loud refusals naming the dial
//   2. the 12 principles all accounted for — a runtime dial or a named Lab owner, none faked
//   3. the drives: bounded desires; wander seeded; ground leans to living ground and rests on
//      fertile ground; rim pushes in at the border and is silent in the middle
//   4. the feel curves: the stroke (timing, slow in/out, anticipation), the arc's turn rate, the
//      follow-through masses, the tone's braces
//   5. the muscle writes velocity only: the head along the turned heading, each part toward its
//      parent, limb tips paddled mirrored; no desire, no push; dead parts untouched
//   6. the look as a Motion Core source: lazy registration, the anchor law, squash keeps volume,
//      only the head breathes, the wither fades; composes with other sources
import assert from 'node:assert/strict';
import {
  normalizeCultureRecipe,
  cultureRecipeFaults,
  CULTURE_RECIPE_BOUNDS,
  CULTURE_PRINCIPLES,
  CULTURE_DRIVES,
  CULTURE_DRIVE_NAMES,
  CULTURE_SENSE_BODY_LENGTHS,
  CULTURE_ANTICIPATION_WINDOW,
  CULTURE_TURN_RATE_SNAP,
  CULTURE_TURN_RATE_ARC,
  CULTURE_FEEL_SOURCE_ID,
  CULTURE_FEEL_COST_TIER,
  CULTURE_TONE_BRACE,
  cultureSenses,
  cultureDesire,
  cultureSenseRange,
  cultureTurnRate,
  cultureStrokePhase,
  cultureStrokeEnvelope,
  cultureRecipeMasses,
  cultureBodyDepths,
  cultureBodyBraces,
  stepCultureCitizenMuscle,
  cultureFeelPose,
  ensureCultureFeelSource,
} from './cultureMotion.mjs';
import { assembleCultureBody, cultureBodyRestPose, CULTURE_PLAN_DISH } from './cultureBody.mjs';
import { CULTURE_NATIVE_RECIPES } from './cultureLab.mjs';
import { enrolCultureCitizen } from './cultureCitizens.mjs';
import { getMotionSource, composePose, POSE_IDENTITY } from './motionCore/index.js';
import { getCostTier } from './kernel/costRegistry.mjs';
import { CULTURE_SWARM_WORLD_W, CULTURE_SWARM_WORLD_H } from './cultureSwarm.mjs';
import { STAGE_COLS, STAGE_ROWS } from './dishLifeStage.mjs';

let checks = 0;
const ok = (name) => {
  checks++;
  console.log(`  ok ${checks} — ${name}`);
};
const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const NATIVE = CULTURE_NATIVE_RECIPES[CULTURE_PLAN_DISH];
const field = (fill) => ({
  cols: STAGE_COLS,
  rows: STAGE_ROWS,
  gen: 0,
  level: new Float32Array(STAGE_COLS * STAGE_ROWS).fill(fill),
});
const recipeWith = (patch) =>
  normalizeCultureRecipe({
    name: 'test',
    drives: { ...NATIVE.drives, ...(patch.drives || {}) },
    physics: { ...NATIVE.physics, ...(patch.physics || {}) },
    seasoning: { ...NATIVE.seasoning, ...(patch.seasoning || {}) },
  });
/** A table holding one citizen at rest at (x, y, heading), with its citizen record. */
function rig(x, y, heading, recipe = NATIVE) {
  const body = assembleCultureBody(CULTURE_PLAN_DISH);
  const n = body.parts.length;
  const bodies = {
    count: n,
    alive: new Uint8Array(n).fill(1),
    x: new Float32Array(n),
    y: new Float32Array(n),
    vx: new Float32Array(n),
    vy: new Float32Array(n),
    mass: new Float32Array(n).fill(1),
    radius: new Float32Array(n),
  };
  cultureBodyRestPose(body, x, y, heading).forEach((p, k) => {
    bodies.x[k] = p.x;
    bodies.y[k] = p.y;
    bodies.radius[k] = body.parts[k].radius;
  });
  const citizens = { list: [] };
  enrolCultureCitizen(citizens, { body, recipe, praise: 1, seed: 5, phase0: 0, heading }, 0, 0);
  return { bodies, c: citizens.list[0], body };
}

// 1 — the recipe reading.
{
  const r = normalizeCultureRecipe(NATIVE);
  assert.ok(Object.isFrozen(r) && Object.isFrozen(r.physics));
  assert.deepEqual(r, NATIVE);
  assert.deepEqual(cultureRecipeFaults(NATIVE), []);
  assert.throws(() => normalizeCultureRecipe(null), /must be an object/);
  assert.throws(() => normalizeCultureRecipe({ ...NATIVE, name: '' }), /needs a name/);
  assert.throws(() => normalizeCultureRecipe({ ...NATIVE, seasoning: undefined }), /has no seasoning/);
  const { tone: _t, ...noTone } = NATIVE.physics;
  void _t;
  assert.throws(
    () => normalizeCultureRecipe({ ...NATIVE, physics: noTone }),
    /physics\.tone = undefined/,
    'a missing dial',
  );
  assert.throws(
    () => normalizeCultureRecipe({ ...NATIVE, drives: { ...NATIVE.drives, hunger: 1 } }),
    /unknown drives dial "hunger"/,
    'feeding is Phase 6: no hunger drive yet',
  );
  for (const g of Object.keys(CULTURE_RECIPE_BOUNDS))
    for (const k of Object.keys(CULTURE_RECIPE_BOUNDS[g])) {
      const [lo, hi] = CULTURE_RECIPE_BOUNDS[g][k];
      assert.ok(lo < hi && Object.isFrozen(CULTURE_RECIPE_BOUNDS[g][k]));
      for (const bad of [lo - 1e-6, hi + 1e-6, NaN, Infinity]) {
        const rr = JSON.parse(JSON.stringify(NATIVE));
        rr[g][k] = bad;
        assert.ok(cultureRecipeFaults(rr)[0].includes(`${g}.${k}`), `${g}.${k} = ${bad} refused`);
      }
      const edge = JSON.parse(JSON.stringify(NATIVE));
      edge[g][k] = lo;
      assert.deepEqual(cultureRecipeFaults(edge), [], 'the bounds are closed');
    }
  assert.deepEqual(
    Object.keys(CULTURE_RECIPE_BOUNDS),
    ['drives', 'physics', 'seasoning'],
    'drives, physics dials, seasoning (§2.8)',
  );
  ok('the recipe reading: whole, bounded, frozen; every refusal names its dial');
}

// 2 — the 12 principles.
{
  const names = Object.keys(CULTURE_PRINCIPLES);
  assert.equal(names.length, 12);
  for (const n of names) {
    const v = CULTURE_PRINCIPLES[n];
    if (v.startsWith('seasoning.')) assert.ok(v.slice(10) in CULTURE_RECIPE_BOUNDS.seasoning, `${n} → a real dial`);
    else assert.ok(/^(CURATOR|KINETIC|LOIS|the simulation)/.test(v), `${n} → a named owner`);
  }
  const dials = names.map((n) => CULTURE_PRINCIPLES[n]).filter((v) => v.startsWith('seasoning.'));
  assert.deepEqual(
    dials.map((d) => d.slice(10)).sort(),
    Object.keys(CULTURE_RECIPE_BOUNDS.seasoning).sort(),
    'every seasoning dial is a principle',
  );
  ok('the 12 principles all accounted for: 8 as seasoning dials, 4 owned by the Lab or the simulation');
}

// 3 — the drives.
{
  assert.deepEqual([...CULTURE_DRIVE_NAMES], ['wander', 'ground', 'rim']);
  const { bodies, c, body } = rig(900, 500, 0.4);
  assert.equal(cultureSenseRange(body), body.length * CULTURE_SENSE_BODY_LENGTHS);
  assert.equal(CULTURE_SENSE_BODY_LENGTHS, 3, 'the defaults table: 3 body-lengths');
  const live = field(1);
  const s = cultureSenses(bodies, live, c);
  assert.equal(s.x, bodies.x[0]);
  assert.equal(s.ground.living, true);
  for (const name of CULTURE_DRIVE_NAMES) {
    for (let age = 0; age < 400; age += 37) {
      const d = CULTURE_DRIVES[name](s, { ...c, age });
      assert.ok(Math.hypot(d.x, d.y) <= 1 + 1e-12, `${name} desire ≤ 1`);
    }
  }
  // wander: seeded and smooth.
  const w1 = CULTURE_DRIVES.wander(s, { ...c, age: 50 });
  assert.deepEqual(CULTURE_DRIVES.wander(s, { ...c, age: 50 }), w1);
  assert.notDeepEqual(CULTURE_DRIVES.wander(s, { ...c, age: 50, seed: 6 }), w1, 'the seed reaches the wander');
  const wa = CULTURE_DRIVES.wander(s, { ...c, age: 60 });
  const wb = CULTURE_DRIVES.wander(s, { ...c, age: 61 });
  assert.ok(Math.hypot(wa.x - wb.x, wa.y - wb.y) < 0.05, 'smooth: one step bends the wander a little');
  // ground: rests on fertile ground; leans toward the living side.
  assert.deepEqual(CULTURE_DRIVES.ground(s, c), { x: 0, y: 0 }, 'full fertility under the head: no pull');
  const half = field(0);
  for (let cy = 0; cy < STAGE_ROWS; cy++)
    for (let cx = 0; cx < STAGE_COLS; cx++) if (cx * 20 >= 960) half.level[cy * STAGE_COLS + cx] = 1;
  const at = (x, y, f) => {
    const r = rig(x, y, 0);
    return CULTURE_DRIVES.ground(cultureSenses(r.bodies, f, r.c), r.c);
  };
  const g1 = at(900, 540, half);
  assert.ok(
    g1.x > 0.9 && Math.abs(g1.y) < 1e-6 && close(Math.hypot(g1.x, g1.y), 1, 1e-9),
    'on dead ground: urgent, toward the living half',
  );
  const g2 = at(970, 540, half);
  assert.ok(g2.x > 0 && Math.hypot(g2.x, g2.y) < 1, 'on living but less fertile ground: a calmer lean the same way');
  // rim: silent in the middle, inward at each border, 1 at the border.
  assert.deepEqual(CULTURE_DRIVES.rim({ x: 960, y: 540 }, c), { x: 0, y: 0 });
  assert.ok(CULTURE_DRIVES.rim({ x: 10, y: 540 }, c).x > 0.9);
  assert.ok(CULTURE_DRIVES.rim({ x: CULTURE_SWARM_WORLD_W - 10, y: 540 }, c).x < -0.9);
  assert.ok(CULTURE_DRIVES.rim({ x: 960, y: 10 }, c).y > 0.9);
  assert.ok(CULTURE_DRIVES.rim({ x: 960, y: CULTURE_SWARM_WORLD_H - 10 }, c).y < -0.9);
  assert.deepEqual(CULTURE_DRIVES.rim({ x: 0, y: 540 }, c), { x: 1, y: 0 });
  const corner = CULTURE_DRIVES.rim({ x: 0, y: 0 }, c);
  assert.ok(
    close(Math.hypot(corner.x, corner.y), 1, 1e-12) && corner.x > 0 && corner.y > 0,
    'the corner: inward, unit',
  );
  // desire: the weighted sum in canonical order, strength capped at 1.
  const d = cultureDesire(s, c);
  const wv = CULTURE_DRIVES.wander(s, c);
  assert.ok(
    close(d.x, wv.x * NATIVE.drives.wander) && close(d.y, wv.y * NATIVE.drives.wander),
    'only wander speaks mid-dish on fertile ground',
  );
  const still = cultureDesire(s, { ...c, recipe: recipeWith({ drives: { wander: 0, ground: 0, rim: 0 } }) });
  assert.deepEqual(still, { x: 0, y: 0, strength: 0 });
  ok('drives: bounded desires; wander seeded and smooth; ground leans to life; rim pushes in at the border only');
}

// 4 — the feel curves.
{
  const se = NATIVE.seasoning;
  const W = CULTURE_ANTICIPATION_WINDOW;
  assert.equal(cultureStrokeEnvelope(0, se), -0, 'the stroke starts at rest');
  assert.ok(
    close(cultureStrokeEnvelope(W / 2, se), -se.anticipation * se.exaggeration),
    'ANTICIPATION: the recoil, exaggerated',
  );
  assert.ok(close(cultureStrokeEnvelope((1 + W) / 2, se), 1), 'the push peaks at 1');
  assert.ok(Math.abs(cultureStrokeEnvelope(0.999999, se)) < 1e-6, 'SLOW OUT: the push eases to rest');
  const none = { ...se, anticipation: 0 };
  for (let p = 0; p < W; p += 0.01)
    assert.equal(Math.abs(cultureStrokeEnvelope(p, none)), 0, 'no anticipation: the wind-up rests');
  const p = W + (1 - W) * 0.15;
  assert.ok(
    cultureStrokeEnvelope(p, { ...se, slowInOut: 3 }) < cultureStrokeEnvelope(p, { ...se, slowInOut: 1 }),
    'SLOW IN: a higher exponent eases the start more',
  );
  for (let q = W; q < 1; q += 0.01) assert.ok(cultureStrokeEnvelope(q, se) >= 0 && cultureStrokeEnvelope(q, se) <= 1);
  const { c } = rig(900, 500, 0);
  assert.equal(cultureStrokePhase({ ...c, age: 0, phase0: 0 }), 0);
  assert.ok(
    close(cultureStrokePhase({ ...c, age: se.timing / 2, phase0: 0 }), 0.5),
    'TIMING: a stroke is `timing` steps',
  );
  assert.ok(
    close(cultureStrokePhase({ ...c, age: se.timing, phase0: 0.25 }), 0.25),
    'the birth phase offsets the stroke',
  );
  assert.equal(cultureTurnRate({ arcs: 0 }), CULTURE_TURN_RATE_SNAP);
  assert.ok(close(cultureTurnRate({ arcs: 1 }), CULTURE_TURN_RATE_ARC, 1e-15));
  assert.ok(CULTURE_TURN_RATE_ARC < CULTURE_TURN_RATE_SNAP, 'ARCS: more arc, a slower turn');
  const body = assembleCultureBody(CULTURE_PLAN_DISH);
  const depth = cultureBodyDepths(body);
  assert.deepEqual([...depth], [0, 0.25, 0.5, 0.75, 1, 0.25, 0.5, 0.75, 0.25, 0.5, 0.75]);
  const m = cultureRecipeMasses(body, NATIVE);
  assert.equal(m[0], NATIVE.physics.headMass);
  assert.ok(m[1] > m[2] && m[2] > m[3] && m[3] > m[4], 'FOLLOW-THROUGH: the tail lightens');
  assert.ok(close(m[4], NATIVE.physics.partMass * (1 - 0.5 * NATIVE.seasoning.followThrough)));
  assert.ok(
    cultureRecipeMasses(body, recipeWith({ seasoning: { followThrough: 0 } }))
      .slice(1)
      .every((v) => v === NATIVE.physics.partMass),
  );
  const braces = cultureBodyBraces(body);
  assert.equal(braces[0], 0);
  assert.equal(braces[1], 0, 'spine.0 has no grandparent');
  assert.equal(braces[5], 0, 'a limb root has no grandparent');
  assert.ok(close(braces[2], CULTURE_TONE_BRACE * (body.links[0].rest + body.links[1].rest)));
  ok('the feel curves: stroke wind-up, push and ease; arcs; follow-through masses; tone braces');
}

// 5 — the muscle writes velocity only.
{
  const heading = 0.7;
  const { bodies, c } = rig(900, 500, heading, recipeWith({ drives: { wander: 0, ground: 0, rim: 0 } }));
  const h1 = stepCultureCitizenMuscle(bodies, field(1), { ...c, age: 30 });
  assert.equal(h1, heading, 'no desire: the heading holds');
  assert.ok(bodies.vx.every((v) => v === 0) && bodies.vy.every((v) => v === 0), 'no desire: no push');
  // A desire to the east: rim at the west border pulls it; heading turns by at most the turn rate.
  const r = rig(
    60,
    540,
    Math.PI / 2,
    recipeWith({ drives: { wander: 0, ground: 0, rim: 1 }, physics: { paddle: 0.2 } }),
  );
  const before = Float32Array.from(r.bodies.x);
  const cc = { ...r.c, age: Math.round(r.c.recipe.seasoning.timing * 0.6) };
  const h2 = stepCultureCitizenMuscle(r.bodies, field(1), cc);
  const rate = cultureTurnRate(cc.recipe.seasoning);
  assert.ok(
    close(h2, Math.PI / 2 - rate, 1e-12),
    'ARCS: the heading turns toward the desire by the turn rate, no more',
  );
  assert.deepEqual(r.bodies.x, before, 'positions untouched: velocity only');
  const env = cultureStrokeEnvelope(cultureStrokePhase(cc), cc.recipe.seasoning);
  const want = cc.recipe.physics.thrust * env * Math.min(1, CULTURE_DRIVES.rim({ x: 60, y: 540 }, cc).x);
  assert.ok(
    close(r.bodies.vx[0], Math.cos(h2) * want, 1e-6) && close(r.bodies.vy[0], Math.sin(h2) * want, 1e-6),
    'the head: along the turned heading',
  );
  for (let k = 1; k < 5; k++) {
    const par = cc.body.parts[k].parent;
    const dx = r.bodies.x[par] - r.bodies.x[k];
    const dy = r.bodies.y[par] - r.bodies.y[k];
    const cross = dx * r.bodies.vy[k] - dy * r.bodies.vx[k];
    assert.ok(
      Math.abs(cross) < 1e-4 && dx * r.bodies.vx[k] + dy * r.bodies.vy[k] >= 0,
      `spine.${k - 1}: toward its parent`,
    );
  }
  const [tl, tr] = cc.limbTips;
  assert.equal(tl.side, 1);
  assert.equal(tr.side, -1);
  assert.deepEqual([tl.part, tr.part], [7, 10], 'the limb tips');
  // Dead parts are untouched.
  const d = rig(60, 540, 0, recipeWith({ drives: { wander: 0, ground: 0, rim: 1 } }));
  d.bodies.alive[3] = 0;
  stepCultureCitizenMuscle(d.bodies, field(1), { ...d.c, age: 40 });
  assert.equal(d.bodies.vx[3], 0);
  assert.equal(d.bodies.vy[3], 0);
  assert.equal(d.bodies.vx[4], 0, 'a part whose parent is gone is not pulled toward it');
  ok('the muscle: velocity only — the head along an arc-limited heading, parts toward parents, dead parts untouched');
}

// 6 — the look as a Motion Core source.
{
  assert.equal(getMotionSource(CULTURE_FEEL_SOURCE_ID), undefined, 'lazy: not registered until a cast opens the door');
  assert.equal(getCostTier(CULTURE_FEEL_COST_TIER), undefined);
  const rec = ensureCultureFeelSource();
  assert.equal(ensureCultureFeelSource(), rec, 'idempotent');
  assert.equal(rec.family, 'driver');
  assert.equal(rec.timeBase, 'seconds');
  assert.equal(getCostTier(CULTURE_FEEL_COST_TIER).tier, 0);
  const node = { key: 'n', seedOffset: 0, phase01: 0 };
  assert.equal(
    cultureFeelPose(node, 0, { along: 8, squash: 0.5, secondary: 0.1, role: 'head', wither: 1 }),
    POSE_IDENTITY,
    'anchor law',
  );
  const ctx = { along: 4, squash: 0.2, exaggeration: 1, role: 'spine', secondary: 0.1 };
  const p = cultureFeelPose(node, 2, ctx);
  assert.ok(p.sx > 1 && close(p.sx * p.sy, 1, 1e-12), 'SQUASH & STRETCH: a surge stretches, volume kept');
  assert.ok(close(p.sx, 1 + 0.2 * (4 / 8)));
  const back = cultureFeelPose(node, 2, { ...ctx, along: -4 });
  assert.ok(back.sx < 1, 'the recoil squashes');
  assert.ok(cultureFeelPose(node, 2, { ...ctx, exaggeration: 2 }).sx > p.sx, 'EXAGGERATION');
  const head = cultureFeelPose(node, 0.6, { ...ctx, along: 0, role: 'head' });
  assert.ok(head.sx > 1 && close(head.sx, head.sy), 'SECONDARY ACTION: the head breathes, evenly');
  assert.equal(cultureFeelPose(node, 0.6, { ...ctx, along: 0 }).sx, 1, 'only the head breathes');
  assert.ok(close(cultureFeelPose(node, 3, { wither: 1 }).dAlpha, -0.5), 'the wither fades a part');
  assert.ok(cultureFeelPose(node, 0.1, ctx).sx < p.sx, 'eased in from birth');
  const composed = composePose(rec.evaluate(node, 2, ctx), { dx: 3, sx: 2 });
  assert.ok(close(composed.sx, p.sx * 2) && composed.dx === 3, 'composes through Motion Core');
  ok(
    'the look: a lazily registered Motion Core source — anchor law, squash keeps volume, the head breathes, the wither fades',
  );
}

console.log(`cultureMotion.selfcheck: ${checks}/6 groups OK`);
