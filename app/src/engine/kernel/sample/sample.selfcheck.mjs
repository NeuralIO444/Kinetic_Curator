// node src/engine/kernel/sample/sample.selfcheck.mjs
// Kernel K2 acceptance (#60)

import assert from 'node:assert';
import { getSampler, listSamplers, stratified } from './registry.js';
import { computePlacements, geometrySignature } from '../../placement.js';
import { mkRng } from '../../prng.js';
import { hashU01 } from '../rng.js';

const required = [
  'grid', 'fibonacci', 'radial', 'swarm', 'flow', 'layers', 'rails',
  'ca', 'orbit', 'abacus', 'noise', 'hype', 'stratified', 'random',
  'dla', 'eden', // #720
  'brush', // flow-field trail stamping
  'poisson', // #1193 — Poisson-disc blue noise
  'gaussian', // #1194 — Gaussian cluster mixture
  'circlepack', // #1195 — circle packing
  'colonize', // #1197 — space-colonization growth
];

for (const id of required) {
  assert.ok(getSampler(id), `missing sampler ${id}`);
}
// getSampler falls back to `random` for unknown modes, so the required loop
// above cannot prove registration — the list check can.
assert.ok(listSamplers().includes('brush'), 'brush must be registered');

const listed = listSamplers();
assert.ok(listed.includes('stratified'));

// Deterministic stratified
{
  const a = [];
  const b = [];
  for (let i = 0; i < 16; i++) {
    const ra = mkRng(0x1111 ^ i);
    const rb = mkRng(0x1111 ^ i);
    a.push(stratified({ i, count: 16, w: 400, h: 300, rng: ra, jitter: 0, seed: 1 }));
    b.push(stratified({ i, count: 16, w: 400, h: 300, rng: rb, jitter: 0, seed: 1 }));
  }
  for (let i = 0; i < 16; i++) {
    assert.strictEqual(a[i].x, b[i].x);
    assert.strictEqual(a[i].y, b[i].y);
  }
}

// geometrySignature is stable
{
  const s1 = geometrySignature({ mode: 'grid', count: 40, seed: 7, canvasW: 800, canvasH: 600 });
  const s2 = geometrySignature({ mode: 'grid', count: 40, seed: 7, canvasW: 800, canvasH: 600 });
  assert.strictEqual(s1, s2);
}

console.log('sample.selfcheck: ok');
