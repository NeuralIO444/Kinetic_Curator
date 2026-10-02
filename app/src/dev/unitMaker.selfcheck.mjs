import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeUnit, UNIT_TRIO, pushUnitCheck } from './unitMaker.mjs';

test('units maker names the file and the issue', () => {
  const made = makeUnit({ issue: '722', name: 'behave ease' });
  assert.equal(made.file, 'src/behave-ease.selfcheck.mjs');
  assert.match(made.src, /#722 behave ease/);
  assert.equal(UNIT_TRIO.qa.length, 3);
  assert.equal(pushUnitCheck('probe', false, 'missing').ok, false);
});
