import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { crookedCorner, openAlpha } from './hands.mjs';

test('#866 amount 0 is the current quad and the current sample', () => {
  const c = { x: 12, y: -8 };
  assert.deepEqual(crookedCorner(c, 0, 0.3), c);
  assert.equal(openAlpha(0.8, { x: 0.5, y: 0.5 }, 0, 0.2), 0.8);
  const src = readFileSync(new URL('./shaders.mjs', import.meta.url), 'utf8');
  assert.match(src, /u_hands\.x > 0\.0/);
  assert.match(src, /u_hands\.y > 0\.0/);
  assert.doesNotMatch(readFileSync(new URL('./resolveFs.mjs', import.meta.url), 'utf8'), /u_hands/);
});

test('#866 a non-zero hand changes the mark and repeats for the same seed', () => {
  const c = { x: 12, y: -8 };
  const a = crookedCorner(c, 0.6, 0.3);
  const b = crookedCorner(c, 0.6, 0.3);
  assert.deepEqual(a, b);
  assert.notEqual(a.x, c.x);
  const ink = openAlpha(0.8, { x: 0.5, y: 0.5 }, 0.7, 0.2);
  assert.equal(ink, openAlpha(0.8, { x: 0.5, y: 0.5 }, 0.7, 0.2));
  assert.ok(ink < 0.8);
});
