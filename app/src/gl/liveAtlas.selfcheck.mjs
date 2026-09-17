/**
 * liveAtlas.selfcheck.mjs — node selfcheck for the browser atlas constants (#224).
 *
 * The rasterizers need DOM (Image/2D canvas) and are exercised in the
 * browser e2e instead; here we pin the geometry/key contract against the
 * offline bake so the two never drift apart.
 *
 * Run: node --test src/gl/liveAtlas.selfcheck.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIVE_CELL_PX, LIVE_CELL_UNITS, comboKey } from './liveAtlas.mjs';
import { CELL_PX, comboKey as nodeComboKey } from './atlas.mjs';

test('live atlas cell geometry matches the offline bake', () => {
  assert.equal(LIVE_CELL_PX, CELL_PX);
  // Asset-unit span of one cell (the QUAD_VS transform hardcodes this).
  assert.deepEqual({ ...LIVE_CELL_UNITS }, { x0: -50, y0: -50, x1: 150, y1: 150 });
});

test('live comboKey is byte-identical to the offline comboKey', () => {
  const args = ['moth', '#0a0a0a', '#f5f1e8'];
  assert.equal(comboKey(...args), nodeComboKey(...args));
  assert.equal(comboKey('a', 'b', 'c'), 'a|b|c');
});
