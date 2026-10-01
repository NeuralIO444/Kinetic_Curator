// #808 — EVOLVE stamp accepts loopTimeMs.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const APP = join(dirname(fileURLToPath(import.meta.url)), '../..');

test('#808 triggerEvolve reads opts.loopTimeMs', () => {
  const src = readFileSync(join(APP, 'src/state/slices/davisSlice.js'), 'utf8');
  assert.match(src, /opts\.loopTimeMs/);
  assert.match(src, /Number\.isFinite\(opts\.loopTimeMs\)/);
});

test('#808 live loop exposes getLoopTimeMs', () => {
  const src = readFileSync(join(APP, 'src/gl/liveLoop.mjs'), 'utf8');
  assert.match(src, /getLoopTimeMs:\s*\(\)\s*=>\s*loopTimeMs/);
});

test('#808 App time-evolve passes loopTimeMs', () => {
  const src = readFileSync(join(APP, 'src/App.jsx'), 'utf8');
  assert.match(src, /TRIGGER_EVOLVE, payload: \{ loopTimeMs \}/);
  assert.match(src, /triggerEvolve\(\{ loopTimeMs:/);
});
