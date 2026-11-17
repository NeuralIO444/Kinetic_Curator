// shapeDeal.selfcheck.mjs — the SHAPE strip's glue (issue #2282): KIN, CUR, the subject, the drawing.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  shapeKinPress,
  shapeCurPress,
  nextShapeScope,
  shapeSubject,
  shapeSvg,
  shapeKey,
  SHAPE_SCOPES,
  SHAPE_DEFAULT_SCOPE,
} from './shapeDeal.mjs';
import { CONSTRUCT_STYLE_IDS, constructVocabularyIds } from '../engine/constructRules.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n += 1;
  console.log(`  ok - ${name}`);
};

const SEED = 0x2282;
const library = CONSTRUCT_STYLE_IDS.flatMap((s) => constructVocabularyIds(s)).map((id) => ({
  id,
  svg: `<g id="${id}"/>`,
}));
const styleOf = (hand) => new Set(hand.map((s) => s.style));

ok('a KIN press is one style, at most six, deterministic', () => {
  const a = shapeKinPress({ scope: 'any', seed: SEED, press: 0, library });
  assert.ok(a.length > 0 && a.length <= 6);
  assert.equal(styleOf(a).size, 1);
  assert.deepEqual(a, shapeKinPress({ scope: 'any', seed: SEED, press: 0, library }));
  assert.ok(
    a.every((s) => shapeKey(s)),
    'every candidate is a real shape',
  );
});

ok('ANY reaches several styles over presses; a named scope stays in its style', () => {
  const seen = new Set();
  for (let p = 0; p < 24; p += 1)
    for (const s of shapeKinPress({ scope: 'any', seed: SEED, press: p, library })) seen.add(s.style);
  assert.ok(seen.size > 1, `ANY dealt ${seen.size} style(s)`);
  const style = CONSTRUCT_STYLE_IDS[0];
  for (let p = 0; p < 6; p += 1)
    assert.deepEqual([...styleOf(shapeKinPress({ scope: style, seed: SEED, press: p, library }))], [style]);
});

ok('the gate: a shape the library cannot draw is never dealt', () => {
  const style = CONSTRUCT_STYLE_IDS[0];
  const [gone, ...rest] = constructVocabularyIds(style);
  const lib = library.filter((a) => a.id !== gone);
  for (let p = 0; p < 6; p += 1) {
    const h = shapeKinPress({ scope: style, seed: SEED, press: p, library: lib });
    assert.ok(!h.some((s) => s.asset === gone));
    assert.equal(h.length, rest.length);
  }
});

ok('CUR deals the other shapes of the subject style, never the subject; nothing without a subject', () => {
  const subject = shapeKinPress({ scope: 'any', seed: SEED, press: 3, library })[0];
  const r = shapeCurPress({ subject, seed: SEED, press: 0, library });
  assert.ok(r.hand.length > 0 && r.hand.length <= 3);
  assert.ok(r.hand.every((s) => s.style === subject.style && s.asset !== subject.asset));
  assert.deepEqual(r, shapeCurPress({ subject, seed: SEED, press: 0, library }));
  assert.deepEqual(shapeCurPress({ subject: null, seed: SEED, press: 0, library }), { hand: [], picked: null });
  assert.deepEqual(shapeCurPress({ subject: { style: 'x', asset: 'y' }, seed: SEED, press: 0, library }), {
    hand: [],
    picked: null,
  });
});

ok('the scope pill walks ANY then every style and back', () => {
  assert.equal(SHAPE_DEFAULT_SCOPE, 'any');
  let s = SHAPE_DEFAULT_SCOPE;
  const walked = [s];
  for (let i = 0; i < SHAPE_SCOPES.length; i += 1) walked.push((s = nextShapeScope(s)));
  assert.deepEqual(
    walked.slice(0, -1),
    SHAPE_SCOPES.map((x) => x.id),
  );
  assert.equal(walked[walked.length - 1], 'any');
});

ok('the CUR subject is the last kept shape, else the lead of the hand, else none', () => {
  const hand = shapeKinPress({ scope: 'any', seed: SEED, press: 1, library });
  const kept = [hand[1], hand[0]];
  assert.deepEqual(shapeSubject(kept, hand), hand[0]);
  assert.deepEqual(shapeSubject([], hand), hand[0]);
  assert.deepEqual(shapeSubject([{ style: 'nope', asset: 'x' }], hand), hand[0], 'a garbled shelf entry is skipped');
  assert.equal(shapeSubject([], []), null);
  assert.equal(shapeSubject(null, null), null);
});

ok('a shape draws from the library, or not at all', () => {
  const id = library[0].id;
  assert.equal(shapeSvg(library, id), `<g id="${id}"/>`);
  assert.equal(shapeSvg(library, 'nope'), null);
  assert.equal(shapeSvg(null, id), null);
});

ok('the glue is pure: no clock, no Math.random, no store, no React', () => {
  const src = readFileSync(new URL('./shapeDeal.mjs', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');
  for (const bad of ['Date.now', 'Math.random', 'performance.now', 'useStore', "from 'react'"])
    assert.ok(!src.includes(bad), `shapeDeal.mjs has no ${bad}`);
});

console.log(`shapeDeal selfcheck: ${n} ok`);
