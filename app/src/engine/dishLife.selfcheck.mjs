// dishLife.selfcheck.mjs — DISH LIFE slice 1 (#1923): the culture core.
//
//   A rule     B3/S23 Generations: a blinker oscillates; dying cells decay through states and
//              only then die; decaying cells never count as neighbours and cannot be reborn
//   B rim      no wraparound — a glider walking into the edge dies there; glass (mask) is dead
//   C bedrock  locked terrain is never alive and never counted; colonies grow around it
//   D field    level/activity are published by the step itself and agree with the state grid
//   E pure     same seed = same culture (golden hash); input untouched; cultures independent
import assert from 'node:assert/strict';
import {
  createCulture,
  stepCulture,
  seedRandom,
  population,
  cultureHash,
  ellipseMask,
  setBedrock,
  totalActivity,
  DEFAULT_RULE,
  ACTIVITY_KEEP,
  normalizeRule,
} from './dishLife.mjs';

// The culture of seed 4242 on a 48x36 dish after 25 generations. Changing the rule or the seed fill moves it on purpose.
const GOLDEN = 531502298;

const grid = (cols, rows, alive) => {
  const g = new Uint8Array(cols * rows);
  for (const [x, y] of alive) g[y * cols + x] = 1;
  return g;
};
const at = (c, x, y) => c.cur[y * c.cols + x];

// ---- A: rule
{
  const c = createCulture({
    cols: 7,
    rows: 7,
    seed: grid(7, 7, [
      [2, 3],
      [3, 3],
      [4, 3],
    ]),
  });
  stepCulture(c);
  assert.equal(at(c, 3, 2), 1, 'blinker: birth above');
  assert.equal(at(c, 3, 4), 1, 'blinker: birth below');
  assert.equal(at(c, 3, 3), 1, 'blinker: centre survives');
  assert.equal(at(c, 2, 3), 2, 'a cell that fails to survive starts decaying, not vanishing');
  assert.equal(at(c, 4, 3), 2);
  // a lone cell: starves, decays through every state, then is dead — the tail has length states-2
  const lone = createCulture({ cols: 5, rows: 5, seed: grid(5, 5, [[2, 2]]) });
  const seen = [];
  for (let i = 0; i < DEFAULT_RULE.states + 1; i++) {
    stepCulture(lone);
    seen.push(at(lone, 2, 2));
  }
  assert.deepEqual(seen.slice(0, 5), [2, 3, 4, 5, 0], 'decays 2→3→4→5 then dies');
  assert.equal(population(lone).alive + population(lone).decaying, 0, 'nothing left');
  // decaying cells are not neighbours: 3 decaying cells around a dead one do NOT birth it
  const d = createCulture({ cols: 5, rows: 5 });
  d.cur[1 * 5 + 1] = 2;
  d.cur[1 * 5 + 2] = 2;
  d.cur[1 * 5 + 3] = 2;
  stepCulture(d);
  assert.equal(at(d, 2, 2), 0, 'decay states do not count toward birth');
  // …and a decaying cell is not reborn by 3 live neighbours
  const e = createCulture({
    cols: 5,
    rows: 5,
    seed: grid(5, 5, [
      [1, 1],
      [2, 1],
      [3, 1],
    ]),
  });
  e.cur[2 * 5 + 2] = 3;
  stepCulture(e);
  assert.equal(at(e, 2, 2), 4, 'a decaying cell keeps ageing — it cannot be reborn until dead');
  // a custom rule is honoured: B2/S(none) — an alive cell with 2 neighbours decays (survive list empty),
  // a dead cell with 2 live neighbours is born
  const bs = createCulture({
    cols: 5,
    rows: 3,
    rule: { birth: [2], survive: [], states: 4 },
    seed: grid(5, 3, [
      [1, 1],
      [2, 1],
      [3, 1],
    ]),
  });
  stepCulture(bs);
  assert.equal(at(bs, 2, 1), 2, 'an alive cell is not "born again": survival uses the survive list only');
  assert.equal(at(bs, 2, 0), 0, 'a dead cell with 3 live neighbours is not born under B2');
  assert.equal(at(bs, 1, 0), 1, 'a dead cell with 2 live neighbours is born under B2');
  // rule normalisation: junk never throws
  assert.deepEqual(normalizeRule(null), { birth: [3], survive: [2, 3], states: 6 });
  assert.equal(normalizeRule({ states: 99 }).states, 16);
  assert.equal(normalizeRule({ states: 1 }).states, 3);
  // states=3 is the smallest legal life (alive, one decay, dead)
  const t = createCulture({ cols: 3, rows: 3, rule: { states: 3 }, seed: grid(3, 3, [[1, 1]]) });
  stepCulture(t);
  assert.equal(at(t, 1, 1), 2);
  stepCulture(t);
  assert.equal(at(t, 1, 1), 0);
}

