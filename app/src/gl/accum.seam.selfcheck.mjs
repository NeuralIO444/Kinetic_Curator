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

// #815 child 2 — ACCUM on + FX-4 grain 0.35: grit on top, plate not crushed.
// Mirrors EFFECT_FS grain (u_effect == 2): k = (n - 0.5) * amt * 0.55 * a,
// rgb clamped to the plate alpha. Finish runs once after accum.step.

function grainSpeckle(rgb, a, n, amount) {
  const amt = Math.min(1, Math.max(0, amount));
  const k = (n - 0.5) * amt * 0.55 * a;
  return {
    rgb: rgb.map((c) => Math.min(a, Math.max(0, c + k))),
    a,
  };
}

test('#815 grain 0.35 sits on the plate and does not crush it', () => {
  const plate = [0.45, 0.45, 0.45];
  const a = 1;
  const hi = grainSpeckle(plate, a, 1, 0.35);
  const lo = grainSpeckle(plate, a, 0, 0.35);
  const span = 0.5 * 0.35 * 0.55;
  assert.equal(hi.a, 1, 'alpha is the plate');
  assert.equal(lo.a, 1);
  for (const c of hi.rgb) assert.ok(c <= plate[0] + span + 1e-9 && c >= plate[0], 'bright grit stays on the plate');
  for (const c of lo.rgb) assert.ok(c >= plate[0] - span - 1e-9 && c > 0.3, 'dark grit does not sink the plate');
  const off = grainSpeckle(plate, a, 0, 0);
  assert.deepEqual(off.rgb, plate, 'amount 0 is identity');
  const empty = grainSpeckle([0, 0, 0], 0, 1, 0.35);
  assert.deepEqual(empty.rgb, [0, 0, 0], 'no speckle where alpha is 0');
});

test('#815 finish chain runs after accum.step, not inside the recipe', () => {
  const renderer = readFileSync(join(DIR, 'renderer.mjs'), 'utf8');
  const live = readFileSync(join(DIR, 'liveLoop.mjs'), 'utf8');
  const accum = readFileSync(join(DIR, 'accum.mjs'), 'utf8');
  const step = renderer.indexOf('accum.step(frameT.tex, params)');
  const finish = renderer.indexOf('finalTex = bridge.runChain(layerId, finalTex, steps)');
  assert.ok(step >= 0 && finish > step, 'stills apply grain after the last accum step');
  const liveStep = live.indexOf('accumObj.step(');
  const liveFinish = live.indexOf('accumTex = live.getBridge().runChain(layerId, accumTex, steps)');
  assert.ok(liveStep >= 0 && liveFinish > liveStep, 'live applies grain after accum.step');
  const passes = accum.slice(accum.indexOf('ACCUM_PASS_SOURCES'));
  assert.doesNotMatch(passes, /grain/);
  assert.doesNotMatch(accum, /trailMode/);
});

test('#815 accum recipe has no grain amount to compound', () => {
  const src = readFileSync(join(DIR, 'accum.mjs'), 'utf8');
  const sig = src.match(/export function accumRecipeParams\(\{[^}]+\}/);
  assert.ok(sig, 'accumRecipeParams signature present');
  assert.doesNotMatch(sig[0], /amount|grain|trail/);
  assert.match(sig[0], /fade/);
  assert.match(sig[0], /optics/);
  assert.match(sig[0], /tunnel/);
});
