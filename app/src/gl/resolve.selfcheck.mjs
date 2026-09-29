// #532 PR2 — probe enabled by default; bypass path still present.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { RESOLVE_FS } from './resolveFs.mjs';
import { bindResolveProbe } from './resolveBind.mjs';

assert.match(RESOLVE_FS, /uniform float u_aces/);
assert.match(RESOLVE_FS, /acesNarkowicz/);
assert.match(RESOLVE_FS, /bayer4/);
assert.match(RESOLVE_FS, /u_aces < 0\.5 && u_dither < 1e-8/);

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'resolveBind.mjs'), 'utf8');
assert.match(src, /aces = 1/);
assert.match(src, /dither = 1/);
assert.match(src, /exposure = 1/);
assert.equal(typeof bindResolveProbe, 'function');

console.log('ok resolve.selfcheck — #532 PR2 defaults aces=1 dither=1 exposure=1');
