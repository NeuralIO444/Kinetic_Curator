// #812 — live JS vs WASM bake force table.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const ROOT = dirname(fileURLToPath(import.meta.url));
const particles = readFileSync(join(ROOT, 'particles.js'), 'utf8');
const wasm = readFileSync(join(ROOT, 'kernel/bake/swarmWasm.mjs'), 'utf8');

const LIVE = [
  'cohesion',
  'separate',
  '_contactPass',
  'curl2',
  'levyGain',
  'lorenzGain',
  'chemotaxis',
];

test('#812 live integrator still has the named terms', () => {
  for (const term of LIVE) {
    assert.ok(particles.includes(term), `particles.js missing ${term}`);
  }
  assert.match(particles, /update\(/);
  assert.match(particles, /dtSec/);
});

test('#812 WASM bake is cloud-swarm only and may refuse organisms', () => {
  assert.match(wasm, /unsupported configuration stays on the JS engine/);
  assert.match(wasm, /isOrganismMode/);
  assert.match(wasm, /swarm_run/);
});

test('#812 contacts live in JS update', () => {
  assert.match(particles, /_contactPass/);
  assert.match(particles, /contactRadius/);
});
