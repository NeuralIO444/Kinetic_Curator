// #819 — ACCUM live recipe vs accum.mjs keep/optics/tunnel.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const DIR = dirname(fileURLToPath(import.meta.url));
const accum = readFileSync(join(DIR, 'accum.mjs'), 'utf8');
const live = readFileSync(join(DIR, 'liveLoop.mjs'), 'utf8');

test('#819 accum.mjs owns keep / optics / tunnel', () => {
  assert.match(accum, /keep/);
  assert.match(accum, /optics/);
  assert.match(accum, /tunnel/);
});

test('#819 live loop feeds the same accum fields', () => {
  assert.match(live, /accumObj/);
  assert.match(live, /setAccumFrozen/);
});

test('#819 grain is not mixed inside accum.mjs keep', () => {
  assert.doesNotMatch(accum, /u_effect == 2/);
  assert.doesNotMatch(accum, /kind === 'grain'/);
});
