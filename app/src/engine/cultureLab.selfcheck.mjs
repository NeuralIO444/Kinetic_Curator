// node src/engine/cultureLab.selfcheck.mjs
// CULTURE Phase 5, slice A — the assembled body plan (engine/cultureBody.mjs) and the Lab's casting
// path (engine/cultureLab.mjs): KINETIC assembles, DAVIS writes, LOIS gates, CURATOR directs.
//   1. the dish plan, assembled: head first, spine, two born limbs, one tree of joints at the overlap
//      rule, four declared sockets under the plan's cap (two born occupied, two free), a look per part
//   2. LOIS's body reading catches what is wrong: a sticker, a broken joint, a rest off the rule,
//      sockets over the cap, a bad occupant; KINETIC refuses an unknown plan and a scale off his band
//   3. the rest pose: every joint dealt exactly at its declared rest; limbs leave along their sockets
//   4. DAVIS: every dial inside its bounds and within his lean of the native; whole-step timing;
//      the same candidate writes the same recipe; candidates differ
//   5. LOIS gates: dead ground, a part outside the dish, crowding — each refuses; praise is her
//      formula, the bar refuses under it; she never edits what she reads
//   6. CURATOR's cast: deterministic per seed, each slot LOIS's best admitted audition, members
//      spaced and on living ground, refusals recorded, the sheet read loudly
//   7. seeded draws ride registered channels (the #1238 rule)
import assert from 'node:assert/strict';
import {
  assembleCultureBody,
  cultureBodyRestPose,
  cultureBodyFaults,
  cultureBodyPlan,
  CULTURE_PLAN_DISH,
  CULTURE_BODY_PLANS,
  CULTURE_BODY_REST_OVERLAP,
  CULTURE_LOOK_SHAPES,
  CULTURE_LOOK_TONES,
  CULTURE_BODY_SCALE_MIN,
  CULTURE_BODY_SCALE_MAX,
} from './cultureBody.mjs';
import {
  kineticAssemble,
  davisWrite,
  curatorAudition,
  loisGate,
  curatorCast,
  normalizeCultureCastSheet,
  CULTURE_NATIVE_RECIPES,
  CULTURE_CAST_SHEET,
  CULTURE_CAST_AUDITIONS,
  CULTURE_CAST_CAP,
  CULTURE_LOIS_BAR,
  CULTURE_DAVIS_LEAN,
  CULTURE_CAST_SPACING_BODY_LENGTHS,
  CULTURE_CAST_MARGIN_BODY_LENGTHS,
} from './cultureLab.mjs';
import { CULTURE_RECIPE_BOUNDS } from './cultureMotion.mjs';
import { cultureSoilSample } from './cultureSoil.mjs';
import { CULTURE_SWARM_WORLD_W, CULTURE_SWARM_WORLD_H } from './cultureSwarm.mjs';
import { createCultureWorld, advanceCultureWorld } from './cultureWorld.mjs';
import { STAGE_COLS, STAGE_ROWS } from './dishLifeStage.mjs';
import { STRING_CHANNEL_GROUPS, startStringChannelObservation, endStringChannelObservation } from './kernel/rng.js';

let checks = 0;
const ok = (name) => {
  checks++;
  console.log(`  ok ${checks} — ${name}`);
};
const field = (fill) => ({
  cols: STAGE_COLS,
  rows: STAGE_ROWS,
  gen: 0,
  level: new Float32Array(STAGE_COLS * STAGE_ROWS).fill(fill),
});
const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

