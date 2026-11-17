// beastAdapter.selfcheck.mjs — #2232 step 6: the beast adapter, run through the real engines.
//
//   shape      the adapter passes the engines' own door; the ladder is TAME → FERAL, default TAME
//   determ.    same (seed, press, scope) → the identical hand
//   gate       every beast in a hand walks (the S2 test); a feral press counts the ones that died
//   key        a candidate's key is the pool tile's own id (beastTile), so a pick banks under its dealt key
//   read       in [0, 1]; the wild type reads 1
//   near       every neighbour is inside its cap, never the subject, and walks; the funnel narrows to one
//   seam       the adapter imports no store, React, clock or Math.random
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertAdapter } from './dealAdapter.mjs';
import { press, scopeIds, WIDE_HAND_SIZE } from './kineticEngine.mjs';
import { funnel, NARROW_HAND_SIZE } from './curatorEngine.mjs';
import { beastAdapter, beastDistance, beastKey, BEAST_SCOPES, BEAST_DEFAULT_SCOPE } from './beastAdapter.mjs';
import { beastTile } from '../engine/beastTile.js';
import { isStillborn } from '../engine/jansenSolver.js';
import { sanitizeMeasures } from '../engine/beastBuilder.js';
import { wildTypeMeasures } from '../engine/jansenMeasures.js';

const SEED = 20261116;
const wild = sanitizeMeasures(wildTypeMeasures());
const run = (scope, over = {}) => press(beastAdapter, { scope, seed: SEED, press: 1, ctx: {}, ...over });
let n = 0;
const ok = (msg) => console.log(`  ok ${++n} ${msg}`);

// --- shape ---
assertAdapter(beastAdapter);
assert.deepEqual(scopeIds(beastAdapter), ['tame', 'loose', 'wild', 'feral']);
assert.deepEqual(
  BEAST_SCOPES.map((s) => s.label),
  ['TAME', 'LOOSE', 'WILD', 'FERAL'],
);
assert.equal(BEAST_DEFAULT_SCOPE, 'tame');
assert.equal(beastAdapter.defaultScope, 'tame');
ok('the adapter passes the engines door; the ladder is TAME, LOOSE, WILD, FERAL');

// --- determinism, and the clock / Math.random cannot be reached ---
const realRandom = Math.random;
const realNow = Date.now;
Math.random = () => {
  throw new Error('Math.random');
};
Date.now = () => {
  throw new Error('Date.now');
};
try {
  const a = run('loose');
  const b = run('loose');
  assert.deepEqual(a.hand, b.hand);
  assert.notDeepEqual(run('loose', { press: 2 }).hand, a.hand);
  assert.notDeepEqual(run('loose', { seed: SEED + 1 }).hand, a.hand);
} finally {
  Math.random = realRandom;
  Date.now = realNow;
}
ok('same (seed, press, scope) → the identical hand; a new press or seed changes it');

// --- every scope deals a full hand of beasts that walk (the gate), and the ladder is a ladder ---
for (const scope of scopeIds(beastAdapter)) {
  const r = run(scope);
  assert.ok(r.hand.length > 0 && r.hand.length <= WIDE_HAND_SIZE, `${scope}: a hand`);
  for (const m of r.hand) assert.ok(!isStillborn(m, m.scale), `${scope}: every beast in the hand walks`);
}
const meanStray = (scope) => {
  const hand = beastAdapter.deal(scope, { seed: SEED, press: 3, maxDraws: 24, ctx: {} });
  return hand.reduce((s, m) => s + beastDistance(wild, m), 0) / hand.length;
};
assert.ok(meanStray('tame') < meanStray('wild'), 'TAME strays less from the wild type than WILD');
assert.ok(meanStray('wild') < meanStray('feral'), 'WILD strays less than FERAL');
ok('every hand is full of beasts that walk; the scopes stray further up the ladder');

