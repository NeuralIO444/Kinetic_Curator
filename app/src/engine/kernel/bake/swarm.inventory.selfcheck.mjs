// #811 child 1 — live JS tick vs bake. One contract, two runners.
// Uniqueness (#558) is evaluated in the integrator, not a third init loop.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const DIR = dirname(fileURLToPath(import.meta.url));
const particles = readFileSync(join(DIR, '../../particles.js'), 'utf8');
const bake = readFileSync(join(DIR, 'index.js'), 'utf8');
const live = readFileSync(join(DIR, '../../../gl/liveResolve.mjs'), 'utf8');

const FORCES = ['curl2', 'swarmCohesion', 'gravityWells', 'contactRadius', 'damping'];

test('#811 live tick and bake share the force names', () => {
  for (const name of FORCES) {
    assert.match(particles, new RegExp(name), `live tick missing ${name}`);
  }
  assert.match(bake, /sys\.update\(/, 'JS bake steps the live integrator');
  assert.match(bake, /runSwarmWasm\(/, 'WASM bake is the other runner, not a third formula');
  assert.match(bake, /BAKE_TIME_ORIGIN \+ s \* dt/);
  const code = bake.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(code, /Date\.now\(/);
});

test('#811 uniqueness is the integrator, not a resolve loop', () => {
  assert.match(particles, /phaseOffset/);
  assert.match(particles, /driftMul/);
  assert.match(particles, /speedMul/);
  assert.match(particles, /\.\.\.this\._uniqueness\(i\)/);
  assert.doesNotMatch(live, /phaseOffset\s*=/);
  assert.doesNotMatch(live, /driftMul\s*=/);
});
