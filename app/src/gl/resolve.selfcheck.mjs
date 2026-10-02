// #532 PR2 — probe enabled by default; bypass path still present.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { RESOLVE_FS } from './resolveFs.mjs';
import { bindResolveProbe, DITHER_AMPLITUDE } from './resolveBind.mjs';

assert.match(RESOLVE_FS, /uniform float u_aces/);
assert.match(RESOLVE_FS, /acesNarkowicz/);
assert.match(RESOLVE_FS, /bayer4/);
assert.match(RESOLVE_FS, /u_aces < 0\.5 && u_dither < 1e-8 && u_fxaa < 0\.5/);

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'resolveBind.mjs'), 'utf8');
assert.match(src, /aces = 1/);
assert.match(src, /dither = 1/);
assert.match(src, /exposure = 1/);
assert.equal(typeof bindResolveProbe, 'function');

// Dither must stay sub-LSB: u_dither is added to [0,1] colour, so 1.0 paints a mesh.
const set = {};
bindResolveProbe({ uniform1f: (loc, v) => { set[loc] = v; }, uniform2f: (loc, x, y) => { set[loc] = [x, y]; }, uniform4f: (loc, x, y, z) => { set[loc] = [x, y, z]; } }, (n) => n);
assert.equal(set.u_dither, DITHER_AMPLITUDE);
assert.ok(set.u_dither > 0 && set.u_dither <= 1 / 255, `u_dither ${set.u_dither} must be ≤ 1/255`);

// #740 PR1: FXAA is compiled in but bypassed by default (pixel-identical), and
// sits between tonemap and dither — dither stays the last thing to touch pixels.
assert.match(RESOLVE_FS, /uniform float u_fxaa/);
assert.match(RESOLVE_FS, /vec4 fxaa\(/);
assert.ok(
  RESOLVE_FS.indexOf('acesNarkowicz(c);\n  float a') < RESOLVE_FS.indexOf('if (u_fxaa >= 0.5)')
  && RESOLVE_FS.indexOf('if (u_fxaa >= 0.5)') < RESOLVE_FS.indexOf('if (u_dither > 1e-8) {\n    float b = bayer4'),
  'order: tonemap → fxaa → dither',
);
assert.equal(set.u_fxaa, 0, 'fxaa defaults off in PR1');
bindResolveProbe({ uniform1f: (loc, v) => { set[loc] = v; }, uniform2f: (loc, x, y) => { set[loc] = [x, y]; }, uniform4f: (loc, x, y, z) => { set[loc] = [x, y, z]; } }, (n) => n, { fxaa: 1 });
assert.equal(set.u_fxaa, 1, 'fxaa can be armed');

// #741: gate weave — a sample-position offset that is exactly zero by default.
assert.match(RESOLVE_FS, /uniform vec2 u_weave/);
assert.match(RESOLVE_FS, /\+ u_weave \/ vec2\(textureSize\(u_src, 0\)\)/, 'offset applied to the base sample position');
assert.deepEqual(set.u_weave, [0, 0], 'weave defaults to (0,0) = byte-identical');
bindResolveProbe({ uniform1f() {}, uniform2f: (loc, x, y) => { set[loc] = [x, y]; }, uniform4f() {} }, (n) => n, { weave: [0.25, -0.5] });
assert.deepEqual(set.u_weave, [0.25, -0.5], 'weave can be armed');
bindResolveProbe({ uniform1f() {}, uniform2f: (loc, x, y) => { set[loc] = [x, y]; }, uniform4f() {} }, (n) => n, { weave: [NaN, Infinity] });
assert.deepEqual(set.u_weave, [0, 0], 'non-finite weave never reaches the shader');

console.log('ok resolve.selfcheck — #532 PR2 defaults aces=1 dither=1 exposure=1; #740 fxaa=0');

assert.match(RESOLVE_FS, /uniform vec4 u_fake/);
assert.match(RESOLVE_FS, /u_fake\.x/);
assert.deepEqual(set.u_fake, [0, 0, 0]);
