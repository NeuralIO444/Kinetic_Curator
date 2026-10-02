// #819 — table the live feedback path against accum.mjs and studio stills.
// No look change. Fails if a recipe path grows a destination-in / alpha-fade
// leftover, or stops passing keep/optics/tunnel into the shared GPU recipe.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const DIR = dirname(fileURLToPath(import.meta.url));
const APP = join(DIR, '..', '..');
const REPO = join(APP, '..');
const read = (rel) => readFileSync(join(REPO, rel), 'utf8');

const accum = read('app/src/gl/accum.mjs');
const live = read('app/src/gl/liveLoop.mjs');
const still = read('app/src/gl/accumStill.mjs');
const studio = read('studio/studio.py');
const fade = read('studio/accumFade.js');

test('#819 accum.mjs owns keep / optics / tunnel', () => {
  assert.match(accum, /export function accumRecipeParams/);
  assert.match(accum, /fade/);
  assert.match(accum, /optics/);
  assert.match(accum, /tunnel/);
  assert.match(accum, /rgb \*= keep|u_keep/);
});

test('#819 live loop feeds the same accum fields', () => {
  assert.match(live, /from '\.\/accum\.mjs'/);
  assert.match(live, /accumRecipeParams\(/);
  assert.match(live, /accumObj\.step\(/);
  assert.match(live, /fade: halfLifeToKeep/);
  assert.match(live, /optics: layoutParams\.accumulationOptics/);
  assert.match(live, /tunnel: layoutParams\.accumulationTunnel/);
});

test('#819 studio stills feed the same accum fields', () => {
  assert.match(studio, /accumStill\.mjs/);
  assert.match(studio, /"--fade"/);
  assert.match(studio, /"--optics"/);
  assert.match(studio, /"--tunnel"/);
  assert.match(still, /renderAccumViaGL/);
  assert.match(still, /fade: args\.fade/);
  assert.match(still, /optics: args\.optics/);
  assert.match(still, /tunnel: args\.tunnel/);
});

test('#819 grain is not mixed inside accum.mjs keep', () => {
  assert.doesNotMatch(accum, /u_effect == 2/);
  assert.doesNotMatch(accum, /kind === 'grain'/);
});

test('#819 recipe paths have no destination-in alpha fade', () => {
  for (const [name, src] of [['liveLoop', live], ['accumStill', still], ['studio.py', studio]]) {
    assert.doesNotMatch(src, /destination-in/, `${name} must not fade alpha`);
    assert.doesNotMatch(src, /globalCompositeOperation/, `${name} must not composite in 2D`);
  }
  // accum.mjs may name the old law in its era note. The fade shader must not.
  const fadeFs = accum.slice(accum.indexOf('FADE_FS'), accum.indexOf('FEED_FS'));
  assert.doesNotMatch(fadeFs, /destination-in/);
  assert.match(fadeFs, /keep/);
});

test('#819 destination-in leftover is the orphan clamp, not a recipe', () => {
  assert.match(fade, /destination-in/, 'studio/accumFade.js still documents the 2D law');
  assert.doesNotMatch(studio, /accumFade/);
  assert.doesNotMatch(live, /accumFade/);
  assert.doesNotMatch(still, /accumFade/);
  assert.doesNotMatch(live, /useAccumulationBuffer/);
});
