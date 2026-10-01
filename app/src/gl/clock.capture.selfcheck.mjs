// #810 — capture / stills do not advertise Date.now as the sim clock.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const APP = join(dirname(fileURLToPath(import.meta.url)), '../..');

test('#810 loop-capture docs loopTimeMs', () => {
  const src = readFileSync(join(APP, 'src/hooks/useLoopCapture.js'), 'utf8');
  assert.match(src, /loopTimeMs from the live loop/);
  assert.doesNotMatch(src, /Date\.now drives the noise field/);
});

test('#810 liveLoop captureFrame exists next to getLoopTimeMs', () => {
  const src = readFileSync(join(APP, 'src/gl/liveLoop.mjs'), 'utf8');
  assert.match(src, /captureFrame/);
  assert.match(src, /getLoopTimeMs/);
});

test('#810 bake origin is pinned', () => {
  const src = readFileSync(join(APP, 'src/engine/kernel/bake/index.js'), 'utf8');
  assert.match(src, /BAKE_TIME_ORIGIN/);
});