// 1 — the dish plan, assembled.
{
  assert.deepEqual([...CULTURE_BODY_PLANS], [CULTURE_PLAN_DISH], 'one plan in this slice: the dish creature');
  const b = assembleCultureBody(CULTURE_PLAN_DISH);
  assert.ok(Object.isFrozen(b) && Object.isFrozen(b.parts) && Object.isFrozen(b.parts[0]), 'frozen all the way down');
  assert.equal(b.parts.length, 11, 'head + 4 spine + 2 limbs × 3');
  assert.deepEqual(
    b.parts.map((p) => p.id),
    [
      'head',
      'spine.0',
      'spine.1',
      'spine.2',
      'spine.3',
      'limb.l.0',
      'limb.l.1',
      'limb.l.2',
      'limb.r.0',
      'limb.r.1',
      'limb.r.2',
    ],
  );
  assert.deepEqual(
    b.parts.map((p) => p.radius),
    [27, 22, 19, 16, 13, 10, 7, 4.5, 10, 7, 4.5],
    'the legacy dish creature proportions (loot, §2.2)',
  );
  assert.equal(b.parts[0].role, 'head');
  assert.equal(b.parts[0].parent, -1);
  assert.deepEqual(
    b.parts.slice(1).map((p) => p.parent),
    [0, 1, 2, 3, 0, 5, 6, 0, 8, 9],
    'one tree: the spine chains off the head, each limb hangs off the head',
  );
  assert.equal(b.links.length, 10);
  for (const l of b.links)
    assert.ok(
      close(l.rest, (b.parts[l.a].radius + b.parts[l.b].radius) * CULTURE_BODY_REST_OVERLAP),
      'rests: the overlap rule',
    );
  assert.equal(b.socketCap, 4);
  assert.deepEqual(
    b.sockets.map((s) => [s.id, s.part, s.occupant]),
    [
      ['head.l', 0, 5],
      ['head.r', 0, 8],
      ['spine.1.l', 2, -1],
      ['spine.1.r', 2, -1],
    ],
    'four declared sockets: the head two born occupied, the spine two born free for Phase 6',
  );
  assert.ok(b.sockets.every((s) => s.accepts === 'limb'));
  for (const p of b.parts) {
    assert.ok(CULTURE_LOOK_SHAPES.includes(p.look.shape));
    assert.ok(CULTURE_LOOK_TONES.includes(p.look.tone));
    assert.equal(Object.keys(p.look).length, 2, 'a look is shape + tone role only — no colour, no copy');
  }
  assert.deepEqual(
    [...new Set(b.parts.map((p) => p.look.shape))].sort(),
    ['bar', 'dot', 'ring', 'square'],
    'graphic: the body uses the whole vocabulary — a layout of marks, not one sticker',
  );
  const len = 27 + 13 + b.links.filter((l) => b.parts[l.b].role === 'spine').reduce((s, l) => s + l.rest, 0);
  assert.ok(close(b.length, len), 'body-length: head rim to tail rim along the spine');
  assert.deepEqual(cultureBodyFaults(b), [], 'a well-formed body');
  const big = assembleCultureBody(CULTURE_PLAN_DISH, { scale: 1.1 });
  assert.ok(close(big.parts[0].radius, 27 * 1.1) && close(big.length, b.length * 1.1));
  assert.deepEqual(cultureBodyFaults(big), []);
  ok('the dish plan assembled: head, spine, born limbs, one tree of joints, declared sockets, a look per part');
}

