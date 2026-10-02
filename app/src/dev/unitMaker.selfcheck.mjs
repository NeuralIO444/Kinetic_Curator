import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeUnit, UNIT_TRIO } from './unitMaker.mjs';

test('units maker writes a #issue selfcheck stub', () => {
  const src = makeUnit({ issue: '722', name: 'behave ease' });
  assert.match(src, /#722 behave ease/);
  assert.match(src, /node:test/);
  assert.equal(UNIT_TRIO.playwright.length, 3);
});
