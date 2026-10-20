// node src/curator/limbs.selfcheck.mjs
// #1355 step 5 — limb count over a life: the crowd gives a moth its second pair of wings and takes it away again.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MAX_PAIRS, LIMB_GROW_AT, LIMB_SHED_AT, LIMB_GROW_FRAMES, LIMB_SHED_FRAMES, createLimbTracker } from './limbs.js';
import { observeFormation, getLimbPairs, getFormedPins, resetFormation } from './formationLive.js';
import { fertilityField, FORM_HOLD_FRAMES } from './formation.js';

const st = (density, over = {}) => ({ x: 100, y: 100, formed: true, density, ...over });
const run = (t, states, n) => { let r; for (let i = 0; i < n; i++) r = t.update(states); return r; };

// 1. the limits: two pairs is the most (four wings: the TE four limbs), and the gap between the thresholds is real
{
  assert.equal(MAX_PAIRS, 2);
  assert.ok(LIMB_SHED_AT < LIMB_GROW_AT, 'hysteresis: the crowd that sheds a pair is thinner than the crowd that grows it');
  assert.ok(LIMB_SHED_FRAMES > LIMB_GROW_FRAMES, 'a limb is lost more slowly than it is gained');
}

// 2. a formed creature starts with one pair; a crowd held long enough grows the second, and not before
{
  const t = createLimbTracker();
  assert.deepEqual(run(t, [st(LIMB_GROW_AT)], LIMB_GROW_FRAMES - 1), [1], 'one frame short: still one pair');
  assert.deepEqual(t.update([st(LIMB_GROW_AT)]), [2], 'held for the whole count: two pairs');
  assert.deepEqual(run(t, [st(1)], 500), [2], 'never more than two pairs');
}

// 3. a crowd that comes and goes does not count: the run must be unbroken
{
  const t = createLimbTracker();
  for (let i = 0; i < 4; i++) { run(t, [st(0.9)], LIMB_GROW_FRAMES - 5); run(t, [st(0.1)], 1); }
  assert.deepEqual(t.update([st(0.9)]), [1], 'broken runs never add up');
}

// 4. hysteresis: between the two thresholds nothing changes, and shedding takes a longer, unbroken thinning
{
  const t = createLimbTracker();
  run(t, [st(1)], LIMB_GROW_FRAMES);
  const mid = (LIMB_GROW_AT + LIMB_SHED_AT) / 2;
  assert.deepEqual(run(t, [st(mid)], 1000), [2], 'a middling crowd holds the pair indefinitely');
  assert.deepEqual(run(t, [st(LIMB_SHED_AT)], LIMB_SHED_FRAMES - 1), [2], 'thin, but not for long enough');
  run(t, [st(mid)], 1); // a break resets the count
  assert.deepEqual(run(t, [st(0)], LIMB_SHED_FRAMES - 1), [2], 'the break started it over');
  assert.deepEqual(t.update([st(0)]), [1], 'thin for the whole count: back to one pair');
  // and it can grow again
  assert.deepEqual(run(t, [st(1)], LIMB_GROW_FRAMES), [2]);
}

// 5. a pin that is not formed reads one pair and forgets; a moved pin starts over; each pin is its own
{
  const t = createLimbTracker();
  run(t, [st(1)], LIMB_GROW_FRAMES);
  assert.deepEqual(t.update([st(1, { formed: false })]), [1], 'unformed: one pair');
  assert.deepEqual(t.update([st(1)]), [1], 'formed again: grows from nothing');
  const u = createLimbTracker();
  run(u, [st(1)], LIMB_GROW_FRAMES);
  assert.deepEqual(u.update([st(1, { x: 300 })]), [1], 'a moved pin is a new creature');
  const v = createLimbTracker();
  assert.deepEqual(run(v, [st(1), st(0, { x: 5 }), null], LIMB_GROW_FRAMES), [2, 1, 1], 'pins are independent; a missing pin reads one pair');
  assert.deepEqual(createLimbTracker().update([st(NaN)]), [1], 'junk density is no crowd');
}

// 6. live: a formed pin in a crowd reads two pairs after the count, through the same tap the formation rule reads
{
  resetFormation();
  const f = fertilityField(5, null, 1000, 700);
  let spot = null;
  for (let x = 25; x < 1000 && !spot; x += 25) for (let y = 25; y < 700 && !spot; y += 25) if (f.at(x, y) > 0.7) spot = { x, y };
  assert.ok(spot);
  const crowd = (n) => [{ items: Array.from({ length: n }, (_, i) => ({ x: spot.x + (i % 4), y: spot.y + (i % 3) })) }];
  const inp = { dishPins: [spot], canvasW: 1000, canvasH: 700, seed: 5, seedOffsets: null };
  for (let i = 0; i < FORM_HOLD_FRAMES; i++) observeFormation(inp, crowd(30), () => 'normal');
  assert.deepEqual(getFormedPins(), [true]);
  assert.deepEqual(getLimbPairs(), [1], 'just formed: one pair');
  for (let i = 0; i < LIMB_GROW_FRAMES; i++) observeFormation(inp, crowd(30), () => 'normal');
  assert.deepEqual(getLimbPairs(), [2], 'a crowded place grows the second pair');
  resetFormation();
  assert.deepEqual(getLimbPairs(), [], 'a fresh take starts with none');
}

// 7. honest: counted frames only, and the loop carries it (so a take replays it)
{
  const src = readFileSync(new URL('./limbs.js', import.meta.url), 'utf8');
  assert.ok(!/Date\.now|performance\.now|setTimeout|setInterval|Math\.random/.test(src), 'no clock, no chance');
  const loop = readFileSync(new URL('../gl/liveLoop.mjs', import.meta.url), 'utf8');
  assert.ok(/dishLimbs: spawnDecisions \? spawnDecisions\.dishLimbs/.test(loop), 'the loop passes dishLimbs in the resolver input');
  // #1694 slice 1 — the decision's source moved: the resolver publishes it (no provider registered by App any more)
  const resolve = readFileSync(new URL('../gl/liveResolve.mjs', import.meta.url), 'utf8');
  assert.ok(/lastSpawnDecisions = spawnState\.observe\(input, out\)/.test(resolve), 'the resolver publishes the spawn decisions');
  const app = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
  assert.ok(!/setLimbsProvider/.test(app), 'the provider channel is retired');
}

console.log('limbs.selfcheck: ok (#1355 step 5)');
