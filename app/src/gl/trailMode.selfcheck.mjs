import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveTrail, trailUsesAccumRecipe } from './trailMode.mjs';

test('#560 unknown trail fails closed to accum', () => {
  assert.equal(resolveTrail(undefined), 'accum');
  assert.equal(resolveTrail('nope'), 'accum');
  assert.equal(resolveTrail('leave'), 'leave');
});

test('#560 echo is today, leave is not the accum recipe yet', () => {
  assert.equal(trailUsesAccumRecipe('echo'), true);
  assert.equal(trailUsesAccumRecipe('accum'), true);
  assert.equal(trailUsesAccumRecipe('leave'), false);
  assert.equal(trailUsesAccumRecipe('ribbon'), false);
  assert.equal(trailUsesAccumRecipe('comet'), false);
});
