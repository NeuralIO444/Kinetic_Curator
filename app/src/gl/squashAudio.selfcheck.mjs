// squashAudio.selfcheck.mjs — #790 render.squash: route output rides the layout squash.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sanitizeSquashAudio, squashWithAudio } from './squashAudio.mjs';
import { buildSceneContract } from './sceneContract.js';

test('sanitizeSquashAudio: finite passes, clamped to [0,1]; garbage → 0', () => {
  assert.equal(sanitizeSquashAudio(0.5), 0.5);
  assert.equal(sanitizeSquashAudio(0), 0);
  assert.equal(sanitizeSquashAudio(1), 1);
  assert.equal(sanitizeSquashAudio(1.5), 1, 'clamped at +1');
  assert.equal(sanitizeSquashAudio(-0.5), 0, 'clamped at 0');
  assert.equal(sanitizeSquashAudio(NaN), 0, 'NaN never poisons the smear shader');
  assert.equal(sanitizeSquashAudio(Infinity), 0);
  assert.equal(sanitizeSquashAudio(undefined), 0);
  assert.equal(sanitizeSquashAudio('0.5'), 0, 'strings are not squash');
});

test('squashWithAudio: audio rides on top of the layout squash, ceiling 1', () => {
  assert.equal(squashWithAudio(0.3, 0), 0.3, 'zero audio is identity');
  assert.equal(squashWithAudio(0, 0.4), 0.4, 'audio-only ride');
  assert.equal(squashWithAudio(0.3, 0.4), 0.7, 'ride adds to the layout dial');
  assert.equal(squashWithAudio(0.7, 0.5), 1, 'sum clamped at the shader ceiling');
  assert.equal(squashWithAudio(undefined, 0), 0, 'missing layout squash → 0');
  assert.equal(squashWithAudio(0.3, NaN), 0.3, 'NaN audio leaves the layout dial alone');
  assert.equal(squashWithAudio(NaN, 0.4), 0.4, 'NaN layout never poisons the ride');
});

test('contract: audio 0 keeps the squash key omitted (bit-identical default)', () => {
  const doc = (squash) => ({ seed: 1, squash });
  const c0 = buildSceneContract({ doc: doc(squashWithAudio(undefined, 0)), resolvedLayers: [] });
  assert.ok(!('squash' in c0), 'no route → no key → hashes never move');
  const c1 = buildSceneContract({ doc: doc(squashWithAudio(0, 0.5)), resolvedLayers: [] });
  assert.strictEqual(c1.squash, 0.5, 'audio-only squash lands on the contract');
  const c2 = buildSceneContract({ doc: doc(squashWithAudio(0.6, 0.6)), resolvedLayers: [] });
  assert.strictEqual(c2.squash, 1, 'layout + loud audio clamps at the ceiling');
});
