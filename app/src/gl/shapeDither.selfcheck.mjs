import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shapeRadius } from './shapeDither.mjs';

test('#706 a dark cell is a big shape and a light cell is absent', () => {
  assert.ok(shapeRadius(0, 12) > shapeRadius(0.5, 12));
  assert.equal(shapeRadius(1, 12), 0);
  assert.equal(shapeRadius(0, 12), 6);
});
