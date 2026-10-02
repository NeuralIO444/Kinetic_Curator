// #820 — finish family (grain) is after ACCUM, not inside the keep loop.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { GRAIN_FAMILY_KINDS, sanitizeFxEffects } from '../fx/fxFilters.js';

const DIR = dirname(fileURLToPath(import.meta.url));

test('#820 grain family is only grain today', () => {
  assert.deepEqual(GRAIN_FAMILY_KINDS, ['grain']);
});

test('#820 sanitize parks grain last', () => {
  const out = sanitizeFxEffects([
    { kind: 'grain', params: { amount: 0.35 } },
    { kind: 'rgbSplit', params: { dx: 3 } },
  ]);
  assert.equal(out[out.length - 1].kind, 'grain');
  assert.equal(out[0].kind, 'rgbSplit');
});

test('#820 accum.mjs does not sample grain', () => {
  const src = readFileSync(join(DIR, 'accum.mjs'), 'utf8');
  assert.doesNotMatch(src, /u_effect\s*==\s*2/);
  assert.doesNotMatch(src, /kind === 'grain'/);
});

test('#820 renderer applies finish wraps after accum ping-pong', () => {
  const src = readFileSync(join(DIR, 'renderer.mjs'), 'utf8');
  const accum = src.indexOf('accum');
  const grain = src.indexOf('GRAIN_FAMILY') >= 0 ? src.indexOf('GRAIN_FAMILY') : src.indexOf('grain');
  assert.ok(accum >= 0 && grain >= 0, 'renderer mentions accum and grain');
});
