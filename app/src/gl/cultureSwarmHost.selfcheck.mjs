// node src/gl/cultureSwarmHost.selfcheck.mjs
// CULTURE Phase 1, slice K3 (the parent issue 2188) — the GPU culture-swarm host's pure half:
// the step planner mirrors the world's swarm (reseed on a new seed, a changed population,
// or a target behind the held step; a re-seed starts AT the target, because bodies are
// dealt, not derived; bounded catch-up), the kernel-parameter mapping, and the cap pins
// (the world's table, the contacts producer, and the GPU swarm texture all hold the
// ladder's 2,048). The GL half is exercised against the JS reference by
// parity/cultureSwarmSim.selfcheck, and skips here.
import assert from 'node:assert/strict';
import {
  planCultureSwarmSteps,
  cultureSwarmKernelParams,
  CULTURE_SWARM_HOST_BACKEND,
  CULTURE_SWARM_GPU_MAX_STEPS_PER_CALL,
} from './cultureSwarmHost.mjs';
import { CULTURE_SWARM_GPU_BACKEND, CULTURE_BODY_CAP } from '../engine/cultureWorld.mjs';
import { CULTURE_SWARM_PARAMS } from '../engine/cultureSwarm.mjs';
import { CONTACTS_CAP_BODIES } from './gpuContactsHost.mjs';
import { swarmTextureLayout } from './swarmSim.mjs';
import { KNOWN_SIM_BACKENDS } from '../engine/kernel/simBackends.js';

let groups = 0;
const ok = (name) => {
  groups++;
  console.log(`  ok ${groups} — ${name}`);
};

// A: the stamp the host hands out is the vocabulary's GPU swarm id.
{
  assert.equal(CULTURE_SWARM_HOST_BACKEND, CULTURE_SWARM_GPU_BACKEND);
  assert.equal(CULTURE_SWARM_HOST_BACKEND, 'gpu.swarm.v1');
  assert.ok(KNOWN_SIM_BACKENDS.swarm.includes(CULTURE_SWARM_HOST_BACKEND));
  ok('the host stamps gpu.swarm.v1, the simBackends GPU swarm id');
}

// B: first frame re-seeds — and starts AT the target, because the mirror seeds from the
// world's table as it stands (bodies are dealt, not derived from the seed: the one
// deliberate difference from the fluid/life planners, which restart from step zero).
{
  const p = planCultureSwarmSteps(null, 7, 40, 500);
  assert.equal(p.reseed, true, 'no held mirror = a seed');
  assert.equal(p.from, 500, 'a seed adopts the world step it seeded at');
  assert.equal(p.target, 500);
  assert.equal(p.steps, 0, 'nothing to catch up: the seed IS the current table');
  const q = planCultureSwarmSteps(null, 7, 40, 0);
  assert.equal(q.reseed, true);
  assert.equal(q.from, 0);
  ok('first frame: reseed from the standing table, starting at the target');
}

// C: a held mirror continues in lockstep and never overshoots the world's step.
{
  const held = { seed: 7, count: 40, step: 40 };
  const p = planCultureSwarmSteps(held, 7, 40, 45);
  assert.equal(p.reseed, false);
  assert.equal(p.from, 40);
  assert.equal(p.steps, 5);
  assert.equal(planCultureSwarmSteps({ seed: 7, count: 40, step: 45 }, 7, 40, 45).steps, 0, 'caught up = no steps');
  assert.equal(planCultureSwarmSteps(held, 7, 40, 40).steps, 0, 'at the target = no steps');
  ok('lockstep: the difference only, never past the world');
}

// D: catch-up is bounded per call.
{
  const p = planCultureSwarmSteps({ seed: 7, count: 40, step: 10 }, 7, 40, 500);
  assert.equal(p.reseed, false);
  assert.equal(p.steps, CULTURE_SWARM_GPU_MAX_STEPS_PER_CALL, 'a deep lag is bounded, not a stall');
  assert.equal(p.from + p.steps, 10 + CULTURE_SWARM_GPU_MAX_STEPS_PER_CALL);
  ok('bounded catch-up: at most the per-call bound per frame');
}

// E: every reseed key — a new seed, a changed population, a target behind the held step.
{
  const held = { seed: 7, count: 40, step: 40 };
  const bySeed = planCultureSwarmSteps(held, 8, 40, 45);
  assert.equal(bySeed.reseed, true, 'a new world seed re-seeds');
  assert.equal(bySeed.from, 45, 'and adopts the target it seeded at');
  const byCount = planCultureSwarmSteps(held, 7, 41, 45);
  assert.equal(byCount.reseed, true, 'a changed population re-seeds (the kernel is sized to its count)');
  const back = planCultureSwarmSteps(held, 7, 40, 12);
  assert.equal(back.reseed, true, 'a target behind the held step re-seeds (a fresh world, a seek back)');
  assert.equal(back.from, 12);
  assert.equal(back.steps, 0);
  ok('reseed keys: new seed, changed count, backward target — each adopts its target');
}

// F: the kernel-parameter mapping is the world's standing values, one frame per step, wrap over the dish.
{
  const k = cultureSwarmKernelParams();
  const p = CULTURE_SWARM_PARAMS;
  assert.equal(k.dtFrames, 1);
  assert.deepEqual([k.sepR, k.aliR, k.cohR], [p.sepR, p.aliR, p.cohR]);
  assert.deepEqual([k.sepW, k.aliW, k.cohW], [p.sepW, p.aliW, p.cohW]);
  assert.equal(k.damping, p.damping);
  assert.equal(k.maxSpeed, p.maxSpeed);
  assert.equal(k.bounds, 'wrap');
  assert.deepEqual([k.canvasW, k.canvasH], [p.w, p.h]);
  assert.equal(k.attractor, null, 'no attractor: the fields are a later phase');
  assert.equal(k.wind, null, 'no wind: the fields are a later phase');
  ok('kernel params: the standing cloud core over the dish extent, no fields');
}

// G: the cap pins agree — the world's table, the contacts producer's ladder, and the GPU swarm's texture.
{
  assert.equal(CULTURE_BODY_CAP, 2048);
  assert.equal(CONTACTS_CAP_BODIES, CULTURE_BODY_CAP, 'the contacts producer cap is the same ladder step');
  assert.deepEqual(swarmTextureLayout(CULTURE_BODY_CAP), { w: 128, h: 16, n: 2048 }, 'the kernel holds the full table');
  ok('the cap: world table, contacts ladder, and kernel texture all hold 2,048');
}

console.log(
  `cultureSwarmHost.selfcheck: OK (${groups} groups) — CULTURE Phase 1 K3, the GPU culture-swarm host (planner)`,
);
