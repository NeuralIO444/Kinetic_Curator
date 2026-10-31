import assert from 'node:assert/strict';
import { test } from 'node:test';
import { accumRecipeParams } from './accum.mjs';
import { getCostTier } from './costTiers.mjs';
import { isLeave } from './trailMode.mjs';

test('#560 Leave holds the stamps until its fade is raised', () => {
  const held = accumRecipeParams({ fade: 0.5, tunnel: 1, prism: 1, flow: 1, leave: true });
  assert.equal(held.leave, true);
  assert.equal(held.keep, 1);
  assert.ok(held.flowUv > 0);
  assert.equal(isLeave('nope'), false);
});

test('#560 accum still fades', () => {
  const today = accumRecipeParams({ fade: 0.5, leave: false });
  assert.equal(today.leave, false);
  assert.equal(today.keep, 0.5);
});

test('#560 Leave fade is optional', () => {
  assert.equal(accumRecipeParams({ leave: true, leaveFade: 0 }).keep, 1);
  // Re-pinned (was 0.8): the default fade 0.88 is the longer fade here, so
  // it wins the LEAVE composition — Matt ruling 2026-10-31, #1894.
  assert.equal(accumRecipeParams({ leave: true, leaveFade: 0.2 }).keep, 0.88);
  // When the trail fade is the longer one it still drives the keep alone.
  assert.equal(accumRecipeParams({ fade: 0.5, leave: true, leaveFade: 0.2 }).keep, 0.8);
  assert.equal(accumRecipeParams({ leave: false, leaveFade: 0.2 }).keep, 0.88);
});

test('#1894 LEAVE takes the longer fade — ACCUM FADE works in LEAVE', () => {
  // The recipe's `fade` input is the ACCUM FADE keep, 0.5^(1/frames)
  // (callers convert with halfLifeToKeep at the boundary).
  const keep12f = 0.5 ** (1 / 12); // ACCUM FADE 12f
  const keep34f = 0.5 ** (1 / 34); // ACCUM FADE 34f
  // ACCUM FADE longer than the trail fade: the 12-frame half-life wins
  // over trail fade 0.2 (keep 0.8, a ~3.1-frame half-life).
  assert.equal(accumRecipeParams({ fade: keep12f, leave: true, leaveFade: 0.2 }).keep, keep12f);
  // Dialing ACCUM FADE past the trail fade lengthens the hold: trail fade
  // 0.05 (keep 0.95) vs ACCUM FADE 34f.
  assert.equal(accumRecipeParams({ fade: keep34f, leave: true, leaveFade: 0.05 }).keep, keep34f);
  // Trail fade longer than ACCUM FADE: the trail fade wins — at Matt's
  // reported state (trail 0.05 ≈ 13.5f half-life vs ACCUM FADE 12f) the
  // composed keep is the trail fade's 0.95, unchanged.
  assert.equal(accumRecipeParams({ fade: keep12f, leave: true, leaveFade: 0.05 }).keep, 0.95);
  // The max() never shortens a hold: ACCUM FADE at its fastest (keep 0.5)
  // with TRAIL FADE 0 still holds at exactly 1.
  assert.equal(accumRecipeParams({ fade: 0.5, leave: true, leaveFade: 0 }).keep, 1);
});

test('#560 tunnel prism and flow can fade in Leave', () => {
  const full = accumRecipeParams({ leave: true, tunnel: 1, prism: 1, flow: 1 });
  const faded = accumRecipeParams({
    leave: true,
    tunnel: 1,
    prism: 1,
    flow: 1,
    leave: true,
    tunnelFade: 1,
    prismFade: 1,
    flowFade: 1,
  });
  assert.ok(full.tunnelZoom > 1);
  assert.equal(faded.tunnelZoom, 1);
  assert.equal(faded.prismUv, 0);
  assert.equal(faded.flowUv, 0);
  assert.ok(accumRecipeParams({ leave: false, tunnel: 1, tunnelFade: 1 }).tunnelZoom > 1);
});

test('#560 ribbon smears and comet fades the tail', () => {
  const ribbon = accumRecipeParams({ fade: 0.5, ribbon: true });
  const comet = accumRecipeParams({ fade: 0.9, comet: true });
  assert.equal(ribbon.ribbon, true);
  assert.ok(ribbon.keep >= 0.96);
  assert.ok(ribbon.flowUv > 0);
  assert.equal(comet.comet, true);
  assert.ok(comet.keep <= 0.72);
});

test('#560 LEAVE shed is named', () => {
  const shed = getCostTier('accum/leave');
  assert.equal(shed.tier, 1);
  assert.match(shed.notes, /CLEAR/);
  assert.ok(shed.memoryBytes > 0);
});
