// constructDeal.selfcheck.mjs — the CONSTRUCT strip's glue (issue #2301).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  constructKinPress,
  constructCurPress,
  nextConstructScope,
  constructSubject,
  recipeOfRecord,
  assembleCandidate,
  constructKey,
  TOO_FEW_LINE,
  CONSTRUCT_SCOPES,
} from './constructDeal.mjs';
import { CONSTRUCT_STYLE_IDS, constructVocabularyIds } from '../engine/constructRules.js';
import { ASSETS } from '../data/assets/index.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n += 1;
  console.log(`  ok - ${name}`);
};

const SEED = 0x2301;
const byId = new Map(ASSETS.map((a) => [a.id, a]));
const S = CONSTRUCT_STYLE_IDS[0];
const v = constructVocabularyIds(S);
const ctx = { shelf: v.slice(0, 3).map((asset) => ({ style: S, asset })), findAsset: (id) => byId.get(id) || null };

ok('the too-few line names the floor', () => {
  assert.equal(TOO_FEW_LINE, 'KEEP 2 SHAPES OF ONE STYLE');
});

ok('KIN deals recipes that assemble; nothing with an empty shelf', () => {
  const h = constructKinPress({ scope: 'any', seed: SEED, press: 0, ctx });
  assert.ok(h.length > 0);
  assert.ok(h.every((c) => assembleCandidate(c, ctx)));
  assert.deepEqual(constructKinPress({ scope: 'any', seed: SEED, press: 0, ctx: { ...ctx, shelf: [] } }), []);
  assert.deepEqual(constructKinPress({ scope: 'any', seed: SEED, press: 0, ctx: null }), []);
});

ok('CUR narrows from a subject; nothing without one', () => {
  const subject = constructKinPress({ scope: 'any', seed: SEED, press: 0, ctx })[0];
  const r = constructCurPress({ subject, seed: SEED, press: 0, ctx });
  assert.ok(r.hand.length > 0 && r.hand.length <= 3);
  assert.ok(r.hand.every((c) => constructKey(c) !== constructKey(subject)));
  assert.deepEqual(constructCurPress({ subject: null, seed: SEED, press: 0, ctx }), { hand: [], picked: null });
});

ok('the scope pill walks ANY then every style and back', () => {
  let s = 'any';
  const walked = [s];
  for (let i = 0; i < CONSTRUCT_SCOPES.length; i += 1) walked.push((s = nextConstructScope(s)));
  assert.deepEqual(
    walked.slice(0, -1),
    CONSTRUCT_SCOPES.map((x) => x.id),
  );
  assert.equal(walked[walked.length - 1], 'any');
});

ok('a banked record reads back as the recipe it used: style, seed, its distinct shapes', () => {
  const c = constructKinPress({ scope: 'any', seed: SEED, press: 0, ctx })[0];
  const rec = assembleCandidate(c, ctx);
  const back = recipeOfRecord(rec);
  assert.equal(back.style, c.style);
  assert.equal(back.seed, c.seed);
  assert.ok(back.vocabulary.every((id) => c.vocabulary.includes(id)));
  assert.equal(recipeOfRecord(null), null);
  assert.equal(
    recipeOfRecord({ style: S, seed: 1, parts: [{ asset: v[0] }, { asset: v[0] }] }),
    null,
    'one shape is below the floor',
  );
});

ok('the CUR subject: last kept, else the last banked recipe, else the hand lead, else none', () => {
  const h = constructKinPress({ scope: 'any', seed: SEED, press: 0, ctx });
  const rec = assembleCandidate(h[1], ctx);
  assert.deepEqual(constructSubject(h[2], [rec], h), h[2]);
  assert.deepEqual(constructSubject(null, [rec], h), recipeOfRecord(rec));
  assert.deepEqual(constructSubject(null, [], h), h[0]);
  assert.equal(constructSubject(null, null, null), null);
});

ok('pure: no clock, no Math.random, no store, no React', () => {
  const src = readFileSync(new URL('./constructDeal.mjs', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');
  for (const bad of ['Date.now', 'Math.random', 'performance.now', 'useStore', "from 'react'"])
    assert.ok(!src.includes(bad), `constructDeal.mjs has no ${bad}`);
});

console.log(`constructDeal selfcheck: ${n} ok`);
