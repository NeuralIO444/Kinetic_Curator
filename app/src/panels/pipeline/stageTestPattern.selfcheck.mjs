// stageTestPattern.selfcheck.mjs — #607 STAGE Phase B test pattern layout.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TEST_PATTERN_BARS, TEST_PATTERN_GRAYSCALE, testPatternLayout } from './stageTestPattern.mjs';

test('#607 test pattern: seven bars span the full width', () => {
  const { bars, strip } = testPatternLayout(1920, 1080);
  assert.equal(bars.length, 7);
  assert.equal(TEST_PATTERN_BARS.length, 7);
  const totalW = bars.reduce((a, b) => a + b.w, 0);
  assert.ok(totalW >= 1920, 'bars cover the width');
  assert.ok(bars.every((b) => b.h === Math.floor(1080 * 0.67)), 'uniform bar height');
  assert.deepEqual(bars.map((b) => b.color), TEST_PATTERN_BARS);
});

test('#607 test pattern: grayscale strip fills the bottom', () => {
  const { strip } = testPatternLayout(1920, 1080);
  assert.equal(strip.length, TEST_PATTERN_GRAYSCALE.length);
  assert.ok(strip.every((s) => s.y === Math.floor(1080 * 0.67)), 'strip starts where bars end');
  assert.ok(strip.every((s) => s.y + s.h === 1080), 'strip reaches the bottom edge');
});

test('#607 test pattern: portrait canvas still lays out', () => {
  const { bars, strip } = testPatternLayout(1080, 1920);
  assert.equal(bars.length, 7);
  const totalW = bars.reduce((a, b) => a + b.w, 0);
  assert.ok(totalW >= 1080);
  assert.ok(strip.every((s) => s.y + s.h === 1920));
});

test('#607 test pattern: degenerate sizes collapse, never throw', () => {
  assert.deepEqual(testPatternLayout(0, 0), { bars: [], strip: [] });
  assert.deepEqual(testPatternLayout(-5, 100), { bars: [], strip: [] });
});
