import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// #1914 — the trailSteerLive scope pin. The flag is a buildFrame-local
// const; tick() must read it off buildFrame's return (`frame.`), never
// bare. The bare read threw ReferenceError on every accum frame from
// #1878 (2026-10-30) until this fix — the loop caught it and silently
// fell back to plain rendering, so accumulation never engaged while
// every suite stayed green. These pins are the regression guard: they
// fail the moment either tick site loses its qualifier again.
const src = readFileSync(fileURLToPath(new URL('./liveLoop.mjs', import.meta.url)), 'utf8');

test('#1914 buildFrame returns trailSteerLive for tick to read', () => {
  assert.match(src, /^\s+trailSteerLive,$/m, 'return object must carry the trailSteerLive field');
});

test('#1914 the ageBuffer request reads frame.trailSteerLive', () => {
  assert.ok(
    src.includes('ageBuffer: DEBUG_AGE || DEBUG_TRAILGRID || frame.trailSteerLive,'),
    'tick ageBuffer site must be frame-qualified',
  );
  assert.ok(!src.includes('|| trailSteerLive,'), 'bare trailSteerLive read in the params object');
});

test('#1914 the steering-grid update reads frame.trailSteerLive', () => {
  assert.ok(
    src.includes('if (frame.trailSteerLive) updateTrailSteerGrid(accumObj);'),
    'tick steering site must be frame-qualified',
  );
  assert.ok(!src.includes('if (trailSteerLive)'), 'bare trailSteerLive read at the steering site');
});
