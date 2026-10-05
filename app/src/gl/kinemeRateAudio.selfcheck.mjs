// kinemeRateAudio.selfcheck.mjs — #790 clock.kinemeRate: route output → kineme clock rate multiplier.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sanitizeKinemeRateAudio, applyKinemeRateAudio } from './kinemeRateAudio.mjs';

test('sanitizeKinemeRateAudio: 0/undefined/non-finite → 1 (today\'s rate exactly)', () => {
  assert.equal(sanitizeKinemeRateAudio(0), 1, 'silence relaxes to base rate, never stalls');
  assert.equal(sanitizeKinemeRateAudio(undefined), 1, 'no route → identity');
  assert.equal(sanitizeKinemeRateAudio(null), 1);
  assert.equal(sanitizeKinemeRateAudio(NaN), 1, 'NaN never poisons the anchored clock');
  assert.equal(sanitizeKinemeRateAudio(Infinity), 1);
  assert.equal(sanitizeKinemeRateAudio('2'), 1, 'strings are not rates');
});

test('sanitizeKinemeRateAudio: live values pass, clamped to [0.1, 4]', () => {
  assert.equal(sanitizeKinemeRateAudio(1), 1);
  assert.equal(sanitizeKinemeRateAudio(2.5), 2.5);
  assert.equal(sanitizeKinemeRateAudio(0.5), 0.5, 'quiet audio can drag below 1x');
  assert.equal(sanitizeKinemeRateAudio(0.05), 0.1, 'floored at 0.1x, never 0');
  assert.equal(sanitizeKinemeRateAudio(-3), 0.1, 'negative depths floor, never reverse');
  assert.equal(sanitizeKinemeRateAudio(9), 4, 'capped at 4x');
});

test('applyKinemeRateAudio: multiplier rides on top of the base rate', () => {
  assert.equal(applyKinemeRateAudio(1.5, 2), 3, 'base 1.5 × audio 2x');
  assert.equal(applyKinemeRateAudio(1.5, 0.5), 0.75, 'slower is allowed');
  assert.equal(applyKinemeRateAudio(2, undefined), 2, 'no route → base untouched');
  assert.equal(applyKinemeRateAudio(2, 0), 2, 'silence → base untouched');
  assert.equal(applyKinemeRateAudio(2, NaN), 2, 'garbage → base untouched');
});

test('applyKinemeRateAudio: base rate itself is sanitized, never non-finite', () => {
  assert.equal(applyKinemeRateAudio(0, 2), 0, 'a zero base stays zero (user\'s slider, clock freezes honestly)');
  assert.equal(applyKinemeRateAudio(NaN, 2), 2, 'garbage base → 1 × mult');
  assert.equal(applyKinemeRateAudio(-1, 2), 0, 'negative base clamps at 0');
  const r = applyKinemeRateAudio(1, 3);
  assert.ok(Number.isFinite(r), 'output always finite');
});
