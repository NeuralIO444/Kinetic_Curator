// constructAdapter.selfcheck.mjs — WetLab CONSTRUCT rung (issue #2299; spec §13.1, §13.2, §13.5).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { press } from './kineticEngine.mjs';
import { funnel } from './curatorEngine.mjs';
import {
  constructAdapter,
  constructKey,
  constructStylesInPlay,
  assembleCandidate,
  CONSTRUCT_FLOOR,
} from './constructAdapter.mjs';
import { CONSTRUCT_STYLE_IDS, constructVocabularyIds } from '../engine/constructRules.js';
import { ASSETS } from '../data/assets/index.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n += 1;
  console.log(`  ok - ${name}`);
};

const SEED = 0x2299;
const byId = new Map(ASSETS.map((a) => [a.id, a]));
const findAsset = (id) => byId.get(id) || null;
const [S1, S2] = CONSTRUCT_STYLE_IDS;
const v1 = constructVocabularyIds(S1);
const v2 = constructVocabularyIds(S2);
// two kept of S1 (in play), one of S2 (not in play), plus garbage
const shelf = [
  { style: S1, asset: v1[0] },
  { style: S1, asset: v1[1] },
  { style: S2, asset: v2[0] },
  { style: 'nope', asset: 'x' },
  { style: S1, asset: 'not-in-vocab' },
];
const ctx = { shelf, findAsset, assetAttach: null };
const kin = (scope, p, c = ctx) => press(constructAdapter, { scope, seed: SEED, press: p, ctx: c }).hand;

ok('a style is in play at two kept shapes, not one; garbage is ignored', () => {
  assert.equal(CONSTRUCT_FLOOR, 2);
  assert.deepEqual(constructStylesInPlay(shelf), [S1]);
  assert.deepEqual(constructStylesInPlay([]), []);
  assert.deepEqual(constructStylesInPlay(null), []);
});

ok('KIN builds only from kept shapes of one style in play, and every candidate assembles', () => {
  const h = kin('any', 0);
  assert.ok(h.length > 0 && h.length <= 6, `hand of ${h.length}`);
  const kept = new Set([v1[0], v1[1]]);
  for (const c of h) {
    assert.equal(c.style, S1);
    assert.ok(c.vocabulary.every((id) => kept.has(id)), 'never another primitive of the style');
    const rec = assembleCandidate(c, ctx);
    assert.ok(rec && /^cn-[0-9a-f]{8}$/.test(rec.id));
    assert.ok(rec.parts.every((p) => kept.has(p.asset)), 'the record uses only kept shapes');
  }
  assert.equal(new Set(h.map(constructKey)).size, h.length, 'no duplicates in a hand');
});

ok('deterministic, and a second press deals differently', () => {
  assert.deepEqual(kin('any', 0), kin('any', 0));
  assert.notDeepEqual(kin('any', 0).map(constructKey), kin('any', 1).map(constructKey));
});

ok('no style in play gives an empty hand; a named style not in play gives an empty hand', () => {
  assert.deepEqual(kin('any', 0, { ...ctx, shelf: [{ style: S1, asset: v1[0] }] }), []);
  assert.deepEqual(kin(S2, 0), []);
  assert.ok(kin(S1, 0).length > 0);
});

ok('CUR differs from the subject in exactly one vocabulary asset, keeps its seed, never returns it', () => {
  const wide = [...v1.slice(0, 3)];
  const c3 = { ...ctx, shelf: wide.map((asset) => ({ style: S1, asset })) };
  const subject = { style: S1, vocabulary: [wide[0], wide[1]], seed: 12345 };
  const r = funnel(constructAdapter, subject, { cap: 0.25, seed: SEED, press: 0, ctx: c3 });
  assert.ok(r.hand.length > 0);
  const own = new Set(subject.vocabulary);
  for (const c of r.hand) {
    assert.notEqual(constructKey(c), constructKey(subject));
    assert.equal(c.seed, subject.seed);
    assert.equal(c.style, S1);
    const added = c.vocabulary.filter((id) => !own.has(id)).length;
    const removed = subject.vocabulary.filter((id) => !c.vocabulary.includes(id)).length;
    assert.ok((added === 1 && removed === 1) || (added === 0 && removed === 1), 'one change');
    assert.ok(c.vocabulary.length >= CONSTRUCT_FLOOR);
  }
});

ok('the gate refuses a recipe below the floor, with a stray asset, or that cannot draw', () => {
  const good = { style: S1, vocabulary: [v1[0], v1[1]].sort(), seed: 7 };
  assert.equal(constructAdapter.gate(good, ctx), true);
  assert.equal(constructAdapter.gate({ ...good, vocabulary: [v1[0]] }, ctx), false);
  assert.equal(constructAdapter.gate({ ...good, vocabulary: [v1[0], v1[2]] }, ctx), false, 'v1[2] is not kept');
  assert.equal(constructAdapter.gate(good, { ...ctx, findAsset: () => null }), false);
  const partial = (id) => (id === v1[1] ? null : findAsset(id)); // the library lost one kept shape
  assert.equal(constructAdapter.gate(good, { ...ctx, findAsset: partial }), false, 'a kept shape that cannot draw');
  assert.equal(assembleCandidate(good, { ...ctx, findAsset: partial }), null);
  assert.equal(constructAdapter.gate({ style: 'nope', vocabulary: [], seed: 1 }, ctx), false);
});

ok('the key is a pure string of the recipe; garbage keys to empty', () => {
  assert.equal(constructKey({ style: S1, vocabulary: ['b', 'a'], seed: 3 }), `construct:${S1}:a+b:3`);
  for (const junk of [null, {}, { style: S1 }, { style: S1, vocabulary: [], seed: 1 }, { style: S1, vocabulary: ['a'], seed: -1 }])
    assert.equal(constructKey(junk), '');
});

ok('the read is neutral and says it is not measured', () => {
  assert.deepEqual(constructAdapter.read(), { total: 0.5, measured: false });
});

ok('pure: no clock, no Math.random, no store, no React', () => {
  const src = readFileSync(new URL('./constructAdapter.mjs', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');
  for (const bad of ['Date.now', 'Math.random', 'performance.now', 'useStore', "from 'react'"])
    assert.ok(!src.includes(bad), `constructAdapter.mjs has no ${bad}`);
});

console.log(`constructAdapter selfcheck: ${n} ok`);
