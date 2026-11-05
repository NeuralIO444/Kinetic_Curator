// dishLifeTouchDom.selfcheck.mjs — DISH LIFE slice 3c (#1923): hands on the instrument reach the idle clock.
//
//   A bus     one slot, latest wins, consumed once; unknown sources ignored; clear drops it
//   B dom     pointer / touch / wheel / key listeners are passive + capture, reach the bus, and are removed on dispose
//   C inert   a missing window installs nothing and never throws
import assert from 'node:assert/strict';
import { noteTouch, consumeTouch, clearTouch } from '../engine/dishLifeTouch.mjs';
import { installDishLifeTouch } from './dishLifeTouchDom.mjs';

// ---- A
clearTouch();
assert.equal(consumeTouch(), null, 'nothing pending at start');
assert.equal(noteTouch('midi'), true);
assert.deepEqual(consumeTouch(), { source: 'midi', level: 1 });
assert.equal(consumeTouch(), null, 'consumed once');
noteTouch('pointer');
noteTouch('key');
assert.equal(consumeTouch().source, 'key', 'one slot: the latest touch wins');
assert.equal(noteTouch('wheel'), false, 'unknown sources are ignored');
assert.equal(consumeTouch(), null);
noteTouch('audio', 0.6);
assert.deepEqual(consumeTouch(), { source: 'audio', level: 0.6 }, 'audio carries its level');
noteTouch('audio', 'junk');
assert.equal(consumeTouch().level, 1, 'a junk level becomes a full touch, never NaN');
noteTouch('pointer');
clearTouch();
assert.equal(consumeTouch(), null, 'clear drops a pending touch');

// ---- B
{
  const reg = [];
  const win = {
    addEventListener: (t, f, o) => reg.push({ t, f, o }),
    removeEventListener: (t, f, o) => {
      const i = reg.findIndex((r) => r.t === t && r.f === f && r.o === o);
      assert.ok(i >= 0, `removed ${t} with the same handler and options it was added with`);
      reg.splice(i, 1);
    },
  };
  const dispose = installDishLifeTouch(win);
  assert.deepEqual(reg.map((r) => r.t).sort(), ['keydown', 'pointerdown', 'pointermove', 'touchstart', 'wheel']);
  for (const r of reg)
    assert.deepEqual(
      r.o,
      { capture: true, passive: true },
      `${r.t} is passive + capture (never blocks a panel, counts even if it stops propagation)`,
    );
  for (const t of ['pointerdown', 'pointermove', 'wheel', 'touchstart']) {
    clearTouch();
    reg.find((r) => r.t === t).f({});
    assert.equal(consumeTouch().source, 'pointer', `${t} is a pointer touch`);
  }
  clearTouch();
  reg.find((r) => r.t === 'keydown').f({});
  assert.equal(consumeTouch().source, 'key');
  dispose();
  assert.equal(reg.length, 0, 'dispose removes every listener');
}

// ---- C
for (const w of [null, undefined, {}, { addEventListener: 5 }]) {
  const d = installDishLifeTouch(w);
  assert.equal(typeof d, 'function');
  d();
}
console.log('dishLifeTouchDom.selfcheck: ok');
