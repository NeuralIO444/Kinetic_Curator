// #809 — renderWorker ballistics take milliseconds.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const SRC = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'renderWorker.js'), 'utf8');

test('#809 worker computes both dtMs and dtSec', () => {
  assert.match(SRC, /const dtMs = /);
  assert.match(SRC, /const dtSec = dtMs \/ 1000/);
});

test('#809 ballistics get dtMs, resolver gets dtSec', () => {
  assert.match(SRC, /processBallistics\(ballisticsState, audioBands, dtMs\)/);
  assert.match(SRC, /dtSec,/);
  assert.doesNotMatch(SRC, /processBallistics\(ballisticsState, audioBands, dtSec\)/);
});
