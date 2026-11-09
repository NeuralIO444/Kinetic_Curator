// dishFluidChip.selfcheck.mjs — FERROFLUID chip (#1997): the model behind FerroFluidChip.jsx.
//
// Pins the chip's state machine (the dish family's posture: off / arming / on / slowed / held,
// the shed reading off the governor's rung like the DISH LIFE glider's), the help id per
// state, and the performer's preference round-trip (kc.dishFluid.v1) — garbled storage reads
// as the defaults, field by field, and saving never throws.
import assert from 'node:assert/strict';
import {
  ferroChipState,
  ferroStateWord,
  FERRO_HELP,
  FERRO_PREF_KEY,
  FERRO_PREF_DEFAULTS,
  sanitizeFerroPref,
  loadFerroPref,
  saveFerroPref,
} from './dishFluidChip.model.mjs';
import { HELP_TOPICS } from '../data/helpCopy.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

ok('the state machine follows the family posture', () => {
  assert.equal(ferroChipState({ on: false, arming: true, shed: 0 }), 'off', 'off wins over the arm');
  assert.equal(ferroChipState({ on: true, arming: true, shed: 0 }), 'arming');
  assert.equal(ferroChipState({ on: true, arming: false, shed: 0 }), 'on');
  assert.equal(ferroChipState({ on: true, arming: false, shed: 1 }), 'slowed');
  assert.equal(ferroChipState({ on: true, arming: false, shed: 6 }), 'slowed', 'coarsening rungs still read slowed');
  assert.equal(ferroChipState({ on: true, arming: false, shed: 8 }), 'slowed', 'thinning rungs still read slowed');
  assert.equal(ferroChipState({ on: true, arming: false, shed: 9 }), 'held', 'only the ladder’s last rung reads held');
  assert.equal(ferroStateWord('held'), 'held');
  assert.equal(ferroStateWord('arming'), 'placing magnets');
});

ok('every state and dial has a real help entry', () => {
  const ids = new Set(HELP_TOPICS.map((h) => h.id));
  for (const id of Object.values(FERRO_HELP)) assert.ok(ids.has(id), `help entry ${id} exists`);
  for (const id of ['ferro-flow', 'ferro-pull', 'ferro-couple', 'ferro-magnets'])
    assert.ok(ids.has(id), `help entry ${id} exists`);
});

ok('the preference sanitizes field by field and round-trips', () => {
  assert.deepEqual(sanitizeFerroPref(null), { ...FERRO_PREF_DEFAULTS });
  assert.deepEqual(sanitizeFerroPref('junk'), { ...FERRO_PREF_DEFAULTS });
  assert.deepEqual(sanitizeFerroPref({ on: true, flow: 2, pull: -1, couple: 0.25 }), {
    on: true,
    flow: 1,
    pull: 0,
    couple: 0.25,
  });
  assert.equal(FERRO_PREF_KEY, 'kc.dishFluid.v1');
  const store = new Map();
  const storage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
  };
  saveFerroPref(storage, { on: true, flow: 0.1, pull: 0.9, couple: 0.4 });
  assert.deepEqual(loadFerroPref(storage), { on: true, flow: 0.1, pull: 0.9, couple: 0.4 });
  store.set(FERRO_PREF_KEY, '{broken');
  assert.deepEqual(loadFerroPref(storage), { ...FERRO_PREF_DEFAULTS }, 'garbled storage reads as defaults');
  assert.deepEqual(loadFerroPref(null), { ...FERRO_PREF_DEFAULTS }, 'no storage reads as defaults');
  saveFerroPref(null, { on: true }); // never throws
});

ok('the store carries the mode, the dials, the magnets and the arm', async () => {
  const { useStore } = await import('../state/store.js');
  const s = useStore.getState();
  assert.equal(s.dishFluid, false);
  assert.deepEqual([s.dishFluidFlow, s.dishFluidPull, s.dishFluidCouple], [0.5, 0.7, 0.5]);
  s.setDishFluidFlow(2);
  assert.equal(useStore.getState().dishFluidFlow, 1, 'dials clamp');
  s.placeDishFluidMagnet(0.5, 0.5);
  s.placeDishFluidMagnet(1.4, -0.2);
  assert.deepEqual(useStore.getState().dishFluidMagnets, [
    { x: 0.5, y: 0.5 },
    { x: 1, y: 0 },
  ]);
  s.moveDishFluidMagnet(0, 0.25, 0.75);
  assert.deepEqual(useStore.getState().dishFluidMagnets[0], { x: 0.25, y: 0.75 });
  s.removeDishFluidMagnet(1);
  assert.equal(useStore.getState().dishFluidMagnets.length, 1);
  for (let i = 0; i < 10; i++) s.placeDishFluidMagnet(0.1, 0.1);
  assert.equal(useStore.getState().dishFluidMagnets.length, 8, 'the kernel cap holds at the store');
  s.setDishFluidMagnetArm(true);
  assert.equal(useStore.getState().dishFluidMagnetArm, true);
  // reset for any later suite sharing this process state
  s.setDishFluidMagnets([]);
  s.setDishFluidMagnetArm(false);
  s.setDishFluidFlow(0.5);
});

console.log(`dishFluidChip.selfcheck: ok (${n} groups)`);