// 2 — the body reading catches faults; KINETIC refuses what he cannot build.
{
  const b = assembleCultureBody(CULTURE_PLAN_DISH);
  const remake = (patch) => ({ ...b, ...patch });
  const sticker = remake({ parts: b.parts.map((p) => ({ ...p, look: { shape: 'dot', tone: 'main' } })) });
  assert.ok(cultureBodyFaults(sticker).includes('a sticker: fewer than three shapes'));
  const twoShapes = remake({
    parts: b.parts.map((p, i) => ({ ...p, look: { shape: i % 2 ? 'dot' : 'ring', tone: 'main' } })),
  });
  assert.ok(cultureBodyFaults(twoShapes).includes('a sticker: fewer than three shapes'));
  const cut = remake({ links: b.links.slice(1) });
  assert.ok(cultureBodyFaults(cut).some((f) => f === 'part 1: joint'));
  assert.ok(cultureBodyFaults(cut).includes('not one tree'));
  const offRule = remake({ links: b.links.map((l, i) => (i === 2 ? { ...l, rest: l.rest + 1 } : l)) });
  assert.ok(cultureBodyFaults(offRule).includes('part 3: rest'));
  const crowded = remake({ sockets: [...b.sockets, { id: 'x', part: 1, angle: 0, accepts: 'limb', occupant: -1 }] });
  assert.ok(cultureBodyFaults(crowded).includes('sockets over the plan cap'));
  const squat = remake({ sockets: b.sockets.map((s, i) => (i === 2 ? { ...s, occupant: 1 } : s)) });
  assert.ok(cultureBodyFaults(squat).includes('socket spine.1.l: occupant'));
  const badLook = remake({
    parts: b.parts.map((p, i) => (i === 4 ? { ...p, look: { shape: 'star', tone: 'main' } } : p)),
  });
  assert.ok(cultureBodyFaults(badLook).includes('part 4: look'));
  const twoHeads = remake({ parts: b.parts.map((p, i) => (i === 1 ? { ...p, role: 'head' } : p)) });
  assert.ok(cultureBodyFaults(twoHeads).includes('one head, first'));
  assert.throws(
    () => assembleCultureBody('moth'),
    /unknown body plan "moth"/,
    'the moth is the next slice, not this one',
  );
  assert.throws(() => cultureBodyPlan(undefined), /unknown body plan/);
  assert.throws(() => assembleCultureBody(CULTURE_PLAN_DISH, { scale: 1.2 }), /outside KINETIC's band/);
  assert.throws(() => assembleCultureBody(CULTURE_PLAN_DISH, { scale: NaN }), /outside KINETIC's band/);
  ok(
    'the body reading catches a sticker, a broken tree, an off-rule rest, a crowded or squatted socket; KINETIC refuses loudly',
  );
}

// 3 — the rest pose.
{
  const b = assembleCultureBody(CULTURE_PLAN_DISH, { scale: 0.95 });
  for (const heading of [0, 1.1, -2.7]) {
    const pose = cultureBodyRestPose(b, 500, 400, heading);
    assert.equal(pose.length, b.parts.length);
    assert.deepEqual(pose[0], { x: 500, y: 400 });
    for (const l of b.links)
      assert.ok(close(Math.hypot(pose[l.b].x - pose[l.a].x, pose[l.b].y - pose[l.a].y), l.rest, 1e-9), 'dealt at rest');
    const tail = pose[4];
    const back = Math.atan2(tail.y - 400, tail.x - 500);
    assert.ok(close(Math.cos(back - (heading + Math.PI)), 1, 1e-9), 'the spine trails straight behind the heading');
    const sock = b.sockets[0];
    const root = pose[sock.occupant];
    const out = Math.atan2(root.y - 400, root.x - 500);
    assert.ok(
      close(Math.cos(out - (heading + sock.angle)), 1, 1e-9),
      'a limb leaves its socket along the socket angle',
    );
  }
  ok('the rest pose: every joint at its declared rest, the spine behind, the limbs along their sockets');
}

// 4 — DAVIS writes recipes.
{
  const native = CULTURE_NATIVE_RECIPES[CULTURE_PLAN_DISH];
  const seen = new Set();
  for (let cand = 0; cand < 40; cand++) {
    const { recipe, phase0 } = davisWrite(CULTURE_PLAN_DISH, 7, cand);
    assert.ok(Object.isFrozen(recipe));
    assert.equal(recipe.name, native.name);
    assert.ok(phase0 >= 0 && phase0 < 1);
    for (const g of Object.keys(CULTURE_RECIPE_BOUNDS))
      for (const k of Object.keys(CULTURE_RECIPE_BOUNDS[g])) {
        const v = recipe[g][k];
        const [lo, hi] = CULTURE_RECIPE_BOUNDS[g][k];
        assert.ok(v >= lo && v <= hi, `${g}.${k} in bounds`);
        const slack = k === 'timing' ? 0.5 : 1e-12;
        assert.ok(
          Math.abs(v - native[g][k]) <= Math.abs(native[g][k]) * CULTURE_DAVIS_LEAN + slack,
          `${g}.${k} within the lean`,
        );
      }
    assert.ok(Number.isInteger(recipe.seasoning.timing), 'timing in whole steps');
    assert.deepEqual(davisWrite(CULTURE_PLAN_DISH, 7, cand), { recipe, phase0 }, 'same candidate, same recipe');
    seen.add(JSON.stringify(recipe));
  }
  assert.equal(seen.size, 40, 'each candidate leans differently');
  assert.notDeepEqual(
    davisWrite(CULTURE_PLAN_DISH, 8, 0),
    davisWrite(CULTURE_PLAN_DISH, 7, 0),
    'the seed reaches the recipe',
  );
  const k = kineticAssemble(CULTURE_PLAN_DISH, 7, 3);
  assert.ok(k.scale >= CULTURE_BODY_SCALE_MIN && k.scale <= CULTURE_BODY_SCALE_MAX);
  assert.equal(kineticAssemble(CULTURE_PLAN_DISH, 7, 3).scale, k.scale, 'KINETIC is seeded, not chance');
  ok('DAVIS: whole recipes, every dial in bounds and within his lean of the native; seeded, never chance');
}

// 5 — LOIS gates and ranks.
{
  const body = assembleCultureBody(CULTURE_PLAN_DISH);
  const { recipe, phase0 } = davisWrite(CULTURE_PLAN_DISH, 1, 0);
  const cand = { body, recipe, phase0, x: 900, y: 500, heading: 0.3 };
  const live = field(1);
  const dead = field(0);
  const v = loisGate(cand, live);
  assert.equal(v.admitted, true);
  assert.deepEqual([...v.faults], []);
  const native = CULTURE_NATIVE_RECIPES[CULTURE_PLAN_DISH];
  let dist = 0;
  let n = 0;
  for (const g of Object.keys(CULTURE_RECIPE_BOUNDS))
    for (const k of Object.keys(CULTURE_RECIPE_BOUNDS[g])) {
      const [lo, hi] = CULTURE_RECIPE_BOUNDS[g][k];
      dist += Math.abs(recipe[g][k] - native[g][k]) / (hi - lo);
      n++;
    }
  assert.ok(
    close(v.praise, 0.5 * 1 + 0.25 * 1 + 0.25 * (1 - dist / n), 1e-12),
    'praise: ½ fertility + ¼ graphic + ¼ temperament',
  );
  const vn = loisGate({ ...cand, recipe: native }, live);
  assert.ok(close(vn.praise, 1), 'the native recipe on full fertility with the whole vocabulary: full praise');
  assert.deepEqual([...loisGate(cand, dead).faults], ['head on dead ground']);
  assert.ok(loisGate({ ...cand, x: 40 }, live).faults.includes('a part outside the dish'));
  assert.ok(
    loisGate(cand, live, [{ x: 900 + body.length, y: 500 }]).faults.includes('crowding an earlier cast member'),
  );
  assert.equal(
    loisGate(cand, live, [{ x: 900 + CULTURE_CAST_SPACING_BODY_LENGTHS * body.length + 1, y: 500 }]).admitted,
    true,
  );
  // Under the bar: a lone living cell on a dead dish (fertility 1/9) with a sticker-thin vocabulary... the
  // body would fail as a sticker, so drive the bar with a recipe at the bounds' far side instead.
  const lone = field(0);
  lone.level[Math.floor(500 / 20) * STAGE_COLS + Math.floor(900 / 20)] = 1;
  const far = JSON.parse(JSON.stringify(native));
  for (const g of Object.keys(CULTURE_RECIPE_BOUNDS))
    for (const k of Object.keys(CULTURE_RECIPE_BOUNDS[g])) {
      const [lo, hi] = CULTURE_RECIPE_BOUNDS[g][k];
      far[g][k] = native[g][k] - lo > hi - native[g][k] ? lo : hi;
    }
  const under = loisGate({ ...cand, recipe: far }, lone);
  assert.ok(under.praise < CULTURE_LOIS_BAR && under.admitted === false && under.faults.includes('under the bar'));
  const bad = { ...cand, recipe: { ...native, physics: { ...native.physics, thrust: 99 } } };
  assert.ok(
    loisGate(bad, live).faults.some((f) => /physics\.thrust/.test(f)),
    'a recipe the reading refuses',
  );
  const before = JSON.stringify(cand);
  loisGate(cand, live);
  assert.equal(JSON.stringify(cand), before, 'LOIS reads; she never edits');
  ok(
    'LOIS: dead ground, outside the dish, crowding and an unread recipe refuse; praise is her formula; under the bar refuses',
  );
}

// 6 — CURATOR directs the cast.
{
  const w = createCultureWorld({ seed: 7 });
  advanceCultureWorld(w, 0.5);
  const f = w.life.field;
  const a = curatorCast(7, f);
  const b = curatorCast(7, f);
  assert.deepEqual(JSON.stringify(a), JSON.stringify(b), 'the same take casts the same cast');
  assert.equal(a.members.length + a.refused.length, CULTURE_CAST_SHEET.count);
  assert.ok(a.members.length >= 1);
  for (let i = 0; i < a.members.length; i++) {
    const m = a.members[i];
    assert.ok(cultureSoilSample(f, m.x, m.y).living, 'every cast head stands on living ground');
    const margin = CULTURE_CAST_MARGIN_BODY_LENGTHS * m.body.length;
    assert.ok(
      m.x >= margin && m.x <= CULTURE_SWARM_WORLD_W - margin && m.y >= margin && m.y <= CULTURE_SWARM_WORLD_H - margin,
    );
    for (let j = 0; j < i; j++)
      assert.ok(
        Math.hypot(a.members[j].x - m.x, a.members[j].y - m.y) >= CULTURE_CAST_SPACING_BODY_LENGTHS * m.body.length,
      );
    // LOIS's best: re-audition the slot against the cast before it; the chosen audition outranks
    // every other admitted one (ties to the earlier).
    let best = null;
    for (let k = 0; k < CULTURE_CAST_AUDITIONS; k++) {
      const v = loisGate(curatorAudition(CULTURE_PLAN_DISH, 7, m.slot, k), f, a.members.slice(0, i));
      if (v.admitted && (!best || v.praise > best.praise)) best = { k, praise: v.praise };
    }
    assert.equal(best.k, m.audition, "the slot goes to LOIS's best-praised admitted audition");
    assert.equal(best.praise, m.praise);
  }
  let rankedSlots = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const ww = createCultureWorld({ seed });
    const cast = curatorCast(seed, ww.life.field, { plan: CULTURE_PLAN_DISH, count: 4 });
    for (const m of cast.members) {
      assert.ok(m.praise >= CULTURE_LOIS_BAR);
      rankedSlots++;
    }
  }
  assert.ok(rankedSlots >= 24, 'casts fill across seeds');
  const none = curatorCast(7, field(0));
  assert.equal(none.members.length, 0, 'a dead dish admits nobody');
  assert.equal(none.refused.length, 3);
  assert.ok(none.refused.every((r) => r.faults.includes('head on dead ground')));
  assert.equal(curatorCast(7, f, { plan: CULTURE_PLAN_DISH, count: 0 }).members.length, 0);
  assert.throws(() => normalizeCultureCastSheet({ plan: 'moth', count: 1 }), /unknown body plan/);
  assert.throws(() => normalizeCultureCastSheet({ plan: CULTURE_PLAN_DISH, count: 1.5 }), /whole number/);
  assert.throws(
    () => normalizeCultureCastSheet({ plan: CULTURE_PLAN_DISH, count: CULTURE_CAST_CAP + 1 }),
    /whole number/,
  );
  assert.notDeepEqual(
    JSON.stringify(curatorCast(8, f).members.map((m) => [m.x, m.y])),
    JSON.stringify(a.members.map((m) => [m.x, m.y])),
    'a different take casts differently',
  );
  ok(
    'CURATOR: deterministic per take, LOIS-gated slots on living ground, spaced and inside the margin, refusals recorded',
  );
}

// 7 — the #1238 channel rule.
{
  startStringChannelObservation();
  const w = createCultureWorld({ seed: 3 });
  curatorCast(3, w.life.field);
  const seen = endStringChannelObservation().filter((n) => n.startsWith('culture-'));
  assert.deepEqual(seen.sort(), ['culture-cast', 'culture-recipe']);
  assert.equal(STRING_CHANNEL_GROUPS['culture-cast'], 'spatial', 'where a citizen enters is placement');
  assert.equal(STRING_CHANNEL_GROUPS['culture-recipe'], 'noise', 'a recipe is a motion decision');
  assert.equal(STRING_CHANNEL_GROUPS['culture-wander'], 'noise');
  ok('the Lab draws on registered channels only');
}

console.log(`cultureLab.selfcheck: ${checks}/7 groups OK`);
