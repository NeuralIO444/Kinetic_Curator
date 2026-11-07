// node src/components/dishLifeChip.selfcheck.mjs
// #1923 — the footer DISH LIFE chip's states and its per-viewer preference, pinned without a DOM.
import assert from 'node:assert/strict';
import { helpText } from '../data/helpCopy.js';
import { readFileSync } from 'node:fs';
import {
  dishLifeChipModel,
  readDishLifePref,
  writeDishLifePref,
  STRENGTH_MIN,
  STRENGTH_MAX,
} from './dishLifeChip.model.mjs';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const on = (over = {}) => ({ dishLife: true, dishLifeAwake: true, dishLifeShed: 0, dishLifeStrength: 0.35, ...over });

ok('off: the flag is not set (or the dial is 0) — the glyph is dark', () => {
  for (const s of [
    {},
    { dishLife: false },
    on({ dishLife: false }),
    on({ dishLifeStrength: 0 }),
    { dishLife: 'yes' },
  ]) {
    const m = dishLifeChipModel(s);
    assert.equal(m.state, 'off', JSON.stringify(s));
    assert.equal(m.lit, false);
  }
});

ok('the symbol lights only while the culture is actually running', () => {
  const m = dishLifeChipModel(on());
  assert.deepEqual([m.state, m.lit, m.percent], ['on', true, 35]);
  assert.match(m.title, /is running/);
  assert.match(m.title, /\(35%\)$/);
  const arming = dishLifeChipModel(on({ dishLifeAwake: false }));
  assert.deepEqual([arming.state, arming.lit], ['arming', false], 'on but not yet running: armed, not lit');
});

ok('the governor shows through: slowed, then held — both still lit, and the title says why', () => {
  const a = dishLifeChipModel(on({ dishLifeShed: 1 }));
  const b = dishLifeChipModel(on({ dishLifeShed: 2 }));
  assert.deepEqual([a.state, a.lit, b.state, b.lit], ['slowed', true, 'held', true]);
  assert.match(a.title, /governor/);
  assert.match(b.title, /held still/);
  assert.equal(dishLifeChipModel(on({ dishLifeShed: 7 })).state, 'held', 'any deeper shed is held');
});

ok('the off title promises the balance: a quiet layer, the other systems keep doing their thing', () => {
  const t = dishLifeChipModel({}).title;
  assert.match(t, /quiet/);
  assert.match(t, /Director, the trio and the KINETIC buttons/);
});

ok('every state reads its details from the help copy, each distinct', () => {
  const states = [{}, on({ dishLifeAwake: false }), on(), on({ dishLifeShed: 1 }), on({ dishLifeShed: 2 })];
  const titles = states.map((s) => dishLifeChipModel(s).title);
  assert.equal(new Set(titles).size, 5, 'five states, five copies');
  for (const s of states) {
    const m = dishLifeChipModel(s);
    assert.ok(m.title.startsWith(helpText(`dish-life-${m.state}`)), m.state);
  }
  assert.ok(helpText('dish-life-strength').length > 0);
  assert.ok(helpText('dish-life-coupling').length > 0, 'the coupling dial has its help copy (#1923 Phase 2)');
});

ok('the percent is the dial, clamped, junk falls back to the default', () => {
  assert.equal(dishLifeChipModel(on({ dishLifeStrength: 0.6 })).percent, 60);
  assert.equal(dishLifeChipModel(on({ dishLifeStrength: 4 })).percent, 100);
  assert.equal(dishLifeChipModel(on({ dishLifeStrength: 'x' })).percent, 35);
  assert.ok(STRENGTH_MIN > 0 && STRENGTH_MAX === 1);
});

ok('the preference: round-trips through a Storage, never throws on junk or a broken store', () => {
  const mem = new Map();
  const st = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v) };
  assert.equal(readDishLifePref(st), null, 'nothing stored');
  assert.equal(writeDishLifePref(st, { on: true, strength: 0.6 }), true);
  // #1923 Phase 2 re-pin (cause: the preference gained the coupling dial): the read shape carries
  // `coupling` — absent from everything stored before the dial existed, it reads as 0 (off).
  assert.deepEqual(readDishLifePref(st), { on: true, strength: 0.6, coupling: 0 });
  assert.equal(writeDishLifePref(st, { on: 'x', strength: 9 }), true);
  assert.deepEqual(
    readDishLifePref(st),
    { on: false, strength: 1, coupling: 0 },
    'on is strictly boolean; strength clamps',
  );
  assert.equal(writeDishLifePref(st, { on: true, strength: 0.5, coupling: 0.7 }), true);
  assert.deepEqual(readDishLifePref(st), { on: true, strength: 0.5, coupling: 0.7 }, 'coupling round-trips');
  assert.equal(writeDishLifePref(st, { on: true, strength: 0.5, coupling: 4 }), true);
  assert.equal(readDishLifePref(st).coupling, 1, 'coupling clamps to the dial range');
  mem.set('kc.dishLife.v1', '{"on":"yes","strength":0.5}');
  assert.equal(readDishLifePref(st).on, false, 'a stored non-boolean never turns it on');
  mem.set('kc.dishLife.v1', '{not json');
  assert.equal(readDishLifePref(st), null);
  mem.set('kc.dishLife.v1', '"str"');
  assert.equal(readDishLifePref(st), null);
  const broken = {
    getItem() {
      throw new Error('blocked');
    },
    setItem() {
      throw new Error('blocked');
    },
  };
  assert.equal(readDishLifePref(broken), null);
  assert.equal(writeDishLifePref(broken, { on: true, strength: 0.3 }), false);
  assert.equal(readDishLifePref(null), null);
  assert.equal(writeDishLifePref(null, { on: true, strength: 0.3 }), true, 'no storage: nothing to fail');
});

ok('wiring: the chip sits right after the undo/redo pair in the master bar', () => {
  const src = readFileSync(new URL('./MasterBar.jsx', import.meta.url), 'utf8');
  const redo = src.indexOf('history.redo');
  const chip = src.indexOf('<DishLifeChip />');
  assert.ok(redo > 0 && chip > redo, 'the chip follows the redo button');
  assert.ok(src.indexOf('<BudgetKnob />') < redo, 'and the budget knob still precedes the pair');
  assert.ok(src.slice(redo, chip).includes('</div>'), 'outside the undo group, not inside it');
});

console.log(`[selfcheck] dishLifeChip (#1923): ${n} cases passed`);
