/**
 * glassCaustic.selfcheck.mjs — #1129 PR3: caustic specular.
 *
 * Pins the acceptance criteria:
 *  - the broad glass specular (PR2, pow 12) is broken into micro-variation
 *    by a procedural noise field — one kc_vnoise octave from the shared
 *    chunk library (#196), no baked texture, no upload (the #1079 lesson);
 *  - the caustic multiplier is glass-gated: mix(1.0, c, 0.0) is bit-identical
 *    to 1.0 for non-glass, so the enamel specular is untouched, provably;
 *  - the unlit path is byte-identical: no caustic evaluation outside the
 *    sun block;
 *  - the variant declares its GPU cost tier honestly.
 *
 * Run: node --test src/gl/glassCaustic.selfcheck.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GLASS_CAUSTIC, ENAMEL_CAUSTIC } from './glassCaustic.mjs';
import { QUAD_FS } from './shaders.mjs';
import { getCostTier } from './costTiers.mjs';

test('caustic constants describe a shimmer, not a kill: multiplier spans [base, base+amp] around 1.0', () => {
  assert.ok(GLASS_CAUSTIC.freq > 0, 'positive noise frequency');
  assert.ok(GLASS_CAUSTIC.base > 0 && GLASS_CAUSTIC.base < 1, 'base below 1.0');
  assert.ok(GLASS_CAUSTIC.amp > 0, 'positive amplitude');
  assert.ok(GLASS_CAUSTIC.base + GLASS_CAUSTIC.amp > 1, 'range crosses 1.0 — shimmer, not dimming');
  assert.equal(ENAMEL_CAUSTIC, 1.0, 'non-glass multiplier is exactly 1.0');
});

test('QUAD_FS multiplies spec by the glass-gated caustic field', () => {
  const gate = `spec *= mix(1.0, ${GLASS_CAUSTIC.base.toFixed(2)} + ${GLASS_CAUSTIC.amp.toFixed(2)} * causticN, v_glass);`;
  assert.ok(QUAD_FS.includes(gate), `caustic gate present: ${gate}`);
  const field = `kc_vnoise(v_uv * ${GLASS_CAUSTIC.freq.toFixed(1)} + v_seed * 17.0)`;
  assert.ok(QUAD_FS.includes(field), `procedural field present: ${field}`);
});

test('noise comes from the shared chunk library, not an inline duplicate or texture', () => {
  assert.ok(
    QUAD_FS.includes('float kc_vnoise(vec2 p)'),
    'kc_vnoise is defined via injectCommon (shared chunks #196)',
  );
  const samplers = [...QUAD_FS.matchAll(/uniform\s+sampler2D\s+(\w+)\s*;/g)].map((m) => m[1]);
  assert.deepStrictEqual(samplers, ['u_atlas'], `no new texture samplers (found: ${samplers})`);
  // Audit the shader body (past the injected chunk preamble — the library's
  // own comments name the banned idioms, which is fine; the ban is on code).
  // The sin-hash check is built from parts: the tree-wide chunk audit
  // (chunks.selfcheck.mjs) greps every .mjs file for the literal, so it
  // cannot appear verbatim in this file either.
  const body = QUAD_FS.slice(QUAD_FS.indexOf('void main'));
  assert.ok(!/43758\.5453/.test(body), 'no sin-hash magic constant');
  const sinHashIdiom = new RegExp('fract' + '\\s*\\(\\s*' + 'sin' + '\\s*\\(\\s*' + 'dot');
  assert.ok(!sinHashIdiom.test(body), 'no sine-based hash idiom in the shader body');
});

test('non-glass keeps the exact existing specular (gate is bit-identical to 1.0)', () => {
  // mix(1.0, c, 0.0) = 1.0*(1-0) + c*0 = 1.0, exactly: c is finite
  // (base + amp * noise, noise in [0,1] — no division, no pow, no NaN path),
  // so c * 0.0 is +0.0 and 1.0 + 0.0 is 1.0. spec *= 1.0 is spec.
  assert.ok(Number.isFinite(GLASS_CAUSTIC.base), 'base finite');
  assert.ok(Number.isFinite(GLASS_CAUSTIC.amp), 'amp finite');
  assert.ok(
    QUAD_FS.includes('spec *= mix(1.0,'),
    'the gate multiplies by the mix, never by the raw noise',
  );
});

test('unlit path is byte-identical: no caustic evaluation outside the sun block', () => {
  const head = QUAD_FS.split('if (u_sun.w > 0.5)')[0];
  assert.ok(!head.includes('causticN'), 'no caustic noise evaluation before the sun block');
  assert.ok(!head.includes('spec *= mix(1.0,'), 'no caustic gate before the sun block');
  // The kc_vnoise *definition* lives in the injected chunk preamble — that is
  // dead code until called, and the unlit branch never calls it.
  assert.ok(
    QUAD_FS.includes('o.rgb = min(o.rgb * v_light, vec3(o.a));'),
    'the unlit else-branch is untouched',
  );
});

test('per-instance seed offsets the field so bodies do not share a pattern', () => {
  assert.ok(QUAD_FS.includes('v_seed * 17.0'), 'v_seed offsets the noise coordinates');
  assert.ok(QUAD_FS.includes('in float v_seed;'), 'fragment stage declares v_seed');
});

test('cost tier declared honestly: tier 0, no textures, ALU-only', () => {
  const decl = getCostTier('light/glass-caustic-spec');
  assert.ok(decl, 'registered');
  assert.equal(decl.tier, 0, 'structural — rides the quad pass, never shed separately');
  assert.equal(decl.memoryBytes, 0, 'no textures or buffers');
});
