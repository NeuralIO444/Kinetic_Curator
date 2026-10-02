import assert from 'node:assert/strict';
import { test } from 'node:test';
import { accumRecipeParams } from './accum.mjs';
import { isLeave } from './trailMode.mjs';

test('#560 Leave holds the stamps until its fade is raised', () => {
  const held = accumRecipeParams({ fade: 0.5, tunnel: 1, prism: 1, flow: 1, trail: 'leave' });
  assert.equal(held.leave, true);
  assert.equal(held.keep, 1);
  assert.ok(held.flowUv > 0);
  assert.equal(isLeave('nope'), false);
});

test('#560 accum still fades', () => {
  const today = accumRecipeParams({ fade: 0.5, trail: 'accum' });
  assert.equal(today.leave, false);
  assert.equal(today.keep, 0.5);
});

test('#560 Leave fade is optional', () => {
  assert.equal(accumRecipeParams({ trail: 'leave', leaveFade: 0 }).keep, 1);
  assert.equal(accumRecipeParams({ trail: 'leave', leaveFade: 0.2 }).keep, 0.8);
  assert.equal(accumRecipeParams({ trail: 'accum', leaveFade: 0.2 }).keep, 0.88);
});

test('#560 tunnel prism and flow can fade in Leave', () => {
  const full = accumRecipeParams({ trail: 'leave', tunnel: 1, prism: 1, flow: 1 });
  const faded = accumRecipeParams({ trail: 'leave', tunnel: 1, prism: 1, flow: 1, tunnelFade: 1, prismFade: 1, flowFade: 1 });
  assert.ok(full.tunnelZoom > 1);
  assert.equal(faded.tunnelZoom, 1);
  assert.equal(faded.prismUv, 0);
  assert.equal(faded.flowUv, 0);
  assert.ok(accumRecipeParams({ trail: 'accum', tunnel: 1, tunnelFade: 1 }).tunnelZoom > 1);
});

test('#560 ribbon smears and comet fades the tail', () => {
  const ribbon = accumRecipeParams({ fade: 0.5, trail: 'ribbon' });
  const comet = accumRecipeParams({ fade: 0.9, trail: 'comet' });
  assert.equal(ribbon.ribbon, true);
  assert.ok(ribbon.keep >= 0.96);
  assert.ok(ribbon.flowUv > 0);
  assert.equal(comet.comet, true);
  assert.ok(comet.keep <= 0.72);
});
