// creatureAdapter.selfcheck.mjs — #2232 step 2: the creature adapter, run through the real engines.
//
//   shape      the adapter passes the engines' own door; the ladder is the stage's four ids
//   determ.    same (seed, press, scope, bank) → the identical hand, with the clock and Math.random forbidden
//   founders   an empty bank deals founders; OFF stays inside the curated sets; no skeleton → only KOZ may deal it
//   breeding   under three parents never breeds; with three, MED and KOZ breed (and OFF / WEAK still do not)
//   gate       a stillborn never reaches a hand, and is counted
//   read/near  the read stays in [0, 1]; the funnel stays within its cap and never returns its subject
//   seam       the adapter imports no store, React, clock or Math.random
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertAdapter } from './dealAdapter.mjs';
import { press, scopeIds, nextScope, WIDE_HAND_SIZE } from './kineticEngine.mjs';
import { funnel, NARROW_HAND_SIZE } from './curatorEngine.mjs';
import {
  creatureAdapter,
  creatureDistance,
  founderRoles,
  FOUNDER_LIMBS,
  CREATURE_SCOPES,
  CREATURE_DEFAULT_SCOPE,
  BREED_EVERY,
  KOZ_EXTRA_MUTATION,
} from './creatureAdapter.mjs';
import { ASSETS } from '../data/assets/index.js';
import { dealableRecords } from '../state/rollPool.mjs';
import { CURATED_SETS, SCOPE_CYCLE } from '../state/kineticScope.mjs';
import { MAX_CREATURE_RECORDS } from '../engine/creatureAssembler.js';

const dealable = new Set(dealableRecords(ASSETS).map((r) => r.id));
const library = ASSETS.filter((a) => a && dealable.has(a.id)); // with their markup: a body is read from its svg
const SEED = 20260816;
const run = (scope, over = {}) =>
  press(creatureAdapter, { scope, seed: SEED, press: 1, ctx: { library, bank: [] }, ...over });
let n = 0;
const ok = (msg) => console.log(`  ok ${++n} ${msg}`);

// --- shape ---
assertAdapter(creatureAdapter);
assert.deepEqual(scopeIds(creatureAdapter), SCOPE_CYCLE.slice());
assert.deepEqual(
  CREATURE_SCOPES.map((s) => s.label),
  ['OFF', 'WEAK', 'MED', 'KOZ'],
);
assert.equal(CREATURE_DEFAULT_SCOPE, 'weak');
assert.equal(nextScope(creatureAdapter, 'koz'), 'off');
assert.equal(BREED_EVERY, 2);
assert.equal(KOZ_EXTRA_MUTATION, 1 / 4);
ok('the adapter passes the engines door; the ladder is the stage OFF/WEAK/MED/KOZ and wraps');

// --- founders from an empty bank ---
const hands = {};
for (const s of SCOPE_CYCLE) {
  hands[s] = run(s);
  assert.equal(hands[s].declined, false);
  assert.ok(hands[s].hand.length > 0, `${s} deals founders from an empty bank`);
  assert.ok(hands[s].hand.length <= WIDE_HAND_SIZE);
  assert.ok(hands[s].draws <= WIDE_HAND_SIZE * 8, `${s} stays inside its draw budget`);
}
ok('an empty bank deals a hand of founders at every scope, inside the draw budget');

// --- OFF stays in the curated sets; every record is a real, gated creature ---
const curated = new Set(CURATED_SETS.flat());
for (const c of hands.off.hand) assert.ok(curated.has(c.body), `OFF founder ${c.body} is curated`);
for (const s of SCOPE_CYCLE)
  for (const c of hands[s].hand) {
    assert.equal(creatureAdapter.gate(c), true);
    assert.equal(c.cultivated.outcome, 'viable');
    assert.ok(typeof c.id === 'string' && c.id);
  }
ok('OFF founders come only from the curated sets; every dealt creature reads viable');

// --- skeleton ruling (Q3): only KOZ may deal a body with no head or limb ---
for (const s of ['off', 'weak'])
  for (const c of hands[s].hand) {
    assert.ok(c.head && Array.isArray(c.limbs) && c.limbs.length > 0, `${s} founder ${c.body} has head and limbs`);
  }