// --- the gate is hard: a feral press loses draws to it, and counts them ---
let died = 0;
for (let p = 1; p <= 12; p++) died += run('feral', { press: p }).stillborn;
assert.ok(died > 0, 'a feral press loses some beasts to the gate');
assert.equal(beastAdapter.gate(wild), true);
assert.equal(beastAdapter.gate(null), false);
// a linkage that cannot turn: the crank longer than the frame can reach
const dead = { ...wild, m: 60 };
if (isStillborn(sanitizeMeasures(dead), 1)) assert.equal(beastAdapter.gate(dead), false);
ok('the gate culls stillbirths and says no to junk');

// --- the key is the pool tile's own id ---
for (const m of run('wild').hand) {
  assert.equal(beastAdapter.key(m), beastTile(m).id);
  assert.match(beastAdapter.key(m), /^user:beast-[0-9a-f]{8}$/);
}
assert.equal(beastKey(wild), beastAdapter.key(wild));
assert.equal(beastAdapter.key('not a beast'), '');
ok("a candidate's key is the tile id beastTile would mint for it");

// --- read ---
const rw = beastAdapter.read(wild);
assert.equal(rw.total, 1, 'the wild type reads 1');
for (const m of beastAdapter.deal('wild', { seed: SEED, press: 5, maxDraws: 16, ctx: {} })) {
  const r = beastAdapter.read(m);
  assert.ok(r.total >= 0 && r.total <= 1, 'read stays in [0, 1]');
}
assert.equal(beastAdapter.read(null).total, 0);
ok('the read stays in [0, 1]; the wild type reads 1; junk reads 0');

// --- near: bounded, never the subject, alive ---
for (const cap of [0.1, 0.25, 0.5]) {
  const subject = run('tame').hand[0];
  const hood = beastAdapter.near(subject, cap, { seed: SEED, press: 4, maxDraws: 24, ctx: {} });
  assert.ok(hood.length > 0, `cap ${cap}: neighbours exist`);
  for (const c of hood) {
    assert.ok(beastDistance(subject, c) <= cap + 1e-9, `cap ${cap}: inside the cap`);
    assert.notEqual(beastKey(c), beastKey(subject), 'never the subject');
  }
}
const tight = beastAdapter.near(wild, 0.1, { seed: SEED, press: 1, maxDraws: 24, ctx: {} });
const loose = beastAdapter.near(wild, 0.5, { seed: SEED, press: 1, maxDraws: 24, ctx: {} });
const mean = (hand) => hand.reduce((s, m) => s + beastDistance(wild, m), 0) / Math.max(1, hand.length);
assert.ok(mean(tight) < mean(loose), 'a tighter cap keeps neighbours closer');
assert.deepEqual(beastAdapter.near(null, 0.25, { seed: SEED, press: 1, maxDraws: 4, ctx: {} }), []);
ok('neighbours stay inside their cap, never return the subject, and a tighter cap sits closer');

// --- the funnel: from a beast to a small ordered hand with one pick ---
const subject = run('tame').hand[0];
const f = funnel(beastAdapter, subject, { cap: 0.25, seed: SEED, press: 1, ctx: {} });
assert.ok(f.hand.length > 0 && f.hand.length <= NARROW_HAND_SIZE, 'a narrow hand');
assert.ok(f.picked && f.ordered[0].candidate === f.picked, 'the pick tops the read');
for (let i = 1; i < f.ordered.length; i++) assert.ok(f.ordered[i - 1].total >= f.ordered[i].total, 'ordered by read');
for (const m of f.hand) assert.ok(!isStillborn(m, m.scale), 'every neighbour walks');
assert.deepEqual(funnel(beastAdapter, subject, { cap: 0.25, seed: SEED, press: 1, ctx: {} }).hand, f.hand);
ok('the CURATOR funnel narrows a beast to a deterministic, ordered hand with one pick');

// --- seam ---
const src = readFileSync(new URL('./beastAdapter.mjs', import.meta.url), 'utf8')
  .split('\n')
  .filter((l) => !/^\s*\/\//.test(l))
  .join('\n');
for (const bad of ['Date.now', 'Math.random', 'performance.now', 'zustand', "from 'react'", 'useStore'])
  assert.ok(!src.includes(bad), `the adapter does not touch ${bad}`);
ok('the adapter imports no store, React, clock or Math.random');

console.log(`beastAdapter selfcheck: ${n} ok`);
