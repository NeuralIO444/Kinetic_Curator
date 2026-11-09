// dishFluidMagnets.selfcheck.mjs — FERROFLUID (#1997): the magnet stage gesture
// (gl/dishFluidMagnetsDom.mjs) against a fake canvas + store.
//
//   A geometry  the hit test is aspect-corrected and takes the NEAREST magnet in reach
//   B acts      press places + holds, drag moves, alt-press removes — through the store's
//               actions only, and only while the chip's arm is on and the mode is on
//   C manners   a disarmed press is not consumed (the canvas's standing gestures keep it);
//               an armed press on the canvas IS consumed (stopPropagation), so the stage's
//               own press consumers never also fire
import assert from 'node:assert/strict';
import { installDishFluidMagnets, magnetHitIndex, magnetDistance, MAGNET_HIT } from './dishFluidMagnetsDom.mjs';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

ok('hit geometry: nearest in reach, aspect-corrected', () => {
  const mags = [
    { x: 0.2, y: 0.5 },
    { x: 0.8, y: 0.5 },
  ];
  assert.equal(magnetHitIndex(mags, { x: 0.21, y: 0.5 }, 0.7), 0);
  assert.equal(magnetHitIndex(mags, { x: 0.79, y: 0.5 }, 0.7), 1);
  assert.equal(magnetHitIndex(mags, { x: 0.5, y: 0.5 }, 0.7), -1, 'the middle of the dish holds nothing');
  assert.equal(magnetHitIndex([], { x: 0.2, y: 0.5 }, 0.7), -1);
  // a press MAGNET_HIT below a magnet in dish-y is FARTHER in corrected space on a wide canvas
  assert.ok(magnetDistance({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 + MAGNET_HIT }, 0.7) < MAGNET_HIT);
  assert.ok(Math.abs(magnetDistance({ x: 0.5, y: 0.5 }, { x: 0.5 + MAGNET_HIT, y: 0.5 }, 0.7) - MAGNET_HIT) < 1e-12);
});

/** A fake canvas (1000×700 at 0,0) + a fake store state with recording actions. */
function fakeRig({ armed = true, on = true, magnets = [] } = {}) {
  const listeners = new Map();
  const calls = [];
  const state = {
    dishFluidMagnetArm: armed,
    dishFluid: on,
    dishFluidMagnets: magnets.map((m) => ({ ...m })),
    placeDishFluidMagnet: (x, y) => {
      calls.push(['place', x, y]);
      state.dishFluidMagnets = [...state.dishFluidMagnets, { x, y }];
    },
    moveDishFluidMagnet: (i, x, y) => {
      calls.push(['move', i, x, y]);
      state.dishFluidMagnets[i] = { x, y };
    },
    removeDishFluidMagnet: (i) => {
      calls.push(['remove', i]);
      state.dishFluidMagnets = state.dishFluidMagnets.filter((_, j) => j !== i);
    },
  };
  const canvas = {
    addEventListener: (t, fn) => listeners.set(t, fn),
    removeEventListener: (t) => listeners.delete(t),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 700 }),
  };
  const fire = (e) => {
    let stopped = false;
    listeners.get('pointerdown')?.({
      target: canvas,
      clientX: e.x * 1000,
      clientY: e.y * 700,
      altKey: !!e.alt,
      stopPropagation: () => {
        stopped = true;
      },
      preventDefault: () => {},
    });
    return stopped;
  };
  return { canvas, state, calls, fire, getState: () => state };
}

ok('press places, and the press is consumed only while armed', () => {
  const rig = fakeRig();
  const dispose = installDishFluidMagnets(rig.canvas, rig.getState);
  assert.equal(rig.fire({ x: 0.3, y: 0.4 }), true, 'an armed press on the dish is consumed');
  assert.deepEqual(rig.calls, [['place', 0.3, 0.4]]);
  dispose();
  const cold = fakeRig({ armed: false });
  installDishFluidMagnets(cold.canvas, cold.getState);
  assert.equal(cold.fire({ x: 0.3, y: 0.4 }), false, 'disarmed: the press belongs to the stage');
  assert.deepEqual(cold.calls, []);
  const off = fakeRig({ on: false });
  installDishFluidMagnets(off.canvas, off.getState);
  assert.equal(off.fire({ x: 0.3, y: 0.4 }), false, 'mode off: nothing is placed');
  assert.deepEqual(off.calls, []);
});

ok('alt-press removes the magnet it lands on; a miss removes nothing', () => {
  const rig = fakeRig({ magnets: [{ x: 0.5, y: 0.5 }] });
  installDishFluidMagnets(rig.canvas, rig.getState);
  assert.equal(rig.fire({ x: 0.1, y: 0.1, alt: true }), false, 'an alt-press on empty dish is not consumed');
  assert.deepEqual(rig.calls, []);
  assert.equal(rig.fire({ x: 0.5, y: 0.5, alt: true }), true);
  assert.deepEqual(rig.calls, [['remove', 0]]);
  assert.equal(rig.state.dishFluidMagnets.length, 0);
});

ok('a full dish places nothing more', () => {
  const full = Array.from({ length: 8 }, (_, i) => ({ x: i / 10, y: 0.9 }));
  const rig = fakeRig({ magnets: full });
  installDishFluidMagnets(rig.canvas, rig.getState);
  assert.equal(rig.fire({ x: 0.55, y: 0.2 }), false, 'no ninth magnet, press not consumed');
  assert.deepEqual(rig.calls, []);
});

console.log(`dishFluidMagnets.selfcheck: ok (${n} groups)`);
