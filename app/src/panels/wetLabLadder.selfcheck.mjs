// wetLabLadder.selfcheck.mjs — WetLab ladder step 1 (docs/design/wetlab-ladder-spec.md §2, §4, §9): the rung model.
//
//   new artist   only SHAPE is open; nothing kept; every higher rung is locked with a four-word line
//   keep         the third keep on a rung opens the next, once; a locked rung refuses a keep and changes nothing
//   pips         counts, capped at the opening number; keeping past it still counts but opens nothing twice
//   sanitize     garbled or hand-edited records read safely and cannot skip a rung
//   store        round-trips through an injected storage; a blocked or full store reads as a new artist's, never throws
//   pure         the model touches no clock, no Math.random, no store, no React
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  RUNGS,
  RUNG_IDS,
  OPEN_AT,
  LADDER_KEY,
  emptyLadder,
  sanitizeLadder,
  isOpen,
  pips,
  lockLabel,
  keep,
  topOpenRung,
  loadLadder,
  saveLadder,
} from './wetLabLadder.mjs';

let n = 0;
const ok = (name, fn) => {
  fn();
  n += 1;
  console.log(`  ok - ${name}`);
};

const keepN = (ladder, rung, times) => {
  let cur = ladder;
  const opened = [];
  for (let i = 0; i < times; i += 1) {
    const r = keep(cur, rung);
    cur = r.ladder;
    if (r.opened) opened.push(r.opened);
  }
  return { ladder: cur, opened };
};

ok('the rungs are the five of the spec, bottom to top, and keeping three opens the next', () => {
  assert.deepEqual(RUNG_IDS, ['shape', 'asset', 'recipe', 'creature', 'rig']);
  assert.equal(OPEN_AT, 3);
  assert.equal(RUNGS.length, 5);
});

ok('a new artist has only SHAPE open and nothing kept', () => {
  const l = emptyLadder();
  assert.equal(isOpen(l, 'shape'), true);
  for (const id of RUNG_IDS.slice(1)) assert.equal(isOpen(l, id), false, `${id} starts locked`);
  for (const id of RUNG_IDS) assert.equal(pips(l, id), 0);
  assert.equal(topOpenRung(l), 'shape');
});

ok('a locked rung says what opens it in four words or fewer; the bottom rung is never locked', () => {
  assert.equal(lockLabel('shape'), null);
  assert.equal(lockLabel('asset'), 'KEEP 3 SHAPES');
  assert.equal(lockLabel('recipe'), 'KEEP 3 ASSETS');
  assert.equal(lockLabel('creature'), 'KEEP 3 RECIPES');
  assert.equal(lockLabel('rig'), 'KEEP 3 CREATURES');
  for (const id of RUNG_IDS.slice(1)) assert.ok(lockLabel(id).split(' ').length <= 4, `${id} lock line`);
  assert.equal(lockLabel('nope'), null);
});

ok('the third keep opens the next rung exactly once, and says which', () => {
  const two = keepN(emptyLadder(), 'shape', 2);
  assert.deepEqual(two.opened, []);
  assert.equal(isOpen(two.ladder, 'asset'), false);
  assert.equal(pips(two.ladder, 'shape'), 2);
  const three = keep(two.ladder, 'shape');
  assert.equal(three.opened, 'asset');
  assert.equal(isOpen(three.ladder, 'asset'), true);
  assert.equal(pips(three.ladder, 'shape'), 3);
  assert.equal(topOpenRung(three.ladder), 'asset');
  const more = keepN(three.ladder, 'shape', 5);
  assert.deepEqual(more.opened, [], 'keeping more opens nothing a second time');
  assert.equal(pips(more.ladder, 'shape'), OPEN_AT, 'pips cap at the opening number');
  assert.equal(more.ladder.kept.shape, 8, 'the keeps themselves still count');
});

