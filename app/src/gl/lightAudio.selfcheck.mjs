// lightAudio.selfcheck.mjs — #790 light.intensity: route output → sun intensity.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sanitizeLightAudio, applyLightAudio, LIGHT_AUDIO_MAX_MUL } from './lightAudio.mjs';

test('sanitizeLightAudio: finite sun units pass, clamped; garbage → 0', () => {
  assert.equal(sanitizeLightAudio(0.5), 0.5);
  assert.equal(sanitizeLightAudio(1), 1);
  assert.equal(sanitizeLightAudio(1.5), 1, 'clamped at +1');
  assert.equal(sanitizeLightAudio(-0.5), 0, 'never negative');
  assert.equal(sanitizeLightAudio(NaN), 0, 'NaN never poisons the sun');
  assert.equal(sanitizeLightAudio(Infinity), 0);
  assert.equal(sanitizeLightAudio(undefined), 0);
  assert.equal(sanitizeLightAudio('0.5'), 0, 'strings are not sun units');
});

test('applyLightAudio: output multiplies base intensity, capped at 2.5x', () => {
  assert.equal(LIGHT_AUDIO_MAX_MUL, 2.5);
  const c = { light: { intensity: 0.8 } };
  assert.equal(applyLightAudio(c, 1), 1);
  assert.equal(c.light.intensity, 2.0, 'full output = 2.5x base');
  const c2 = { light: { intensity: 0.8 } };
  applyLightAudio(c2, 0.5);
  assert.ok(Math.abs(c2.light.intensity - 0.8 * 1.75) < 1e-12, 'half output = 1.75x base');
});

test('applyLightAudio: zero / non-finite output leaves the contract bit-identical', () => {
  const c = { light: { intensity: 0.8, x: 220 } };
  const before = JSON.stringify(c);
  assert.equal(applyLightAudio(c, 0), 0);
  assert.equal(JSON.stringify(c), before, 'zero route is identity');
  assert.equal(applyLightAudio(c, NaN), 0);
  assert.equal(JSON.stringify(c), before, 'NaN route is identity');
});

test('applyLightAudio: absent light or bad base never throws, never conjures a sun', () => {
  assert.equal(applyLightAudio({}, 1), 0, 'no light key: untouched');
  assert.equal(applyLightAudio({ light: null }, 1), 0, 'sun off stays off');
  assert.equal(applyLightAudio(null, 1), 0, 'null contract never throws');
  const zero = { light: { intensity: 0 } };
  assert.equal(applyLightAudio(zero, 1), 1);
  assert.equal(zero.light.intensity, 0, 'zero base stays zero');
  const bad = { light: { intensity: 'hot' } };
  assert.equal(applyLightAudio(bad, 1), 0, 'non-numeric base untouched');
});
