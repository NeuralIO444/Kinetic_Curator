// risoFinish.selfcheck.mjs — RISO OVERPRINT finish (#2008).
// Pins: byte-identity at zero (the standing discipline), determinism at every
// detent, the multiply law (the print only ever darkens, alpha untouched),
// detent sanitization, and the two mirrors' agreement (CPU constants, FX
// catalog ranges, GLSL descriptor, grain-family placement).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

const {
  applyRisoFinish,
  sanitizeRisoParams,
  RISO_GLSL,
  RISO_SHIFT_DETENTS,
  RISO_SHIFT_DIR,
  RISO_AMOUNT_DEFAULT,
  RISO_SHIFT_DEFAULT,
} = await import('./risoFinish.mjs');
const { FX_EFFECT_DEFS, GRAIN_FAMILY_KINDS, sanitizeFxEffects, compileFxPrimitives } =
  await import('../fx/fxFilters.js');

// A small frame with structure: a bright block, a mid block, transparency.
const W = 8;
const H = 4;
const frame = new Uint8Array(W * H * 4);
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    const o = (y * W + x) * 4;
    frame[o] = x < 4 ? 200 : 90;
    frame[o + 1] = y < 2 ? 160 : 60;
    frame[o + 2] = 120;
    frame[o + 3] = x === 7 ? 0 : 255;
  }

ok('byte-identity at zero: amount 0 returns the frame byte-identical at every shift detent', () => {
  for (const shift of RISO_SHIFT_DETENTS) {
    const out = applyRisoFinish(frame, W, H, { amount: 0, shift });
    assert.deepEqual([...out], [...frame], `shift ${shift}`);
    assert.notEqual(out, frame, 'a copy, not the input buffer');
  }
  assert.deepEqual([...applyRisoFinish(frame, W, H, {})], [...frame], 'defaults are OFF');
  assert.deepEqual([...applyRisoFinish(frame, W, H, null)], [...frame], 'junk params are OFF');
});

ok('determinism at detents: same frame + same dials → same bytes, twice', () => {
  for (const shift of RISO_SHIFT_DETENTS)
    for (const amount of [0.25, 0.5, 1]) {
      const a = applyRisoFinish(frame, W, H, { amount, shift });
      const b = applyRisoFinish(frame, W, H, { amount, shift });
      assert.deepEqual([...a], [...b], `amount ${amount} shift ${shift}`);
    }
});

ok('the print works: amount > 0 changes the frame, only darkens, alpha untouched', () => {
  const out = applyRisoFinish(frame, W, H, { amount: 1, shift: 2 });
  assert.notDeepEqual([...out], [...frame]);
  for (let i = 0; i < W * H; i++) {
    for (let ch = 0; ch < 3; ch++) assert.ok(out[i * 4 + ch] <= frame[i * 4 + ch], `channel never brightens (px ${i})`);
    assert.equal(out[i * 4 + 3], frame[i * 4 + 3], 'alpha untouched');
  }
  // A uniform white frame prints onto itself: multiply by white is identity.
  const white = new Uint8Array(W * H * 4).fill(255);
  assert.deepEqual([...applyRisoFinish(white, W, H, { amount: 1, shift: 3 })], [...white]);
});

ok('detents: shift snaps to the ruled detents, amount clamps, junk reads as defaults', () => {
  assert.deepEqual([...RISO_SHIFT_DETENTS], [0, 1, 2, 3, 4]);
  assert.deepEqual({ ...RISO_SHIFT_DIR }, { x: 1, y: 1 });
  assert.equal(RISO_AMOUNT_DEFAULT, 0);
  assert.equal(RISO_SHIFT_DEFAULT, 2);
  assert.deepEqual(sanitizeRisoParams({ amount: 0.5, shift: 3 }), { amount: 0.5, shift: 3 });
  assert.equal(sanitizeRisoParams({ shift: 2.6 }).shift, 3);
  assert.equal(sanitizeRisoParams({ shift: 99 }).shift, 4);
  assert.equal(sanitizeRisoParams({ shift: -2 }).shift, 0);
  assert.equal(sanitizeRisoParams({ amount: 7 }).amount, 1);
  assert.deepEqual(sanitizeRisoParams('junk'), { amount: 0, shift: 2 });
  // shift 0 at full amount still prints (a pass onto itself squares the ink)
  const self = applyRisoFinish(frame, W, H, { amount: 1, shift: 0 });
  assert.notDeepEqual([...self], [...frame]);
});

