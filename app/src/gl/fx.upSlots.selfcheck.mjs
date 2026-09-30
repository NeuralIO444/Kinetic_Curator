// #821 — EFFECT_FS u_p slots. Grain amount must not share rgbSplit dx.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { BUILTIN_EFFECT_DEFS } from './bridge/builtinEffects.mjs';
import { EFFECT_FS, EFFECT_IDS } from './shaders.mjs';

function pack(kind, params) {
  const row = BUILTIN_EFFECT_DEFS.find((d) => d.kind === kind);
  const def = row.make(EFFECT_IDS);
  return def.passes[0].params(params);
}

test('#821 rgbSplit packs dx on u_p.x only', () => {
  const u = pack('rgbSplit', { dx: 12, amount: 1 });
  assert.ok(u[0] > 0);
  assert.equal(u[1], 0);
});

test('#821 grain packs amount on u_p.y, leaves u_p.x at 0', () => {
  const u = pack('grain', { amount: 0.3, dx: 12 });
  assert.equal(u[0], 0);
  assert.ok(u[1] > 0 && u[1] <= 1);
});

test('#821 shader grain reads u_p.y', () => {
  assert.match(EFFECT_FS, /u_effect == 2/);
  assert.match(EFFECT_FS, /float amt = clamp\(u_p\.y/);
  assert.match(EFFECT_FS, /float dx = u_p\.x/);
});

test('#821 shader source on disk matches export', () => {
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'shaders.mjs'), 'utf8');
  assert.match(src, /float amt = clamp\(u_p\.y/);
});