ok('the whole ladder opens one rung at a time, in order', () => {
  let l = emptyLadder();
  const order = [];
  for (const id of RUNG_IDS) {
    const r = keepN(l, id, OPEN_AT);
    l = r.ladder;
    order.push(...r.opened);
  }
  assert.deepEqual(order, ['asset', 'recipe', 'creature', 'rig']);
  assert.equal(topOpenRung(l), 'rig');
  const top = keepN(l, 'rig', 10);
  assert.deepEqual(top.opened, [], 'the top rung has nothing above it to open');
});

ok('a keep on a locked rung is refused and changes nothing', () => {
  const l = emptyLadder();
  const r = keep(l, 'creature');
  assert.equal(r.opened, null);
  assert.deepEqual(r.ladder, l);
  assert.equal(keep(l, 'nope').opened, null);
  assert.deepEqual(keep(l, 'nope').ladder, l);
  const skipped = keepN(l, 'recipe', 9);
  assert.deepEqual(skipped.ladder, l, 'keeping on a rung that is not open cannot open the one above it');
});

ok('keep is pure: the ladder it was given is not changed', () => {
  const l = emptyLadder();
  const frozen = JSON.stringify(l);
  keepN(l, 'shape', 4);
  assert.equal(JSON.stringify(l), frozen);
});

ok('sanitize reads garbage as a new artist, field by field', () => {
  for (const junk of [null, undefined, 7, 'x', [], {}, { kept: 'no', open: 3 }]) {
    assert.deepEqual(sanitizeLadder(junk), emptyLadder());
  }
  const l = sanitizeLadder({ kept: { shape: '2', asset: -4, recipe: NaN, rig: 1e3 }, open: { shape: false } });
  assert.equal(l.kept.shape, 2);
  assert.equal(l.kept.asset, 0);
  assert.equal(l.kept.recipe, 0);
  assert.equal(isOpen(l, 'shape'), true, 'the bottom rung can never be locked');
});

ok('sanitize cannot leave a rung open above a locked one, and finishes an opening the keeps earned', () => {
  const skip = sanitizeLadder({ open: { shape: true, asset: false, recipe: true, creature: true, rig: true } });
  assert.deepEqual(
    RUNG_IDS.map((id) => isOpen(skip, id)),
    [true, false, false, false, false],
  );
  const earned = sanitizeLadder({ kept: { shape: 3 }, open: { shape: true } });
  assert.equal(isOpen(earned, 'asset'), true, 'three keeps on a rung have opened the next');
  assert.equal(isOpen(earned, 'recipe'), false);
});

ok('the store round-trips through an injected storage under one key', () => {
  const mem = new Map();
  const storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => void mem.set(k, v) };
  assert.deepEqual(loadLadder(storage), emptyLadder(), 'nothing stored reads as a new artist');
  const l = keepN(emptyLadder(), 'shape', 3).ladder;
  assert.equal(saveLadder(storage, l), true);
  assert.deepEqual([...mem.keys()], [LADDER_KEY]);
  assert.deepEqual(loadLadder(storage), l);
  mem.set(LADDER_KEY, '{not json');
  assert.deepEqual(loadLadder(storage), emptyLadder(), 'a garbled record reads as a new artist');
});

ok('a blocked or missing store never throws and reads as a new artist', () => {
  const blocked = {
    getItem() {
      throw new Error('blocked');
    },
    setItem() {
      throw new Error('quota');
    },
  };
  assert.deepEqual(loadLadder(blocked), emptyLadder());
  assert.equal(saveLadder(blocked, emptyLadder()), false);
  assert.deepEqual(loadLadder(null), emptyLadder());
  assert.equal(saveLadder(null, emptyLadder()), false);
});

ok('the model is pure: no clock, no Math.random, no store, no React, no DOM', () => {
  const src = readFileSync(new URL('./wetLabLadder.mjs', import.meta.url), 'utf8')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
  for (const bad of ['Date.now', 'Math.random', 'performance.now', 'zustand', "from 'react'", 'document.', 'window.'])
    assert.ok(!src.includes(bad), `wetLabLadder.mjs has no ${bad}`);
});

console.log(`wetLabLadder selfcheck: ${n} ok`);