ok('placement: riso is a grain-family FX kind with the catalog ranges the mirrors share', () => {
  assert.ok(GRAIN_FAMILY_KINDS.includes('riso'), 'grain family (post-composite finish)');
  const def = FX_EFFECT_DEFS.riso;
  assert.ok(def, 'catalog def exists');
  assert.equal(def.params.amount.min, 0);
  assert.equal(def.params.amount.max, 1);
  assert.equal(def.params.amount.step, 0.05);
  assert.equal(def.params.amount.def, RISO_AMOUNT_DEFAULT);
  assert.equal(def.params.shift.min, RISO_SHIFT_DETENTS[0]);
  assert.equal(def.params.shift.max, RISO_SHIFT_DETENTS[RISO_SHIFT_DETENTS.length - 1]);
  assert.equal(def.params.shift.step, 1);
  assert.equal(def.params.shift.def, RISO_SHIFT_DEFAULT);
  // the renderer local copy stays in sync (the fxFilters.selfcheck law, restated for riso)
  const ren = readFileSync(new URL('../gl/renderer.mjs', import.meta.url), 'utf8');
  assert.ok(ren.includes("'riso'"), 'renderer GRAIN_FAMILY_KINDS carries riso');
  // sanitize keeps the kind and clamps its params; the SVG chain compiles it
  const clean = sanitizeFxEffects([{ kind: 'riso', params: { amount: 9, shift: 3 } }]);
  assert.equal(clean.length, 1);
  assert.equal(clean[0].params.amount, 1);
  assert.ok(
    compileFxPrimitives([{ kind: 'riso', params: { amount: 0.5, shift: 2 } }]).length >= 1,
    'SVG print path compiles riso',
  );
  assert.equal(
    compileFxPrimitives([{ kind: 'riso', params: { amount: 0 } }]).length,
    1,
    'identity at zero still compiles (pass-through)',
  );
});

ok('GLSL mirror: the shader carries the same law (zero branch, multiply, alpha untouched)', () => {
  assert.ok(RISO_GLSL.includes('u_amount'), 'amount uniform');
  assert.ok(RISO_GLSL.includes('u_shift'), 'shift uniform');
  assert.ok(/amt <= 0\.0/.test(RISO_GLSL), 'the zero branch returns the source untouched');
  assert.ok(
    RISO_GLSL.includes('mix(vec3(1.0), c2, amt)'),
    'the multiply mix matches the CPU factor (1 - amt + amt * c2)',
  );
  assert.ok(RISO_GLSL.includes('vec2(1.0, 1.0)'), 'the misregistration direction matches RISO_SHIFT_DIR (+1, +1)');
});

ok('GL registration: the template effect exists with the same ranges', async () => {
  const { FX_SHADER_EFFECTS, FX_RISO_DESCRIPTOR } = await import('../gl/effects/fxShaders.mjs');
  const entry = FX_SHADER_EFFECTS.find(([k]) => k === 'riso');
  assert.ok(entry, 'riso registered in FX_SHADER_EFFECTS');
  assert.equal(entry[1].fs, RISO_GLSL, 'the registered shader IS the finish module’s GLSL');
  assert.equal(FX_RISO_DESCRIPTOR.params.amount.def, RISO_AMOUNT_DEFAULT);
  assert.equal(FX_RISO_DESCRIPTOR.params.shift.def, RISO_SHIFT_DEFAULT);
  assert.equal(FX_RISO_DESCRIPTOR.params.shift.max, RISO_SHIFT_DETENTS[RISO_SHIFT_DETENTS.length - 1]);
});

console.log(`risoFinish.selfcheck: ${n} checks passed`);
