// node src/engine/kernel/rng.scratch.selfcheck.mjs
// #1250 — hoisted per-point mkRng allocation to a per-call scratch stream.
// The scratch stream must be VALUE-IDENTICAL to the per-point rngForIndex
// allocation it replaces: one stream per placement call, reseeded per index.

import assert from 'node:assert';
import { CH, hashU01, hashU32, rngForIndex, makeScratchStream } from './rng.js';
import { computePlacements } from '../placement.js';
import { getSampler } from './sample/registry.js';

const seed = 0x1250;
const offsets = { spatial: 3, color: 0, asset: 0, noise: 0 };

// 1. Scratch draw sequence is bit-identical to a fresh rngForIndex,
//    per index, across numeric channels, string channels, and offsets.
{
  const channels = [CH.geo, CH.attr, 'ca', 'voronoi', 'field'];
  const seeds = [0, 1, seed, 0xffffffff];
  for (const s of seeds) {
    for (const ch of channels) {
      for (const i of [0, 1, 7, 4095]) {
        for (const offs of [null, offsets]) {
          const fresh = rngForIndex(s, ch, i, offs);
          const scratch = makeScratchStream().reseed(s, ch, i, offs).draw;
          for (let k = 0; k < 25; k++) {
            assert.strictEqual(scratch(), fresh(),
              `scratch != rngForIndex @ seed=${s} ch=${ch} i=${i} k=${k}`);
          }
        }
      }
    }
  }
  console.log('kernel/rng.scratch.selfcheck: OK (scratch == rngForIndex, all channels/offsets)');
}

// 2. Sampler level, old path vs new path: a direct sampler call with NO
//    scratch in ctx (the old allocation path) must produce byte-identical
//    output to the same call WITH a scratch stream (the hoisted path).
{
  const grid = Array.from({ length: 16 }, (_, r) =>
    Array.from({ length: 16 }, (_, c) => ((r * 7 + c * 13 + 5) % 3 === 0 ? 1 : 0)));
  const mkCtx = (scratch) => ({
    i: 0, count: 64, w: 1000, h: 700,
    rng: () => 0.5, jitter: 8, seed, caGrid: grid,
    seedOffsets: offsets, scratch,
  });
  for (const mode of ['ca', 'voronoi']) {
    const sample = getSampler(mode);
    const scratch = makeScratchStream();
    for (const i of [0, 1, 5, 37, 63]) {
      const oldCtx = mkCtx(undefined);
      const newCtx = mkCtx(scratch);
      oldCtx.i = i;
      newCtx.i = i;
      const a = sample(oldCtx);
      const b = sample(newCtx);
      assert.strictEqual(b.x, a.x, `${mode}@${i} x: scratch path diverged`);
      assert.strictEqual(b.y, a.y, `${mode}@${i} y: scratch path diverged`);
    }
  }
  console.log('kernel/rng.scratch.selfcheck: OK (sampler scratch path == legacy path)');
}

// 3. Pinned placement fixtures: the full placement call (one shared scratch
//    stream across all points) must reproduce the pre-#1250 per-point output.
//    These checksums were taken from the pre-change baseline (origin/main)
//    — any future value change breaks this CI, which is the intent.
{
  const grid = Array.from({ length: 16 }, (_, r) =>
    Array.from({ length: 16 }, (_, c) => ((r * 7 + c * 13 + 5) % 3 === 0 ? 1 : 0)));
  const base = {
    seed, count: 64, jitter: 0, density: 100, zTiers: 1, bleed: false,
    canvasW: 1000, canvasH: 700, scale: [0.4, 0.8], rotate: [0, 45],
    alpha: [60, 100], caGrid: grid,
  };
  const checksums = { ca: 'ed09fa64', voronoi: '750137ad' };
  for (const mode of Object.keys(checksums)) {
    const p = computePlacements({ ...base, mode });
    let h = 0;
    for (const pt of p) {
      const xs = Math.round(pt.x * 1e6), ys = Math.round(pt.y * 1e6);
      h = (Math.imul(h, 31) ^ xs ^ Math.imul(ys, 7)) >>> 0;
    }
    const hex = h.toString(16).padStart(8, '0');
    assert.strictEqual(hex, checksums[mode],
      `${mode} placement changed: expected ${checksums[mode]}, got ${hex}`);
  }
  console.log('kernel/rng.scratch.selfcheck: OK (placement fixtures pinned: ca, voronoi)');
}

console.log('kernel/rng.scratch.selfcheck: OK (#1250)');
