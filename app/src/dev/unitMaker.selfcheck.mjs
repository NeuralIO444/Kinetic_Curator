import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeUnit, UNIT_TRIO } from './unitMaker.mjs';

test('units maker fails closed until the behavior is filled', () => {
  const made = makeUnit({ issue: '722', name: 'behave ease' });
  assert.equal(made.file, 'src/behave-ease.selfcheck.mjs');
  assert.match(made.src, /assert\.fail/);
  assert.doesNotMatch(made.src, /assert\.equal\(true, true\)/);
  assert.equal(UNIT_TRIO.selfcheck.length, 3);
});
