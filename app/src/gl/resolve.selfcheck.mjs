// #532 PR1 — resolve probe is compiled in and bypassed.
import assert from 'node:assert/strict';
import { RESOLVE_FS } from './shaders.mjs';

assert.match(RESOLVE_FS, /uniform float u_aces/);
assert.match(RESOLVE_FS, /uniform float u_exposure/);
assert.match(RESOLVE_FS, /uniform float u_dither/);
assert.match(RESOLVE_FS, /acesNarkowicz/);
assert.match(RESOLVE_FS, /bayer4/);
assert.match(RESOLVE_FS, /u_aces < 0\.5 && u_dither < 1e-8/);
assert.match(RESOLVE_FS, /gl_FragCoord/);
assert.doesNotMatch(RESOLVE_FS, /u_time/);
console.log('ok resolve.selfcheck — #532 probe present, bypass on u_aces=0');
