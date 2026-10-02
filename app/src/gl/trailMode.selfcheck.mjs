import assert from 'node:assert/strict';
import { test } from 'node:test';
import { accumRecipeParams } from './accum.mjs';
import { isLeave } from './trailMode.mjs';

test('#560 Leave holds: no fade, no tunnel, no flow', () => {
  const held = accumRecipeParams({ fade: 0.5, tunnel: 1, prism: 1, flow: 1, trail: 'leave' });
  assert.equal(held.leave, true);
  assert.equal(held.keep, 1);
  assert.equal(held.flowUv, 0);
  assert.equal(held.tunnelZoom, 1);
  assert.equal(held.prismUv, 0);
  assert.equal(isLeave('nope'), false);
});

test('#560 accum still fades', () => {
  const today = accumRecipeParams({ fade: 0.5, trail: 'accum' });
  assert.equal(today.leave, false);
  assert.equal(today.keep, 0.5);
});
