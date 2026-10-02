import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { blendBehave } from './behaveEase.mjs';
import { BEHAVE } from './behave.js';

const DIR = dirname(fileURLToPath(import.meta.url));

test('#722 behave weights ease and land', () => {
  const mid = blendBehave(BEHAVE.cruise, BEHAVE.flock, 0.5);
  assert.ok(mid.coh > BEHAVE.cruise.coh && mid.coh < BEHAVE.flock.coh);
  assert.equal(blendBehave(BEHAVE.cruise, BEHAVE.flock, 1).coh, BEHAVE.flock.coh);
  assert.equal(blendBehave(BEHAVE.cruise, BEHAVE.flock, 0).coh, BEHAVE.cruise.coh);
});

test('#722 behave is not a dissolve trigger', () => {
  const src = readFileSync(join(DIR, '../../gl/paletteMix.mjs'), 'utf8');
  assert.doesNotMatch(src, /behave !== seen\.behave/);
});
