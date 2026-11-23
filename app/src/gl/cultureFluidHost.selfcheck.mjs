// node src/gl/cultureFluidHost.selfcheck.mjs
// CULTURE Phase 1, slice K1 (the parent issue 2186) — the GPU culture-fluid host's pure half: the
// step planner mirrors the world's fluid in lockstep (reseed on a new seed or a target behind the
// held step, bounded catch-up, never an overshoot). The GL half is exercised against the JS
// reference by parity/cultureFluidSim.selfcheck, and skips here.
import assert from 'node:assert/strict';
import {
  planCultureFluidSteps,
  CULTURE_FLUID_HOST_BACKEND,
  CULTURE_FLUID_GPU_MAX_STEPS_PER_CALL,
} from './cultureFluidHost.mjs';
import { CULTURE_FLUID_GPU_BACKEND } from '../engine/cultureWorld.mjs';
import { KNOWN_SIM_BACKENDS } from '../engine/kernel/simBackends.js';

let groups = 0;
const ok = (name) => {
  groups++;
  console.log(`  ok ${groups} — ${name}`);
};

// A: the stamp the host hands out is the vocabulary's GPU fluid id.
{
  assert.equal(CULTURE_FLUID_HOST_BACKEND, CULTURE_FLUID_GPU_BACKEND);
  assert.equal(CULTURE_FLUID_HOST_BACKEND, 'gpu.gs.v1');
  assert.ok(KNOWN_SIM_BACKENDS.fluid.includes(CULTURE_FLUID_HOST_BACKEND));
  ok('the host stamps gpu.gs.v1, the simBackends GPU fluid id');
}

// B: first frame seeds and steps toward the target, bounded by the per-call catch-up bound.
{
  const p = planCultureFluidSteps(null, 7, 500);
  assert.equal(p.reseed, true, 'no held mirror = a seed');
  assert.equal(p.from, 0);
  assert.equal(p.target, 500);
  assert.equal(p.steps, CULTURE_FLUID_GPU_MAX_STEPS_PER_CALL, 'a long catch-up is bounded, not a stall');
  const q = planCultureFluidSteps(null, 7, 10);
  assert.equal(q.steps, 10, 'a short first run is exact');
  ok('first frame: reseed, bounded catch-up');
}

// C: a held mirror continues in lockstep and never overshoots the world's fluid step.
{
  const held = { seed: 7, step: 40 };
  const p = planCultureFluidSteps(held, 7, 45);
  assert.equal(p.reseed, false);
  assert.equal(p.from, 40);
  assert.equal(p.steps, 5);
  assert.equal(planCultureFluidSteps({ seed: 7, step: 45 }, 7, 45).steps, 0, 'caught up = no steps');
  assert.equal(planCultureFluidSteps(held, 7, 40).steps, 0, 'at the target = no steps');
  ok('lockstep: the difference only, never past the world');
}

// D: a new seed or a target behind the held step re-seeds — the mirror starts from the birth field.
{
  const held = { seed: 7, step: 40 };
  assert.equal(planCultureFluidSteps(held, 8, 45).reseed, true, 'a new world seed re-seeds');
  const back = planCultureFluidSteps(held, 7, 12);
  assert.equal(back.reseed, true, 'a target behind the held step re-seeds (a fresh world, a seek back)');
  assert.equal(back.from, 0);
  assert.equal(back.steps, 12, 'and then runs to the target from birth');
  ok('reseed: new seed or a backward target starts the mirror over');
}

// E: junk inputs are inert, never explosive.
{
  const p = planCultureFluidSteps(null, undefined, undefined);
  assert.equal(p.target, 0);
  assert.equal(p.steps, 0);
  assert.ok(Number.isFinite(planCultureFluidSteps(null, NaN, NaN).target));
  assert.equal(planCultureFluidSteps({ seed: 0, step: 3 }, 0, -5).target, 0, 'a negative target reads as birth');
  ok('junk: NaN and negative read as the birth state');
}

console.log(`cultureFluidHost.selfcheck: OK (${groups} groups) — CULTURE Phase 1 K1, the GPU host's planner`);