let kozBare = 0;
for (let p = 0; p < 40; p++) for (const c of run('koz', { press: p }).hand) if (!c.head || !c.limbs.length) kozBare++;
assert.ok(kozBare > 0, 'KOZ is allowed to deal a body with no head or limbs (and does, over 40 presses)');
ok('OFF and WEAK skip bodies with no head or limbs; KOZ allows them');

// --- breeding needs three ---
const bankOf = (k) => run('weak', { press: 100 }).hand.slice(0, k);
const bank3 = (() => {
  const seen = new Map();
  for (let p = 0; p < 20 && seen.size < 3; p++) for (const c of run('weak', { press: 200 + p }).hand) seen.set(c.id, c);
  return [...seen.values()].slice(0, 3);
})();
assert.equal(bank3.length, 3);
const bredCount = (hand) => hand.filter((c) => c.lineage && Array.isArray(c.lineage.parents)).length;
for (const s of SCOPE_CYCLE) {
  for (let k = 0; k < 3; k++) {
    const r = run(s, { ctx: { library, bank: bankOf(k) } });
    assert.equal(bredCount(r.hand), 0, `${s} with ${k} banked never breeds`);
  }
}
for (const s of ['off', 'weak']) assert.equal(bredCount(run(s, { ctx: { library, bank: bank3 } }).hand), 0);
for (const s of ['med', 'koz']) {
  let total = 0;
  for (let p = 0; p < 10; p++) total += bredCount(run(s, { press: p, ctx: { library, bank: bank3 } }).hand);
  assert.ok(total > 0, `${s} with three banked breeds`);
}
ok('under three parents never breeds; OFF/WEAK never breed; MED and KOZ breed once the bank holds three');

// --- the bank cap is bankCreature's refusal, not the adapter's: dealing still works against a full bank ---
assert.equal(MAX_CREATURE_RECORDS, 64);
const fullBank = [];
for (let p = 0; fullBank.length < 64 && p < 80; p++)
  for (const c of run('weak', { press: 300 + p }).hand) if (!fullBank.some((r) => r.id === c.id)) fullBank.push(c);
assert.ok(run('med', { ctx: { library, bank: fullBank.slice(0, 64) } }).hand.length > 0);
ok('a full bank still deals (the cap refusal lives in bankCreature, step 3)');

// --- determinism, the clock and Math.random forbidden ---
const realNow = Date.now;
const realRandom = Math.random;
Date.now = () => {
  throw new Error('Date.now in a deal');
};
Math.random = () => {
  throw new Error('Math.random in a deal');
};
try {
  for (const s of SCOPE_CYCLE) {
    const a = run(s, { ctx: { library, bank: bank3 } });
    const b = run(s, { ctx: { library, bank: bank3 } });
    assert.deepEqual(a, b, `${s} is a pure function of its inputs`);
  }
  const sub = bank3[0];
  const f1 = funnel(creatureAdapter, sub, { seed: SEED, press: 2, ctx: { library, bank: bank3 } });
  const f2 = funnel(creatureAdapter, sub, { seed: SEED, press: 2, ctx: { library, bank: bank3 } });
  assert.deepEqual(f1, f2);
} finally {
  Date.now = realNow;
  Math.random = realRandom;
}
const ids = (r) => r.hand.map((c) => c.id).join();
assert.notEqual(ids(run('weak', { press: 1 })), ids(run('weak', { press: 2 })), 'a new press deals a new hand');
assert.notEqual(ids(run('weak', { seed: 1 })), ids(run('weak', { seed: 2 })), 'a new seed deals a new hand');
ok('same inputs give the identical hand (clock and Math.random forbidden); a new press or seed gives a new one');

// --- the gate: a stillborn never reaches a hand, and is counted ---
const gated = press(
  { ...creatureAdapter, deal: (...a) => [{ id: 'dead', cultivated: { outcome: 'stillborn' } }, ...creatureAdapter.deal(...a)] },
  { scope: 'weak', seed: SEED, press: 1, ctx: { library, bank: [] } },
);
assert.ok(!gated.hand.some((c) => c.id === 'dead'));
assert.ok(gated.stillborn >= 1);
assert.equal(creatureAdapter.gate({ id: 'x' }), false);
assert.equal(creatureAdapter.gate(null), false);
ok('a stillborn never enters a hand and is counted; a record with no note never passes');

