import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { blendBehave, stepBehaveEase, BEHAVE_EASE_MS } from './behaveEase.mjs';
import { BEHAVE } from './behave.js';

const DIR = dirname(fileURLToPath(import.meta.url));

test('#722 behave weights ease and land', () => {
  const mid = blendBehave(BEHAVE.cruise, BEHAVE.flock, 0.5);
  assert.ok(mid.coh > BEHAVE.cruise.coh && mid.coh < BEHAVE.flock.coh);
  assert.equal(blendBehave(BEHAVE.cruise, BEHAVE.flock, 1).coh, BEHAVE.flock.coh);
  assert.equal(blendBehave(BEHAVE.cruise, BEHAVE.flock, 0).coh, BEHAVE.cruise.coh);
  const lorenzMid = blendBehave(BEHAVE.flock, BEHAVE.lorenz, 0.5);
  assert.ok(lorenzMid.lorenzGain > 0 && lorenzMid.lorenzGain < BEHAVE.lorenz.lorenzGain);
});

test('#722 behave is not a dissolve trigger', () => {
  const src = readFileSync(join(DIR, '../../gl/paletteMix.mjs'), 'utf8');
  assert.doesNotMatch(src, /behave !== seen\.behave/);
  assert.doesNotMatch(src, /behave !== seen\.behave/);
});

test('#722 ease integrates dtSec, not wall time', () => {
  let step = stepBehaveEase(null, 'cruise', BEHAVE.cruise, 1 / 60, 'swarm');
  assert.equal(step.t, 1, 'first sight adopts — untouched session is identity');
  step = stepBehaveEase(step.state, 'flock', BEHAVE.flock, 0, 'swarm');
  assert.equal(step.t, 0, 'pause / dtSec 0 does not finish the ease');
  assert.equal(step.windHold, 'point', 'wind kernel held until the ease lands');
  step = stepBehaveEase(step.state, 'flock', BEHAVE.flock, 0.5, 'swarm');
  assert.ok(step.t > 0 && step.t < 1);
  assert.equal(step.windHold, 'point');
  assert.ok(step.profile.coh > BEHAVE.cruise.coh && step.profile.coh < BEHAVE.flock.coh);
  const mid = step;
  step = stepBehaveEase(step.state, 'orbit', BEHAVE.orbit, 0, 'swarm');
  assert.equal(step.t, 0, 'retap re-targets from the current eased row');
  assert.equal(step.state.from.coh, mid.profile.coh);
  assert.equal(step.windHold, 'point', 'kernel stays held across a retap');
  step = stepBehaveEase(step.state, 'orbit', BEHAVE.orbit, BEHAVE_EASE_MS / 1000, 'swarm');
  assert.equal(step.t, 1);
  assert.equal(step.windHold, 'point');
  assert.equal(step.profile.orbit, BEHAVE.orbit.orbit);
});

test('#722 particles ease has no second clock and no lorenz hard-cut', () => {
  const src = readFileSync(join(DIR, '../particles.js'), 'utf8');
  assert.match(src, /stepBehaveEase\(/);
  assert.doesNotMatch(src, /id === 'lorenz' \? rawProfile/);
  assert.doesNotMatch(src, /performance\.now\(\)/);
});
