// shapeAdapter.selfcheck.mjs — #2279: the SHAPE rung's deal adapter (docs/design/wetlab-ladder-spec.md §12.4, §12.5).
//
//   seam         the adapter passes the engines' shape check; scopes are ANY then every construct style
//   primitives   a hand is drawn from one style's construct vocabulary only, never the whole library
//   one style    every shape in a hand shares a style, in every scope; ANY reaches several styles over presses
//   pure         the same (seed, press, scope) deals the same hand; another press deals another
//   short        a style with fewer primitives than the hand gives a short hand, never padded
//   near         CURATOR stays in the subject's style and never deals the subject
//   gate         a shape the host's library cannot draw dies in the hand; junk never enters
//   read         neutral and marked unmeasured — no invented score
//   no clock     the adapter imports no store, React, clock or Math.random
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertAdapter } from './dealAdapter.mjs';
import { press, WIDE_HAND_SIZE } from './kineticEngine.mjs';
import { funnel } from './curatorEngine.mjs';
import { CONSTRUCT_STYLE_IDS, constructVocabularyIds } from '../engine/constructRules.js';
import { ASSETS } from '../data/assets/index.js';
import { shapeAdapter, shapeKey, shapeStyleFor, SHAPE_SCOPES, SHAPE_ANY, SHAPE_DEFAULT_SCOPE } from './shapeAdapter.mjs';

let n = 0;
const ok = (name, fn) => {
  fn();
  n += 1;
  console.log(`  ok - ${name}`);
};

const SEED = 0x5a9e;
const library = ASSETS.map((a) => ({ id: a.id, svg: a.svg }));
const kin = (scope, p = 1, ctx = { library }) => press(shapeAdapter, { scope, seed: SEED, press: p, ctx });
const styles = (hand) => new Set(hand.map((c) => c.style));

ok('the adapter passes the engines’ seam; scopes are ANY then every construct style', () => {
  assertAdapter(shapeAdapter);
  assert.equal(SHAPE_DEFAULT_SCOPE, SHAPE_ANY);
  assert.deepEqual(
    SHAPE_SCOPES.map((s) => s.id),
    [SHAPE_ANY, ...CONSTRUCT_STYLE_IDS],
  );
  assert.ok(CONSTRUCT_STYLE_IDS.length >= 2, 'more than one style to deal from');
});

ok('a named scope deals only that style’s construct primitives', () => {
  for (const style of CONSTRUCT_STYLE_IDS) {
    const { hand } = kin(style);
    const vocab = constructVocabularyIds(style);
    assert.ok(hand.length >= 1, `${style} deals something`);
    for (const c of hand) {
      assert.equal(c.style, style);
      assert.ok(vocab.includes(c.asset), `${c.asset} is in ${style}'s vocabulary`);
    }
    assert.equal(new Set(hand.map((c) => c.asset)).size, hand.length, 'no shape twice in a hand');
  }
});

ok('every hand is one style, in ANY too, and ANY reaches several styles across presses', () => {
  const seen = new Set();
  for (let p = 0; p < 60; p += 1) {
    const { hand } = kin(SHAPE_ANY, p);
    assert.equal(styles(hand).size, 1, `press ${p} is one style`);
    seen.add(hand[0].style);
    assert.equal(hand[0].style, shapeStyleFor(SHAPE_ANY, { seed: SEED, press: p }), 'the press picks the style');
  }
  assert.ok(seen.size >= 4, `ANY reached ${seen.size} styles in 60 presses`);
});

ok('deterministic: the same seed, press and scope deal the same hand; another press can differ', () => {
  for (const scope of [SHAPE_ANY, CONSTRUCT_STYLE_IDS[0]]) {
    assert.deepEqual(kin(scope, 4).hand, kin(scope, 4).hand);
  }
  const style = CONSTRUCT_STYLE_IDS.find((s) => constructVocabularyIds(s).length >= 3);
  const orders = new Set();
  for (let p = 0; p < 12; p += 1)
    orders.add(
      kin(style, p)
        .hand.map((c) => c.asset)
        .join(','),
    );
  assert.ok(orders.size > 1, 'presses deal the style in different orders');
});

ok('a style smaller than the hand gives a short hand, never padded with another style', () => {
  for (const style of CONSTRUCT_STYLE_IDS) {
    const size = constructVocabularyIds(style).length;
    const { hand } = kin(style);
    assert.equal(hand.length, Math.min(size, WIDE_HAND_SIZE), `${style}: ${size} primitives`);
  }
});

ok('CURATOR stays in the subject’s style and never deals the subject', () => {
  const style = CONSTRUCT_STYLE_IDS.find((s) => constructVocabularyIds(s).length >= 4);
  const subject = { style, asset: constructVocabularyIds(style)[0] };
  const r = funnel(shapeAdapter, subject, { cap: 0.25, seed: SEED, press: 2, ctx: { library } });
  const dealt = r.ordered.map((o) => o.candidate);
  assert.ok(dealt.length >= 1);
  for (const c of dealt) {
    assert.equal(c.style, style);
    assert.notEqual(c.asset, subject.asset);
  }
  assert.deepEqual(shapeAdapter.near({ style: 'nope', asset: 'x' }, 0.2, { seed: 1, press: 1, maxDraws: 9 }), []);
  assert.deepEqual(shapeAdapter.near(null, 0.2, { seed: 1, press: 1, maxDraws: 9 }), []);
});

ok('the gate drops a shape the host cannot draw, and junk never enters', () => {
  const style = CONSTRUCT_STYLE_IDS[0];
  const [first, ...rest] = constructVocabularyIds(style);
  const partial = library.filter((a) => a.id !== first);
  const { hand } = kin(style, 1, { library: partial });
  assert.ok(!hand.some((c) => c.asset === first), 'an undrawable primitive dies in the hand');
  assert.equal(hand.length, Math.min(rest.length, WIDE_HAND_SIZE));
  assert.equal(shapeAdapter.gate({ style, asset: first }, { library: [{ id: first, svg: '' }] }), false, 'empty svg');
  assert.equal(shapeAdapter.gate({ style, asset: first }, {}), true, 'no library: trust the vocabulary');
  for (const junk of [null, 3, 'x', {}, { style }, { style: 'nope', asset: first }, { style, asset: 'not-in-style' }]) {
    assert.equal(shapeAdapter.gate(junk, { library }), false);
    assert.equal(shapeKey(junk), '');
  }
  assert.equal(shapeKey({ style, asset: first }), `shape:${style}:${first}`);
});

ok('the read is neutral and says it is unmeasured: no invented score', () => {
  const style = CONSTRUCT_STYLE_IDS[0];
  for (const asset of constructVocabularyIds(style)) {
    assert.deepEqual(shapeAdapter.read({ style, asset }), { total: 0.5, measured: false });
  }
});

ok('the adapter imports no store, React, clock or Math.random, and never the asset index', () => {
  const src = readFileSync(new URL('./shapeAdapter.mjs', import.meta.url), 'utf8')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
    .join('\n');
  for (const bad of ['Date.now', 'Math.random', 'performance.now', 'zustand', "from 'react'", 'data/assets'])
    assert.ok(!src.includes(bad), `shapeAdapter.mjs has no ${bad}`);
});

console.log(`shapeAdapter selfcheck: ${n} ok`);