// --- the read ---
for (const c of hands.weak.hand) {
  const r = creatureAdapter.read(c, {});
  assert.ok(r.total >= 0 && r.total <= 1.25, 'total within [0, 1] plus the room bias');
  for (const k of ['lois', 'davis', 'te']) assert.ok(r[k] >= 0 && r[k] <= 1);
}
const wornLook = hands.weak.hand[0].look;
assert.ok(
  creatureAdapter.read(hands.weak.hand[0], { lookId: wornLook }).total > creatureAdapter.read(hands.weak.hand[0], {}).total,
);
ok('the read is the trio read, in range; the room look earns its bias');

// --- near / the funnel ---
const subject = bank3[0];
const f = funnel(creatureAdapter, subject, { cap: 0.25, seed: SEED, press: 3, ctx: { library, bank: bank3 } });
assert.equal(f.declined, false);
assert.ok(f.hand.length > 0 && f.hand.length <= NARROW_HAND_SIZE, `a hand of at most ${NARROW_HAND_SIZE}`);
for (const c of f.hand) {
  assert.notEqual(c.id, subject.id, 'the subject is never its own neighbour');
  assert.ok(creatureDistance(subject, c) <= 0.25 + 1e-9, 'within the cap');
  assert.equal(creatureAdapter.gate(c), true);
}
assert.ok(f.picked, 'the funnel narrows to a pick');
const tight = funnel(creatureAdapter, subject, { cap: 0.1, seed: SEED, press: 3, ctx: { library, bank: bank3 } });
for (const c of tight.hand) assert.ok(creatureDistance(subject, c) <= 0.1 + 1e-9);
assert.equal(creatureDistance(subject, subject), 0);
ok('the funnel stays within its cap, never returns its subject, and deals only viable creatures');

// --- the founder role rule ---
const auto = [
  { x: 50, y: 0 },
  { x: 100, y: 50 },
  { x: 50, y: 100 },
  { x: 0, y: 50 },
];
const roled = founderRoles(auto);
assert.equal(roled.filter((p) => p.role === 'H').length, 1);
assert.equal(roled.find((p) => p.role === 'H').y, 0, 'the topmost point is the head');
assert.equal(roled.filter((p) => p.role === 'L').length, FOUNDER_LIMBS);
assert.equal(roled.find((p) => p.y === 100).role, 'L', 'the lowest point is a limb');
assert.deepEqual(founderRoles(auto), roled, 'pure');
assert.ok(auto.every((p) => !p.role), 'the input is never mutated');
const handed = [{ x: 10, y: 10, role: 'L' }, { x: 20, y: 80 }];
assert.deepEqual(founderRoles(handed), handed, "an artist's own roles are left exactly as they are");
assert.deepEqual(founderRoles([{ x: 50, y: 50 }]), [{ x: 50, y: 50 }], 'one point cannot hold a head and a limb');
assert.deepEqual(founderRoles(null), []);
ok('the founder role rule: topmost is the head, the lowest are limbs, hand-made roles and bare glyphs are left alone');

// --- a hand mutation is a creature of its own (fresh id, one gene away), never the banked record edited in place ---
const sib = creatureAdapter.near(bank3[0], 0.25, { seed: SEED, press: 4, maxDraws: 24, ctx: { library, bank: [] } });
assert.ok(sib.length > 0);
for (const c of sib) {
  assert.match(c.id, /^cr-[0-9a-f]{8}$/);
  assert.notEqual(c.id, bank3[0].id);
}
ok('a near candidate carries a fresh door-shaped id, different from its subject');

// --- seam ---
const src = readFileSync(new URL('./creatureAdapter.mjs', import.meta.url), 'utf8')
  .split('\n')
  .filter((l) => !/^\s*\/\//.test(l))
  .join('\n');
for (const bad of ['Date.now', 'Math.random', 'performance.now', 'zustand', "from 'react'", 'useStore', 'bankCreature'])
  assert.ok(!src.includes(bad), `the adapter does not touch ${bad}`);
ok('the adapter imports no store, React, clock or Math.random');

console.log(`creatureAdapter selfcheck: ${n} ok`);
