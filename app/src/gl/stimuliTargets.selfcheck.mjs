import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluateRoutes, ROUTE_TARGETS } from './audioRoutes.mjs';

test('#803 silence is zero and a loud hit stays clamped', () => {
  const quiet = evaluateRoutes({ beatPulse: 0 }, { depth: 1, scaleMod: 1, alphaMod: 1 }, [
    { input: 'beat', target: 'render.hue', depth: 90 },
    { input: 'beat', target: 'render.sun', depth: 1 },
  ]);
  assert.equal(quiet.hue, 0);
  assert.equal(quiet.sun, 0);
  const loud = evaluateRoutes({ beatPulse: 9 }, { depth: 1, scaleMod: 1, alphaMod: 1 }, [
    { input: 'beat', target: 'render.hue', depth: 90 },
    { input: 'beat', target: 'render.accum', depth: 20 },
  ]);
  assert.equal(loud.hue, 180);
  assert.equal(loud.accum, 40);
  assert.ok(ROUTE_TARGETS['render.kinemeRate']);
});
