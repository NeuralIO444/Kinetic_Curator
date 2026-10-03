import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createNoise } from '../engine/noise.js';
import { buildFlowField, sampleFlowField } from './flowField.mjs';
import { mirrorFlowVec } from './accum.mjs';

test('FLOW field is the project seed, not a private hash', () => {
  const a = buildFlowField(createNoise(444));
  const b = buildFlowField(createNoise(445));
  assert.equal(a.seed, 444);
  assert.notEqual(a.data[0], b.data[0]);
  const again = buildFlowField(createNoise(444));
  assert.equal(again.data[0], a.data[0]);
  assert.equal(again.data[1], a.data[1]);
});

test('FLOW sample is finite and shared with the accum mirror', () => {
  const field = buildFlowField(createNoise(444));
  const [x, y] = sampleFlowField(field, 0.3, 0.7);
  assert.ok(Number.isFinite(x) && Number.isFinite(y));
  const mirrored = mirrorFlowVec(0.3, 0.7, field);
  assert.equal(mirrored[0], x);
  assert.equal(mirrored[1], y);
});

test('FLOW without a field keeps the legacy hash', () => {
  const v = mirrorFlowVec(0.3, 0.7);
  assert.ok(Number.isFinite(v[0]) && Number.isFinite(v[1]));
  assert.notEqual(v[0], mirrorFlowVec(0.3, 0.7, buildFlowField(createNoise(444)))[0]);
});