// ---- B: rim
{
  // a glider heading down-right into the corner of a 8x8 dish: with wraparound it would live forever
  const c = createCulture({
    cols: 8,
    rows: 8,
    seed: grid(8, 8, [
      [1, 0],
      [2, 1],
      [0, 2],
      [1, 2],
      [2, 2],
    ]),
  });
  for (let i = 0; i < 80; i++) stepCulture(c);
  const p = population(c);
  assert.ok(p.alive <= 4, `the colony dies against the rim (alive ${p.alive}), never wraps`);
  // wrap check: a cell on the left edge must not be fed by the right edge
  const w = createCulture({
    cols: 6,
    rows: 3,
    seed: grid(6, 3, [
      [5, 0],
      [5, 1],
      [5, 2],
    ]),
  });
  stepCulture(w);
  assert.equal(at(w, 0, 1), 0, 'no wraparound birth across the seam');
  // glass: cells outside the mask are dead on creation and stay dead
  const m = ellipseMask(12, 12);
  assert.equal(m[0], 0, 'the corner of the grid is glass');
  assert.equal(m[6 * 12 + 6], 1, 'the centre is dish');
  const g = createCulture({ cols: 12, rows: 12, mask: m, seed: seedRandom(12, 12, 3, 0.9) });
  for (let i = 0; i < 6; i++) {
    for (let k = 0; k < m.length; k++) if (!m[k]) assert.equal(g.cur[k], 0, 'glass is always dead');
    stepCulture(g);
  }
}

// ---- C: bedrock
{
  const rock = new Uint8Array(7 * 7);
  rock[3 * 7 + 3] = 1;
  const c = createCulture({
    cols: 7,
    rows: 7,
    bedrock: rock,
    seed: grid(7, 7, [
      [3, 3],
      [2, 2],
    ]),
  });
  assert.equal(at(c, 3, 3), 0, 'a seed cell on bedrock is dropped');
  // three live cells around the bedrock centre: bedrock never births, never counted
  const d = createCulture({
    cols: 7,
    rows: 7,
    bedrock: rock,
    seed: grid(7, 7, [
      [2, 3],
      [3, 2],
      [4, 3],
    ]),
  });
  for (let i = 0; i < 12; i++) {
    stepCulture(d);
    assert.equal(at(d, 3, 3), 0, 'bedrock is never consumed or colonised');
  }
  // setBedrock kills what is under newly locked terrain at once; clearing releases it
  const e = createCulture({
    cols: 5,
    rows: 5,
    seed: grid(5, 5, [
      [2, 2],
      [2, 1],
      [2, 3],
    ]),
  });
  const r2 = new Uint8Array(25);
  r2[2 * 5 + 2] = 1;
  setBedrock(e, r2);
  assert.equal(at(e, 2, 2), 0, 'locking terrain under a cell kills it');
  setBedrock(e, null);
  assert.equal(e.bedrock, null);
}

// ---- D: field
{
  const c = createCulture({
    cols: 7,
    rows: 7,
    seed: grid(7, 7, [
      [2, 3],
      [3, 3],
      [4, 3],
    ]),
  });
  assert.equal(totalActivity(c), 0, 'a fresh culture has published no activity');
  assert.equal(c.field.level[3 * 7 + 3], 1, 'alive reads level 1 from the first publish');
  stepCulture(c);
  assert.equal(c.field.gen, 1, 'the field carries the generation it was computed for');
  for (let i = 0; i < c.cur.length; i++) {
    const s = c.cur[i];
    const want = s === 0 ? 0 : s === 1 ? 1 : 1 - (s - 1) / (DEFAULT_RULE.states - 1);
    assert.ok(Math.abs(c.field.level[i] - want) < 1e-6, 'level agrees with the state grid');
    assert.ok(c.field.activity[i] >= 0 && c.field.activity[i] <= 1);
  }
  assert.equal(c.field.activity[2 * 7 + 3], 1, 'a cell born this generation is fully active');
  assert.equal(c.field.activity[3 * 7 + 3], 0, 'a steady cell is not active');
  stepCulture(c);
  assert.ok(c.field.activity[2 * 7 + 3] > 0 && c.field.activity[2 * 7 + 3] <= 1, 'activity eases, not snaps');
  assert.equal(c.field.level.length, 49);
  // easing, exactly: a still life that was marked fully active keeps ACTIVITY_KEEP of it each quiet step
  const still = createCulture({
    cols: 6,
    rows: 6,
    seed: grid(6, 6, [
      [2, 2],
      [3, 2],
      [2, 3],
      [3, 3],
    ]),
  });
  still.field.activity[2 * 6 + 2] = 1;
  stepCulture(still);
  assert.ok(
    Math.abs(still.field.activity[2 * 6 + 2] - ACTIVITY_KEEP) < 1e-6,
    'quiet cells keep ACTIVITY_KEEP of their activity',
  );
}

// ---- E: pure / seeded / golden
{
  const run = (seed) => {
    const c = createCulture({ cols: 48, rows: 36, mask: ellipseMask(48, 36), seed: seedRandom(48, 36, seed, 0.3) });
    for (let i = 0; i < 25; i++) stepCulture(c);
    return c;
  };
  const a = run(4242);
  const b = run(4242);
  assert.equal(cultureHash(a), cultureHash(b), 'same seed, same culture');
  assert.notEqual(cultureHash(a), cultureHash(run(4243)), 'another seed, another culture');
  assert.equal(cultureHash(a), GOLDEN, `golden drifted: ${cultureHash(a)} — the rule or the seed fill changed`);
  const input = seedRandom(10, 10, 1, 0.4);
  const copy = Uint8Array.from(input);
  const c = createCulture({ cols: 10, rows: 10, seed: input });
  stepCulture(c);
  assert.deepEqual([...input], [...copy], 'the seed array is never mutated');
  // two cultures share nothing: stepping one leaves the other where it was
  const x = createCulture({ cols: 10, rows: 10, seed: input });
  const hx = cultureHash(x);
  stepCulture(c);
  stepCulture(c);
  assert.equal(cultureHash(x), hx, 'cultures are independent (no module state)');
}
console.log('dishLife.selfcheck: ok');
