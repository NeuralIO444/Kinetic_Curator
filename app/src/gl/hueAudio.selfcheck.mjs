// hueAudio.selfcheck.mjs — #790 color.hue: route output → layer hueRotate.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sanitizeHueAudio, applyHueAudio } from './hueAudio.mjs';

test('sanitizeHueAudio: finite degrees pass, clamped; garbage → 0', () => {
  assert.equal(sanitizeHueAudio(45), 45);
  assert.equal(sanitizeHueAudio(-90), -90);
  assert.equal(sanitizeHueAudio(200), 180, 'clamped at +180');
  assert.equal(sanitizeHueAudio(-200), -180, 'clamped at -180');
  assert.equal(sanitizeHueAudio(NaN), 0, 'NaN never poisons the hue matrix');
  assert.equal(sanitizeHueAudio(Infinity), 0);
  assert.equal(sanitizeHueAudio(undefined), 0);
  assert.equal(sanitizeHueAudio('45'), 0, 'strings are not degrees');
});

test('applyHueAudio: offset rides on top of each layer hueRotate', () => {
  const layers = [
    { layout: { hueRotate: 30 } },
    { layout: { hueRotate: 0 } },
    { layout: {} },
    {},
    null,
  ];
  assert.equal(applyHueAudio(layers, 45), 45);
  assert.equal(layers[0].layout.hueRotate, 75);
  assert.equal(layers[1].layout.hueRotate, 45);
  assert.equal(layers[2].layout.hueRotate, 45, 'missing hueRotate starts at 0');
  assert.equal(layers[3].layout, undefined, 'layout-less layer untouched');
});

test('applyHueAudio: zero / non-finite offset leaves layers bit-identical', () => {
  const layers = [{ layout: { hueRotate: 30 } }];
  const before = JSON.stringify(layers);
  assert.equal(applyHueAudio(layers, 0), 0);
  assert.equal(JSON.stringify(layers), before, 'zero route is identity');
  assert.equal(applyHueAudio(layers, NaN), 0);
  assert.equal(JSON.stringify(layers), before, 'NaN route is identity');
  assert.equal(applyHueAudio(null, 45), 0, 'null layers never throw');
});
