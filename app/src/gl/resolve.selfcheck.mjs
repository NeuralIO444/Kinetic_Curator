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
bindResolveProbe({ uniform1f: (loc, v) => { set[loc] = v; } }, (n) => n);
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
bindResolveProbe({ uniform1f: (loc, v) => { set[loc] = v; } }, (n) => n, { fxaa: 1 });
assert.equal(set.u_fxaa, 1, 'fxaa can be armed');

console.log('ok resolve.selfcheck — #532 PR2 defaults aces=1 dither=1 exposure=1; #740 fxaa=0');
