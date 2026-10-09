/**
 * glassStriation.selfcheck.mjs — #1129 PR4: internal striations.
 *
 * Pins the acceptance criteria:
 *  - faint vertical luminance banding inside the glass body, via local-y
 *    modulation of the diffuse term — internal depth, never surface paint;
 *  - the band phase is noise-warped (shared kc_vnoise chunk, procedural:
 *    no texture, no upload, per the #1079 lesson), masked by the body's
 *    own alpha so bands never appear outside the silhouette;
 *  - the striation multiplier is glass-gated: mix(1.0, s, 0.0) is
 *    bit-identical to 1.0 for non-glass, so the enamel diffuse is
 *    untouched, provably;
 *  - the unlit path is byte-identical: no striation evaluation outside
 *    the sun block;
 *  - the four PRs compose without cross-talk: bevel (PR2), caustic (PR3)
 *    and striations (PR4) each gated independently on v_glass, each
 *    touching only its own term;
 *  - the variant declares its GPU cost tier honestly.
 *
 * Run: node --test src/gl/glassStriation.selfcheck.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GLASS_STRIATION, ENAMEL_STRIATION } from './glassStriation.mjs';
import { QUAD_FS } from './shaders.mjs';
import { getCostTier } from './costTiers.mjs';

test('striation constants describe faint internal depth, not a visible pattern', () => {
  assert.ok(GLASS_STRIATION.freq > 0, 'positive band frequency');
  assert.ok(GLASS_STRIATION.amp >= 0.01 && GLASS_STRIATION.amp <= 0.1, 'amp is faint: ±1–10%');
  assert.ok(GLASS_STRIATION.warpFreq > 0, 'positive warp frequency');
  assert.ok(GLASS_STRIATION.warpAmp > 0, 'positive warp amplitude');
  assert.ok(Number.isFinite(GLASS_STRIATION.seedOffset), 'finite seed offset');
  assert.equal(ENAMEL_STRIATION, 1.0, 'non-glass multiplier is exactly 1.0');
});

test('QUAD_FS modulates the diffuse wrap with the glass-gated striation term', () => {
  const gate = `float strMul = mix(1.0, 1.0 + ${GLASS_STRIATION.amp.toFixed(3)} * strBand * clamp(o.a, 0.0, 1.0), v_glass);`;
  assert.ok(QUAD_FS.includes(gate), `striation gate present: ${gate}`);
  assert.ok(
    QUAD_FS.includes('float wrap = max(diff * 0.65 + 0.35, 0.0) * strMul;'),
    'the striation multiplier applies to the diffuse wrap',
  );
});

test('bands are vertical (local-y modulation), noise-warped, alpha-masked, seed-offset', () => {
  const warp = `kc_vnoise(v_uv * ${GLASS_STRIATION.warpFreq.toFixed(1)} + v_seed * ${GLASS_STRIATION.seedOffset.toFixed(1)})`;
  assert.ok(QUAD_FS.includes(warp), `procedural warp field present: ${warp}`);
  const band = `sin((sLocal.y * ${GLASS_STRIATION.freq.toFixed(1)} + strWarp * ${GLASS_STRIATION.warpAmp.toFixed(1)}) * 6.28318530718)`;
  assert.ok(QUAD_FS.includes(band), `banding wave present: ${band}`);
  assert.ok(QUAD_FS.includes('clamp(o.a, 0.0, 1.0)'), 'bands masked by the body alpha');
  assert.ok(
    QUAD_FS.includes('vec2 sLocal = (v_uv - sLo) / max(sHi - sLo, vec2(1e-4));'),
    'instance-local UV from the atlas cell',
  );
});

test('warp comes from the shared chunk library, not an inline duplicate or texture', () => {
  assert.ok(
    QUAD_FS.includes('float kc_vnoise(vec2 p)'),
    'kc_vnoise is defined via injectCommon (shared chunks #196)',
  );
  const samplers = [...QUAD_FS.matchAll(/uniform\s+sampler2D\s+(\w+)\s*;/g)].map((m) => m[1]);
  assert.deepStrictEqual(samplers, ['u_atlas'], `no new texture samplers (found: ${samplers})`);
  // Audit the shader body (past the injected chunk preamble — the library's
  // own comments name the banned idioms, which is fine; the ban is on code).
  // The sin-hash check is built from parts: the tree-wide chunk audit greps
  // every .mjs file for the literal, so it cannot appear verbatim here either.
  const body = QUAD_FS.slice(QUAD_FS.indexOf('void main'));
  const sinHashMagic = '43' + '758.5453';
  assert.ok(!body.includes(sinHashMagic), 'no sin-hash magic constant');
  const sinHashIdiom = new RegExp('fract' + '\\s*\\(\\s*' + 'sin' + '\\s*\\(\\s*' + 'dot');
  assert.ok(!sinHashIdiom.test(body), 'no sine-based hash idiom in the shader body');
});

test('non-glass keeps the exact existing diffuse (gate is bit-identical to 1.0)', () => {
  // mix(1.0, s, 0.0) = 1.0 + 0.0 * (s - 1.0) = 1.0, exactly: s is finite
  // (sine, clamp and a finite noise warp — no division, no pow, no NaN
  // path), so 0.0 * (s - 1.0) is +0.0 and 1.0 + 0.0 is 1.0.
  // wrap * 1.0 is wrap.
  assert.ok(Number.isFinite(GLASS_STRIATION.amp), 'amp finite');
  assert.ok(Number.isFinite(GLASS_STRIATION.warpAmp), 'warpAmp finite');
  assert.ok(
    QUAD_FS.includes('float strMul = mix(1.0,'),
    'the gate multiplies by the mix, never by the raw band',
  );
});

test('unlit path is byte-identical: no striation evaluation outside the sun block', () => {
  const head = QUAD_FS.split('if (u_sun.w > 0.5)')[0];
  assert.ok(!head.includes('strBand'), 'no banding wave before the sun block');
  assert.ok(!head.includes('strMul'), 'no striation gate before the sun block');
  assert.ok(
    QUAD_FS.includes('o.rgb = min(o.rgb * v_light, vec3(o.a));'),
    'the unlit else-branch is untouched',
  );
});

test('the four PRs compose without cross-talk: each term gated independently', () => {
  // PR2 bevel: per-instance variant selection on v_glass.
  assert.ok(QUAD_FS.includes('v_glass) * tx;'), 'PR2 bevel taps select on v_glass');
  // PR3 caustic: touches spec only, gated on v_glass.
  assert.ok(QUAD_FS.includes('spec *= mix(1.0,'), 'PR3 caustic multiplies spec, gated on v_glass');
  // PR4 striations: touches the diffuse wrap only, gated on v_glass.
  assert.ok(QUAD_FS.includes('* strMul;'), 'PR4 striations multiply the diffuse wrap');
  assert.ok(
    !QUAD_FS.includes('spec * strMul') && !QUAD_FS.includes('strMul * spec'),
    'striations never touch the specular term',
  );
  const causticLine = QUAD_FS.split('\n').find((l) => l.includes('spec *= mix(1.0,'));
  assert.ok(!causticLine.includes('wrap'), 'caustics never touch the diffuse wrap');
});

test('cost tier declared honestly: tier 0, no textures, ALU-only', () => {
  const decl = getCostTier('light/glass-striation');
  assert.ok(decl, 'registered');
  assert.equal(decl.tier, 0, 'structural — rides the quad pass, never shed separately');
  assert.equal(decl.memoryBytes, 0, 'no textures or buffers');
});
