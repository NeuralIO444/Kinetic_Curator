// node src/engine/kernel/sample/sample.selfcheck.mjs
// Kernel K2 — sampler registry acceptance (#60).

import assert from 'node:assert';
import { createHash } from 'node:crypto';
import { getSampler, listSamplers } from './registry.js';
import { computePlacements } from '../../placement.js';
import { mkRng } from '../../prng.js';

const MODES = [
  'random', 'grid', 'fibonacci', 'phyllotaxis', 'radial', 'truchet',
  'swarm', 'noise', 'hype', 'stratified', 'flow', 'brush', 'layers', 'rails',
  'ca', 'voronoi', 'lsystem',
  'dla', 'eden', // #720
  'orbit', 'abacus',
  'poisson', // #1193 — Poisson-disc blue noise
  'gaussian', // #1194 — Gaussian cluster mixture
  'circlepack', // #1195 — circle packing
  'colonize', // #1197 — space-colonization growth
];

// ── every mode is registered and returns a finite point ───────────────
for (const mode of MODES) {
  const fn = getSampler(mode);
  assert.strictEqual(typeof fn, 'function', `${mode} registered`);
  const rng = mkRng(1);
  const p = fn({ i: 0, count: 20, w: 800, h: 600, rng, jitter: 4, seed: 1 });
  assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), `${mode} finite`);
}

// ── listSamplers covers the declared set ──────────────────────────────
const listed = listSamplers();
for (const mode of MODES) {
  assert.ok(listed.includes(mode), `${mode} in listSamplers`);
}

// ── unknown mode falls back to random, once per (layer, mode) ─────
{
  const fn = getSampler('__does_not_exist__', 'test-layer');
  assert.strictEqual(typeof fn, 'function');
  const rng = mkRng(2);
  const p = fn({ i: 0, count: 10, w: 100, h: 100, rng, jitter: 0, seed: 2 });
  assert.ok(Number.isFinite(p.x));
}

// ── column-writing mode is honoured when present ───────────────────
{
  const out = {
    x: new Float64Array(1),
    y: new Float64Array(1),
    t: new Float64Array(1),
    rot01: new Float64Array(1),
  };
  out.t.fill(NaN);
  out.rot01.fill(NaN);
  const rng = mkRng(3);
  const fn = getSampler('grid');
  const ret = fn({
    i: 0, count: 4, w: 200, h: 100, rng, jitter: 0, seed: 3,
    out, row: 0,
  });
  assert.strictEqual(ret, undefined, 'column mode returns undefined');
  assert.ok(Number.isFinite(out.x[0]) && Number.isFinite(out.y[0]));
}

// ── orchestrator places finite points for every mode ────────────────
for (const mode of ['poisson', 'gaussian', 'circlepack', 'colonize', 'dla', 'eden']) {
  const items = computePlacements({
    mode,
    count: 30,
    seed: 0xabc,
    scale: [0.5, 1.2],
    rotate: [0, 20],
    alpha: [50, 90],
    jitter: 8,
    density: 100,
    zTiers: 1,
    bleed: false,
    canvasW: 800,
    canvasH: 600,
  });
  assert.strictEqual(items.length, 30, `${mode} places count`);
  for (const p of items) {
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), `${mode} finite placement`);
  }
}

console.log('sample.selfcheck: ok');
