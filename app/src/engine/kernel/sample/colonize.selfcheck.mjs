// node src/engine/kernel/sample/colonize.selfcheck.mjs
// #1197 — Space-colonization growth (attractor-driven branching) acceptance.

import assert from 'node:assert';
import { colonize, colonizeNetwork, clearColonizeCache, COLONIZE_MAX_NODES } from './colonize.js';
import { getSampler, listSamplers } from './registry.js';
import { mkRng } from '../../prng.js';

const W = 1000;
const H = 700;

// ── registered ───────────────────────────────────────────────────────
assert.strictEqual(typeof getSampler('colonize'), 'function', 'colonize must be registered');
assert.ok(listSamplers().includes('colonize'), 'colonize in listSamplers');

// ── deterministic per seed ────────────────────────────────────────────
{
  clearColonizeCache();
  const mk = (s) => {
    const pts = [];
    for (let i = 0; i < 40; i++) {
      const rng = mkRng((s ^ (i * 0x9e3779b9)) >>> 0 || 1);
      pts.push(colonize({
        i, count: 80, w: W, h: H, rng, jitter: 0, seed: s, seedOffsets: null,
      }));
    }
    return pts;
  };
  const a = mk(0xbeef);
  const b = mk(0xbeef);
  for (let i = 0; i < 40; i++) {
    assert.strictEqual(a[i].x, b[i].x, `x[${i}] deterministic`);
    assert.strictEqual(a[i].y, b[i].y, `y[${i}] deterministic`);
    assert.strictEqual(a[i].t, b[i].t, `t[${i}] deterministic`);
  }
}

// ── network bounds and consumption ──────────────────────────────────────
{
  clearColonizeCache();
  const net = colonizeNetwork({
    seed: 0x1234, seedOffsets: null, w: W, h: H, count: 120,
  });
  assert.ok(net.nodes.length >= 2, 'grew beyond the root');
  assert.ok(net.nodes.length <= COLONIZE_MAX_NODES, 'hard node cap held');
  assert.ok(net.steps <= 1200, 'hard step cap held');
  // Attractors are consumed: most should be dead by the end.
  assert.ok(net.consumed > net.attractors * 0.4, `attractors consumed (${net.consumed}/${net.attractors})`);
  // Points stay on the plate.
  for (const nd of net.nodes) {
    assert.ok(nd.x >= 0 && nd.x <= W, 'node x in bounds');
    assert.ok(nd.y >= 0 && nd.y <= H, 'node y in bounds');
  }
}

// ── different seeds diverge ───────────────────────────────────────────
{
  clearColonizeCache();
  const a = colonizeNetwork({ seed: 1, seedOffsets: null, w: W, h: H, count: 60 });
  const b = colonizeNetwork({ seed: 2, seedOffsets: null, w: W, h: H, count: 60 });
  let same = 0;
  const m = Math.min(a.nodes.length, b.nodes.length, 30);
  for (let i = 0; i < m; i++) {
    if (a.nodes[i].x === b.nodes[i].x && a.nodes[i].y === b.nodes[i].y) same++;
  }
  assert.ok(same < m, 'seeds diverge');
}

// ── knobs affect the form ─────────────────────────────────────────────
{
  clearColonizeCache();
  const tight = colonizeNetwork({
    seed: 7, seedOffsets: null, w: W, h: H, count: 80,
    influence: 40, kill: 8, branch: 0.05,
  });
  const loose = colonizeNetwork({
    seed: 7, seedOffsets: null, w: W, h: H, count: 80,
    influence: 160, kill: 30, branch: 0.6,
  });
  // Loose influence should reach more / grow differently.
  assert.notStrictEqual(tight.nodes.length, loose.nodes.length);
}

// ── sampler returns finite points ───────────────────────────────────────
{
  clearColonizeCache();
  for (let i = 0; i < 50; i++) {
    const p = colonize({
      i, count: 100, w: W, h: H, rng: mkRng(i + 1), jitter: 0,
      seed: 99, seedOffsets: null,
    });
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.t));
    assert.ok(p.t >= 0 && p.t <= 1);
  }
}

console.log('colonize.selfcheck: ok');
