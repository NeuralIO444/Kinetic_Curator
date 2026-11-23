// node src/gl/cultureLifeHost.selfcheck.mjs
// CULTURE Phase 1, slice K2 (the parent issue 2187) — the GPU culture-life host's pure half: the
// step planner mirrors the world's culture in lockstep (reseed on a new seed or a target behind
// the held generation, bounded catch-up, never an overshoot). The GL half is exercised against
// the JS reference by parity/cultureLifeSim.selfcheck, and skips here.
import assert from 'node:assert/strict';
import {
  planCultureLifeSteps,
  CULTURE_LIFE_HOST_BACKEND,
  CULTURE_LIFE_GPU_MAX_STEPS_PER_CALL,
} from './cultureLifeHost.mjs';
import { CULTURE_LIFE_GPU_BACKEND } from '../engine/cultureWorld.mjs';
import { KNOWN_SIM_BACKENDS } from '../engine/kernel/simBackends.js';

let groups = 0;
const ok = (name) => {
  groups++;
  console.log(`  ok ${groups} — ${name}`);
};

// A: the stamp the host hands out is the vocabulary's GPU culture id.
{
  assert.equal(CULTURE_LIFE_HOST_BACKEND, CULTURE_LIFE_GPU_BACKEND);
  assert.equal(CULTURE_LIFE_HOST_BACKEND, 'gpu.life.v1');
  assert.ok(KNOWN_SIM_BACKENDS.culture.includes(CULTURE_LIFE_HOST_BACKEND));
  ok('the host stamps gpu.life.v1, the simBackends GPU culture id');
}

// B: first frame seeds and steps toward the target, bounded by the per-call catch-up bound.
{
  const p = planCultureLifeSteps(null, 7, 500);
  assert.equal(p.reseed, true, 'no held mirror = a seed');
  assert.equal(p.from, 0);
  assert.equal(p.target, 500);
  assert.equal(p.steps, CULTURE_LIFE_GPU_MAX_STEPS_PER_CALL, 'a long catch-up is bounded, not a stall');
  const q = planCultureLifeSteps(null, 7, 10);
  assert.equal(q.steps, 10, 'a short first run is exact');
  ok('first frame: reseed, bounded catch-up');
}

// C: a held mirror continues in lockstep and never overshoots the world's generation.
{
  const held = { seed: 7, gen: 40 };
  const p = planCultureLifeSteps(held, 7, 45);
  assert.equal(p.reseed, false);
  assert.equal(p.from, 40);
  assert.equal(p.steps, 5);
  assert.equal(planCultureLifeSteps({ seed: 7, gen: 45 }, 7, 45).steps, 0, 'caught up = no steps');
  assert.equal(planCultureLifeSteps(held, 7, 40).steps, 0, 'at the target = no steps');
  ok('lockstep: the difference only, never past the world');
}

// D: a new seed or a target behind the held generation re-seeds — the mirror starts from the birth grid.
{
  const held = { seed: 7, gen: 40 };
  assert.equal(planCultureLifeSteps(held, 8, 45).reseed, true, 'a new world seed re-seeds');
  const back = planCultureLifeSteps(held, 7, 12);
  assert.equal(back.reseed, true, 'a target behind the held generation re-seeds (a fresh world, a seek back)');
  assert.equal(back.from, 0);
  assert.equal(back.steps, 12, 'and then runs to the target from birth');
  ok('reseed: new seed or a backward target starts the mirror over');
}

// E: junk inputs are inert, never explosive.
{
  const p = planCultureLifeSteps(null, undefined, undefined);
  assert.equal(p.target, 0);
  assert.equal(p.steps, 0);
  assert.ok(Number.isFinite(planCultureLifeSteps(null, NaN, NaN).target));
  assert.equal(planCultureLifeSteps({ seed: 0, gen: 3 }, 0, -5).target, 0, 'a negative target reads as birth');
  ok('junk: NaN and negative read as the birth state');
}

console.log(`cultureLifeHost.selfcheck: OK (${groups} groups) — CULTURE Phase 1 K2, the GPU host's planner`);
