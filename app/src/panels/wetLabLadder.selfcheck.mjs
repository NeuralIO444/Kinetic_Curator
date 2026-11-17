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
  openForExisting,
  loadLadder,
  saveLadder,
  restoreLadder,
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

ok('the rungs are the four of the spec (§12.2), bottom to top, and keeping three opens the next', () => {
  assert.deepEqual(RUNG_IDS, ['shape', 'construct', 'creature', 'rig']);
  assert.equal(OPEN_AT, 3);
  assert.equal(RUNGS.length, 4);
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
  assert.equal(lockLabel('construct'), 'KEEP 3 SHAPES');
  assert.equal(lockLabel('creature'), 'KEEP 3 CONSTRUCTS');
  assert.equal(lockLabel('rig'), 'KEEP 3 CREATURES');
  for (const id of RUNG_IDS.slice(1)) assert.ok(lockLabel(id).split(' ').length <= 4, `${id} lock line`);
  assert.equal(lockLabel('nope'), null);
});

ok('the third keep opens the next rung exactly once, and says which', () => {
  const two = keepN(emptyLadder(), 'shape', 2);
  assert.deepEqual(two.opened, []);
  assert.equal(isOpen(two.ladder, 'construct'), false);
  assert.equal(pips(two.ladder, 'shape'), 2);
  const three = keep(two.ladder, 'shape');
  assert.equal(three.opened, 'construct');
  assert.equal(isOpen(three.ladder, 'construct'), true);
  assert.equal(pips(three.ladder, 'shape'), 3);
  assert.equal(topOpenRung(three.ladder), 'construct');
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
  assert.deepEqual(order, ['construct', 'creature', 'rig']);
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
  const skipped = keepN(l, 'creature', 9);
  assert.deepEqual(skipped.ladder, l, 'keeping on a rung that is not open cannot open the one above it');
});

ok('an old five-rung record (ASSET, RECIPE) carries into CONSTRUCT; unknown rungs are dropped', () => {
  const old = {
    v: 1,
    kept: { shape: 3, asset: 2, recipe: 4, creature: 1 },
    open: { shape: true, asset: true, recipe: true, creature: false, rig: false },
  };
  const l = sanitizeLadder(old);
  assert.deepEqual(Object.keys(l.kept), RUNG_IDS);
  assert.deepEqual(Object.keys(l.open), RUNG_IDS);
  assert.equal(l.kept.construct, 4, 'the larger of the old two counts');
  assert.equal(isOpen(l, 'construct'), true, 'an open ASSET means an open CONSTRUCT');
  assert.equal(isOpen(l, 'creature'), true, 'four construct keeps have opened CREATURE');
  assert.equal(isOpen(l, 'rig'), false);
  const closed = sanitizeLadder({ kept: { shape: 1, asset: 2 }, open: { shape: true, asset: false, recipe: true } });
  assert.equal(isOpen(closed, 'construct'), false, 'a closed ASSET stays closed even if RECIPE claimed open');
  assert.equal(closed.kept.construct, 2);
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
  const l = sanitizeLadder({ kept: { shape: '2', construct: -4, creature: NaN, rig: 1e3 }, open: { shape: false } });
  assert.equal(l.kept.shape, 2);
  assert.equal(l.kept.construct, 0);
  assert.equal(l.kept.creature, 0);
  assert.equal(isOpen(l, 'shape'), true, 'the bottom rung can never be locked');
});

ok('sanitize cannot leave a rung open above a locked one, and finishes an opening the keeps earned', () => {
  const skip = sanitizeLadder({ open: { shape: true, construct: false, creature: true, rig: true } });
  assert.deepEqual(
    RUNG_IDS.map((id) => isOpen(skip, id)),
    [true, false, false, false],
  );
  const earned = sanitizeLadder({ kept: { shape: 3 }, open: { shape: true } });
  assert.equal(isOpen(earned, 'construct'), true, 'three keeps on a rung have opened the next');
  assert.equal(isOpen(earned, 'creature'), false);
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

ok('an artist with kept creatures or beasts starts with every rung open; a new artist does not', () => {
  const fresh = emptyLadder();
  for (const counts of [{ creatures: 1 }, { beasts: 2 }, { creatures: 5, beasts: 1 }]) {
    const l = openForExisting(fresh, counts);
    assert.deepEqual(
      RUNG_IDS.map((id) => isOpen(l, id)),
      RUNG_IDS.map(() => true),
      JSON.stringify(counts),
    );
    assert.deepEqual(l.kept, fresh.kept, 'the keeps are not touched');
    assert.equal(topOpenRung(l), 'rig');
  }
  assert.deepEqual(openForExisting(fresh, { creatures: 0, beasts: 0 }), fresh);
  assert.deepEqual(openForExisting(fresh), fresh);
});

ok('openForExisting never closes a rung, reads junk counts as zero, and does not change its input', () => {
  const half = keepN(emptyLadder(), 'shape', 3).ladder;
  const frozen = JSON.stringify(half);
  for (const junk of [NaN, -3, '4', null, undefined, Infinity]) {
    const l = openForExisting(half, { creatures: junk, beasts: junk });
    assert.equal(isOpen(l, 'construct'), true, 'an earned rung stays open');
    assert.equal(isOpen(l, 'creature'), false, `junk count ${String(junk)} opens nothing`);
  }
  openForExisting(half, { creatures: 3 });
  assert.equal(JSON.stringify(half), frozen);
});

ok('the model is pure: no clock, no Math.random, no store, no React, no DOM', () => {
  const src = readFileSync(new URL('./wetLabLadder.mjs', import.meta.url), 'utf8')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
  for (const bad of ['Date.now', 'Math.random', 'performance.now', 'zustand', "from 'react'", 'document.', 'window.'])
    assert.ok(!src.includes(bad), `wetLabLadder.mjs has no ${bad}`);
});

ok('restoreLadder: holdings open every rung only the first time; a stored ladder is the record (#2318)', () => {
  const mem = new Map();
  const storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => void mem.set(k, v) };
  // an artist with creatures, meeting the ladder for the first time: every rung open
  const first = restoreLadder(storage, { creatures: 2 });
  assert.ok(RUNG_IDS.every((id) => isOpen(first, id)));
  // a new artist who earns creatures on the ladder: stored ladder has RIG locked; a reload keeps it locked
  mem.clear();
  const fresh = restoreLadder(storage, { creatures: 0 });
  saveLadder(storage, fresh);
  const reload = restoreLadder(storage, { creatures: 2 });
  assert.equal(isOpen(reload, 'rig'), false, 'creatures kept on the ladder do not open RIG on reload');
  assert.equal(isOpen(reload, 'shape'), true);
  // a blocked store reads as a first meeting and never throws
  const blocked = {
    getItem() {
      throw new Error('x');
    },
    setItem() {
      throw new Error('x');
    },
  };
  assert.ok(RUNG_IDS.every((id) => isOpen(restoreLadder(blocked, { beasts: 1 }), id)));
  assert.deepEqual(restoreLadder(blocked, {}), emptyLadder());
});

console.log(`wetLabLadder selfcheck: ${n} ok`);
