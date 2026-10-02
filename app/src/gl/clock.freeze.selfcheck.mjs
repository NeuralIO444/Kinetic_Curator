// #823 — governor freeze holds the loop clock.
//
// A cut6 / watchdog freeze (slowRender) must hold #806 loop time so nothing
// lump-sums on thaw. liveLoop.mjs and renderWorker.js roll the tick's clock
// advance back on freeze frames (the same shape as the paused rollback);
// EVOLVE (#808) tears its trigger down under slowRender and re-arms on
// thaw; the ACCUM step is skipped while frozen. Warp's own pin is covered
// by #474's test in liveResolve.selfcheck.mjs.
//
// The tick loops need WebGL, so the wiring is pinned statically (the
// clock.inventory pattern) and the thaw guarantee is proven behaviorally
// against the real loopIntervalTick accumulator and the real kineme clock.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { loopIntervalTick } from './loopClock.js';
import { createKinemeClock } from '../data/kinemes.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = join(HERE, '..', '..');
const read = (rel) => readFileSync(join(APP, rel), 'utf8');

test('#823 liveLoop tick rolls the clock advance back on a governor freeze', () => {
  const src = read('src/gl/liveLoop.mjs');
  assert.match(src, /#823/, 'the freeze-hold must be marked #823');
  assert.match(
    src,
    /if \(getState\(\)\.slowRender\) \{\s*\n\s*loopTimeMs -= clampedDtMs;\s*\n\s*\}/,
    'slowRender must roll back the tick\'s loopTimeMs advance like the paused path',
  );
});

test('#823 renderWorker holds the loop clock on freeze / pause', () => {
  const src = read('src/gl/renderWorker.js');
  assert.match(src, /#823/, 'the freeze-hold must be marked #823');
  assert.match(
    src,
    /if \(s\.running === false \|\| s\.slowRender\) loopTimeMs -= dtMs;/,
    'the worker tick must roll back its loopTimeMs advance when frozen or paused',
  );
});

test('#823 EVOLVE time trigger tears down under slowRender (no freeze fires)', () => {
  const src = read('src/App.jsx');
  assert.match(
    src,
    /\|\| state\.slowRender \|\| state\.batchPaused\) return;/,
    'the EVOLVE interval effect must early-return while slowRender holds',
  );
});

test('#823 ACCUM step is skipped while frozen (fade cannot lump-sum)', () => {
  const src = read('src/gl/liveLoop.mjs');
  assert.match(
    src,
    /FREEZE: hold the feedback image, skip render \+ step\./,
    'a frozen ACCUM frame must hold the feedback image without stepping the fade',
  );
});

test('#823 tape: one shared budget — no second copy to lie', () => {
  // The issue says "tape copy audit only if a FULL state still lies": both
  // the PLAY readout pill and the track/FX arm gate must read the exact
  // same implementation.
  const pill = read('src/components/TapeCounter.jsx');
  const gate = read('src/state/slices/layersSlice.js');
  assert.match(pill, /from '\.\.\/state\/tapeBudget\.js'/);
  assert.match(gate, /from '\.\.\/tapeBudget\.js'/);
});

test('#823 held clock: freeze ticks credit nothing, thaw fires at most once', () => {
  const INTERVAL = 2000;
  const TICK = 16.667;
  let lastFire = -1;
  let fires = 0;
  let clock = 0;
  const tick = (advanceMs) => {
    clock += advanceMs;
    const step = loopIntervalTick(lastFire, clock, INTERVAL);
    lastFire = step.lastFire;
    if (step.fire) fires += 1;
  };

  for (let i = 0; i < 130; i++) tick(TICK); // ~2167ms live: 1 fire expected
  assert.equal(fires, 1, 'one interval fire before the freeze');
  const frozenAt = clock;

  // The #823 guarantee: freeze ticks net ZERO clock advance.
  for (let i = 0; i < 360; i++) tick(0); // ~6s of wall time, clock held
  assert.equal(clock, frozenAt, 'the loop clock must not walk during the freeze');
  assert.equal(fires, 1, 'no interval fires while the clock is held');

  // Thaw: the accumulator resumes from the held value — the next fire is
  // one honest interval later, never a catch-up burst for the frozen span.
  for (let i = 0; i < 130; i++) tick(TICK);
  assert.equal(fires, 2, 'thaw resumes the cadence: exactly one more fire, no burst');
});

test('#823 kineme: a held clock keeps motion time continuous across a freeze', () => {
  const kc = createKinemeClock();
  kc.at(0, 1);
  const before = kc.at(2, 1);
  assert.ok(Math.abs(before - 2) < 1e-9);

  // Freeze with the clock HELD (the #823 behavior): motion time does not move.
  const held = kc.at(2, 1);
  assert.equal(held, before, 'held loop time holds motion time');

  // Thaw resumes from the held value — the 6 frozen seconds are simply
  // absent from motion time, not credited as a jump.
  const after = kc.at(2.167, 1);
  assert.ok(Math.abs(after - before - 0.167) < 1e-9, 'thaw continues, not jumps');
});
