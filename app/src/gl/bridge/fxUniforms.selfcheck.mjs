// #816 — one wrap chain: per-pass uniforms, missing LUT does not abort.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { EFFECT_IDS } from '../shaders.mjs';
import { BUILTIN_EFFECT_DEFS, EFFECT_SLOT_MAP } from './builtinEffects.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(DIR, rel), 'utf8');

function pack(kind, params) {
  const def = BUILTIN_EFFECT_DEFS.find((d) => d.kind === kind);
  const step = def.make(EFFECT_IDS);
  return step.passes[0].params(params);
}

test('#816 slot map matches the packers', () => {
  assert.equal(EFFECT_SLOT_MAP.rgbSplit.u_p[0], 'dx/1000');
  assert.equal(EFFECT_SLOT_MAP.grain.u_p[1], 'amount');
  assert.equal(EFFECT_SLOT_MAP.grain.u_p[0], '0');
  assert.deepEqual(pack('rgbSplit', { dx: 8 }), [0.008, 0, 0, 0]);
  assert.deepEqual(pack('grain', { amount: 0.35 }), [0, 0.35, 0, 0]);
});

test('#1022 blur packs amount → sigma through the function-form passes', () => {
  const def = BUILTIN_EFFECT_DEFS.find((d) => d.kind === 'blur');
  const step = def.make(EFFECT_IDS);
  const passes = step.passes({ amount: 0.5 }, { width: 1000, height: 700 });
  assert.equal(passes.length, 2, 'one (H,V) pair at σ 20');
  assert.deepEqual(passes.map((p) => p.mode), [EFFECT_IDS.blurH, EFFECT_IDS.blurV]);
  assert.deepEqual(passes[0].params(), [20, 0, 0, 0], 'u_p.x carries the device-px sigma');
  assert.deepEqual(passes[1].params(), [20, 0, 0, 0]);
  assert.deepEqual(step.passes({ amount: 0 }, { width: 1000, height: 700 }), [], 'amount 0 → no passes');
  assert.deepEqual(
    step.passes({ amount: 99 }, { width: 1000, height: 700 }).map((p) => p.params()[0]),
    [20, 20, 20, 20, 20, 20, 20, 20],
    'hostile amount clamps to the catalog range, then subdivides honestly',
  );
  assert.equal(EFFECT_SLOT_MAP.blur.u_p[0], 'sigma');
});

test('#816 RGB then grain do not leak uniforms', () => {  const rgb = pack('rgbSplit', { dx: 12 });
  const grain = pack('grain', { amount: 0.35 });
  assert.equal(rgb[0], 0.012);
  assert.equal(rgb[1], 0, 'grain amount must not land in dx');
  assert.equal(grain[0], 0, 'rgb dx must not land in grain u_p.x');
  assert.equal(grain[1], 0.35);
  rgb[1] = 0.9;
  assert.equal(pack('grain', { amount: 0.35 })[1], 0.35, 'packs are fresh arrays');
});

test('#816 missing grain LUT does not abort the chain', () => {
  const bridge = read('bridge.mjs');
  const renderer = read('../renderer.mjs');
  assert.match(bridge, /u_aux: step\.aux \|\| read\.tex/);
  assert.doesNotMatch(bridge, /if \(!step\.aux\) throw/);
  assert.match(renderer, /return grainLuts\[wrap\.fxLayerId\] \|\| null/);
  assert.match(renderer, /fxFinishChains\.push/);
});
