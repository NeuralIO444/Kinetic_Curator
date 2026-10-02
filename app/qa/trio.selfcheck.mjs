import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import { TRIO, trioProblems } from './trio.mjs';

test('the iteration gate is 3 selfcheck, 3 playwright, 3 QA', () => {
  assert.deepEqual(trioProblems(TRIO), []);
  for (const file of [...TRIO.selfcheck, ...TRIO.playwright]) assert.equal(existsSync(file), true, file);
  for (const name of TRIO.qa) assert.equal(existsSync(`qa/scenarios/${name}.mjs`), true, name);
});
