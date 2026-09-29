// #532 PR1 — resolve probe compiled, bypassed, and imported by the live path.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { RESOLVE_FS } from './resolveFs.mjs';

assert.match(RESOLVE_FS, /uniform float u_aces/);
assert.match(RESOLVE_FS, /uniform float u_exposure/);
assert.match(RESOLVE_FS, /uniform float u_dither/);
assert.match(RESOLVE_FS, /acesNarkowicz/);
assert.match(RESOLVE_FS, /bayer4/);
assert.match(RESOLVE_FS, /u_aces < 0\.5 && u_dither < 1e-8/);
assert.match(RESOLVE_FS, /gl_FragCoord/);
assert.doesNotMatch(RESOLVE_FS, /u_time/);

const dir = dirname(fileURLToPath(import.meta.url));
const renderer = readFileSync(join(dir, 'renderer.mjs'), 'utf8');
assert.match(renderer, /from '\.\/resolveFs\.mjs'/);
assert.match(renderer, /bindResolveProbe/);
assert.match(renderer, /u_aces/);

console.log('ok resolve.selfcheck — #532 probe present, renderer wired, bypass on');
