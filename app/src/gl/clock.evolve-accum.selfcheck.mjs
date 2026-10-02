// #808 — loop-time interval accumulator: a freeze gap credits nothing,
// and a thaw fires at most once (no catch-up burst).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loopIntervalTick, loopClock } from './loopClock.js';

const INTERVAL = 2000;

test('#808 accumulator arms on first observed frame without firing', () => {
  const r = loopIntervalTick(-1, 1000, INTERVAL);
  assert.equal(r.fire, false);
  assert.equal(r.lastFire, 1000);
});

test('#808 accumulator fires on loop-time cadence', () => {
  let s = loopIntervalTick(-1, 1000, INTERVAL);
  assert.equal(s.fire, false);
  assert.equal(s.lastFire, 1000);
  s = loopIntervalTick(s.lastFire, 2999, INTERVAL);
  assert.equal(s.fire, false);
  s = loopIntervalTick(s.lastFire, 3000, INTERVAL);
  assert.equal(s.fire, true);
  assert.equal(s.lastFire, 3000);
});

test('#808 freeze gap credits nothing (wall dt is not an input)', () => {
  // Arm the accumulator AT the held clock, then hold it there while wall
  // time walks: hundreds of ticks, never a fire.
  let lastFire = loopIntervalTick(-1, 5000, INTERVAL).lastFire;
  for (let i = 0; i < 500; i++) {
    const r = loopIntervalTick(lastFire, 5000, INTERVAL);
    assert.equal(r.fire, false, `fired during freeze on tick ${i}`);
    lastFire = r.lastFire;
  }
  assert.equal(lastFire, 5000);
});

test('#808 thaw after a huge gap fires at most once', () => {
  // Frozen at 5000 (armed), loop jumps to 60000 on thaw.
  let s = loopIntervalTick(5000, 60000, INTERVAL);
  assert.equal(s.fire, true);
  assert.equal(s.lastFire, 60000);
  // The very next tick must NOT fire again — no catch-up burst.
  s = loopIntervalTick(s.lastFire, 60001, INTERVAL);
  assert.equal(s.fire, false);
  s = loopIntervalTick(s.lastFire, 61999, INTERVAL);
  assert.equal(s.fire, false);
  s = loopIntervalTick(s.lastFire, 62000, INTERVAL);
  assert.equal(s.fire, true);
});

test('#808 unknown clock never fires and never corrupts the anchor', () => {
  for (const bad of [0, -1, NaN, undefined, null, 'x']) {
    const r = loopIntervalTick(4000, bad, INTERVAL);
    assert.equal(r.fire, false);
    assert.equal(r.lastFire, 4000);
  }
});

test('#808 rolled-back clock re-arms instead of stalling', () => {
  const r = loopIntervalTick(9000, 100, INTERVAL);
  assert.equal(r.fire, false);
  assert.equal(r.lastFire, 100);
});

test('#808 invalid interval never fires', () => {
  for (const bad of [0, -5, NaN, undefined]) {
    const r = loopIntervalTick(1000, 5000, bad);
    assert.equal(r.fire, false);
    assert.equal(r.lastFire, 1000);
  }
});

test('#808 loopClock mirror starts unknown', () => {
  assert.equal(loopClock.ms, 0);
});

// --- slice-level: the stamp is loop time, never wall time ---

import { createDavisSlice } from '../state/slices/davisSlice.js';

function mockStore() {
  const box = { current: {} };
  const set = (updater) => {
    const partial = typeof updater === 'function' ? updater(box.current) : updater;
    box.current = { ...box.current, ...partial };
  };
  Object.assign(box.current, createDavisSlice(set));
  return box;
}

test('#808 triggerEvolve without loopTimeMs stamps the mirrored loop clock', () => {
  loopClock.ms = 5000;
  const box = mockStore();
  box.current.evolveTarget = 'seed';
  box.current.seed = 41;
  box.current.layoutParams = { mode: 'grid' };
  box.current.setEvolveMode(true);
  const wallBefore = Date.now();
  box.current.triggerEvolve({});
  assert.equal(box.current.lastEvolveTs, 5000);
  assert.ok(box.current.lastEvolveTs < wallBefore, 'stamp must not be wall time');
  assert.equal(box.current.evolveRun.lastTs, 5000);
});

test('#808 triggerEvolve prefers an explicit loopTimeMs', () => {
  loopClock.ms = 5000;
  const box = mockStore();
  box.current.evolveTarget = 'seed';
  box.current.seed = 41;
  box.current.layoutParams = { mode: 'grid' };
  box.current.setEvolveMode(true);
  box.current.triggerEvolve({ loopTimeMs: 7000 });
  assert.equal(box.current.lastEvolveTs, 7000);
});

test('#808 held loop clock: repeated evolves do not advance the stamp', () => {
  loopClock.ms = 9000;
  const box = mockStore();
  box.current.evolveTarget = 'seed';
  box.current.seed = 41;
  box.current.layoutParams = { mode: 'grid' };
  box.current.setEvolveMode(true);
  box.current.triggerEvolve({});
  box.current.triggerEvolve({});
  box.current.triggerEvolve({});
  assert.equal(box.current.lastEvolveTs, 9000);
  assert.equal(box.current.seed, 44); // evolves still land; the STAMP holds
});

test('#808 setEvolveMode starts/finishes runs on the loop clock', () => {
  loopClock.ms = 12000;
  const box = mockStore();
  box.current.setEvolveMode(true);
  assert.equal(box.current.evolveRun.startedTs, 12000);
  loopClock.ms = 15000;
  box.current.setEvolveMode(false);
  assert.equal(box.current.evolveLast.seconds, 3);
});
