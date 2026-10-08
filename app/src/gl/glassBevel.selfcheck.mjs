/**
 * glassBevel.selfcheck.mjs — #1129 PR2: soft-bevel tuning.
 *
 * Pins the acceptance criteria:
 *  - glass instances take the soft-bevel variant (wider taps, gentler slope,
 *    broader specular); non-glass keeps the exact existing enamel values;
 *  - the dead-zone comment/code (2 alpha steps) is preserved in the wide-tap
 *    variant — it kills quantization banding on flat faces at any tap distance;
 *  - the unlit path is byte-identical: v_glass never leaks outside the sun block;
 *  - the instance stride carries the glass flag (21 floats, flag at [20]);
 *  - the variant declares its GPU cost tier honestly (tier 0: no new fetches).
 *
 * Run: node --test src/gl/glassBevel.selfcheck.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GLASS_BEVEL, ENAMEL_BEVEL } from './glassBevel.mjs';
import { QUAD_FS, QUAD_VS } from './shaders.mjs';
import { packInstanceData } from './renderer.mjs';
import { getCostTier } from './costTiers.mjs';

test('variant constants spread the bevel: wider taps, gentler slope, broader specular', () => {
  assert.ok(GLASS_BEVEL.tapTexels > ENAMEL_BEVEL.tapTexels, 'taps reach further out');
  assert.ok(GLASS_BEVEL.bevelScale < ENAMEL_BEVEL.bevelScale, 'slope is gentler');
  assert.ok(GLASS_BEVEL.specPow < ENAMEL_BEVEL.specPow, 'specular is broader');
});

test('QUAD_FS mixes the glass variant against GLASS_BEVEL values', () => {
  const t = `mix(2.0, ${GLASS_BEVEL.tapTexels.toFixed(1)}, v_glass)`;
  const b = `mix(1.0, ${GLASS_BEVEL.bevelScale.toFixed(2)}, v_glass)`;
  const s = `mix(48.0, ${GLASS_BEVEL.specPow.toFixed(1)}, v_glass)`;
  assert.ok(QUAD_FS.includes(t), `tap spread mix present: ${t}`);
  assert.ok(QUAD_FS.includes(b), `bevel scale mix present: ${b}`);
  assert.ok(QUAD_FS.includes(s), `spec power mix present: ${s}`);
});

test('non-glass keeps the exact existing enamel values (mix with 0.0 is bit-identical)', () => {
  // The mix defaults are the old hardcoded constants: 2.0 texels, 1.0 scale, pow 48.
  assert.deepStrictEqual(
    [ENAMEL_BEVEL.tapTexels, ENAMEL_BEVEL.bevelScale, ENAMEL_BEVEL.specPow],
    [2.0, 1.0, 48.0],
    'enamel constants are the pre-PR2 values',
  );
});

test('dead zone preserved exactly in the wide-tap variant', () => {
  assert.ok(
    QUAD_FS.includes('max(abs(g) - 2.0 / 255.0, 0.0)'),
    'the 2-alpha-step dead zone still kills flat-face quantization noise',
  );
  assert.ok(
    QUAD_FS.includes('Dead zone:'),
    'the dead-zone comment explaining the banding kill is preserved',
  );
});

test('unlit path is byte-identical: v_glass never leaks outside the sun block', () => {
  const head = QUAD_FS.split('if (u_sun.w > 0.5)')[0];
  const decls = (head.match(/in float v_glass;/g) || []).length;
  assert.equal(decls, 1, 'exactly one v_glass declaration before the sun block');
  const uses = (head.match(/v_glass/g) || []).length;
  assert.equal(uses, 1, 'no other v_glass reference before the sun block');
  assert.ok(
    QUAD_FS.includes('o.rgb = min(o.rgb * v_light, vec3(o.a));'),
    'the unlit else-branch is untouched',
  );
});

test('vertex stage carries the glass flag: attrib 6 in, varying out', () => {
  assert.ok(QUAD_VS.includes('layout(location=6) in float a_glass;'), 'a_glass attribute declared');
  assert.ok(QUAD_VS.includes('out float v_glass;'), 'v_glass varying declared');
  assert.ok(QUAD_VS.includes('v_glass = a_glass;'), 'flag passed through (constant per instance)');
  assert.ok(QUAD_FS.includes('in float v_glass;'), 'fragment stage declares the varying');
});

test('packInstanceData: 21-float stride, glass flag at [20], old producers read 0', () => {
  const cells = { 'a|#ffffff|#000000': { u0: 0, v0: 0, u1: 0.5, v1: 0.5 } };
  const mk = (glass) => ({
    x: 1, y: 2, scaleX: 1, scaleY: 1, rotation: 0, opacity: 0.5,
    asset: 'a', tint: '#ffffff', accent: '#000000', ...(glass === undefined ? {} : { glass }),
  });
  const data = packInstanceData([mk(true), mk(false), mk(undefined)], cells);
  assert.equal(data.length, 63, '3 instances × 21 floats');
  assert.equal(data[20], 1, 'glass:true → 1');
  assert.equal(data[41], 0, 'glass:false → 0');
  assert.equal(data[62], 0, 'missing flag (old producers) → 0 = enamel');
  // The first 20 floats of a glass item match a non-glass item bit-for-bit:
  // the flag rides after, never inside, the existing channels.
  for (let i = 0; i < 20; i++) assert.equal(data[i], data[21 + i], `float ${i} identical`);
});

test('cost tier declared honestly: tier 0, no new texture fetches', () => {
  const decl = getCostTier('light/glass-soft-bevel');
  assert.ok(decl, 'registered');
  assert.equal(decl.tier, 0, 'structural — same 4 taps, wider offsets; never shed separately');
  assert.equal(decl.memoryBytes, 0, 'no new textures or buffers');
});
