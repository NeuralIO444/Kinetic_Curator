// node src/engine/kernel/rng.selfcheck.mjs
// Kernel K0 acceptance (#58)

import assert from 'node:assert';
import { CH, STRING_CHANNEL_GROUPS, hashU01, hashU32, rngForIndex, colorRngForIndex, pickWeightedIndexStable, noiseSeedFor } from './rng.js';
import { computePlacements } from '../placement.js';
import { buildPlacements } from '../buildPlacements.js';
import { assignColor } from './color/index.js';

const seed = 0x1a4f;

assert.strictEqual(hashU32(seed, CH.attr, 7), hashU32(seed, CH.attr, 7));
assert.notStrictEqual(hashU32(seed, CH.attr, 7), hashU32(seed, CH.geo, 7));
assert.notStrictEqual(hashU01(seed, CH.dens, 3), hashU01(seed, CH.dens, 4));

{
  const a = rngForIndex(seed, CH.geo, 5);
  const b = rngForIndex(seed, CH.geo, 5);
  assert.strictEqual(a(), b());
  const c = rngForIndex(seed, CH.geo, 6);
  assert.notStrictEqual(rngForIndex(seed, CH.geo, 5)(), c());
}

{
  const base = {
    mode: 'grid', seed, scale: [0.4, 0.8], rotate: [0, 45], alpha: [60, 100],
    jitter: 10, density: 100, zTiers: 1, bleed: false, canvasW: 1000, canvasH: 700,
  };
  const small = computePlacements({ ...base, count: 40 });
  const large = computePlacements({ ...base, count: 80 });
  const byIndex = (arr) => Object.fromEntries(arr.map((p) => [p.index, p]));
  const S = byIndex(small);
  const L = byIndex(large);
  for (const i of Object.keys(S)) {
    const a = S[i];
    const b = L[i];
    assert.ok(b, `index ${i} should exist in larger count`);
    assert.ok(Math.abs(a.scale - b.scale) < 1e-9, `scale @${i}`);
    assert.ok(Math.abs(a.rotation - b.rotation) < 1e-9, `rotation @${i}`);
    assert.ok(Math.abs(a.alpha - b.alpha) < 1e-9, `alpha @${i}`);
  }
}

{
  const base = {
    mode: 'grid', seed, count: 50, scale: [0.4, 0.8], rotate: [0, 45], alpha: [60, 100],
    jitter: 10, zTiers: 1, bleed: false, canvasW: 1000, canvasH: 700,
  };
  const full = computePlacements({ ...base, density: 100 });
  const sparse = computePlacements({ ...base, density: 40 });
  const fullMap = Object.fromEntries(full.map((p) => [p.index, p]));
  for (const p of sparse) {
    const f = fullMap[p.index];
    assert.ok(f, `survivor ${p.index} should exist at density 100`);
    assert.ok(Math.abs(p.scale - f.scale) < 1e-9);
    assert.ok(Math.abs(p.rotation - f.rotation) < 1e-9);
    assert.ok(Math.abs(p.alpha - f.alpha) < 1e-9);
  }
  assert.ok(sparse.length < full.length, 'sparse should drop some');
}

{
  const assets = [
    { id: 'a', weight: 'heavy' },
    { id: 'b', weight: 'medium' },
    { id: 'c', weight: 'light' },
  ];
  const weights = [4, 2, 1];
  const total = 7;
  const pick = (i) => pickWeightedIndexStable(assets, weights, total, seed, i).id;
  assert.strictEqual(pick(0), pick(0));
  const palette = { swatches: ['#111', '#222', '#333', '#444'] };
  const layout = {
    mode: 'grid', composition: 'default', count: 20,
    scale: [0.4, 0.8], rotate: [0, 45], alpha: [60, 100],
    jitter: 10, density: 100, zTiers: 1, bleed: false, mirror: false, overlap: true,
    displacement: 0, noiseFreq: 0.005, noiseSpeed: 0.5,
  };
  const caps = { maxCount: 420, maxCountMirrored: 360, allowMirror: true };
  const g = buildPlacements({ layoutParams: layout, seed, activeAssets: assets, palette, caps, canvasW: 1000, canvasH: 700 });
  const f = buildPlacements({ layoutParams: { ...layout, mode: 'fibonacci' }, seed, activeAssets: assets, palette, caps, canvasW: 1000, canvasH: 700 });
  const gMap = Object.fromEntries(g.items.map((it) => [it.index, it.assetId]));
  const fMap = Object.fromEntries(f.items.map((it) => [it.index, it.assetId]));
  for (const i of Object.keys(gMap)) {
    if (fMap[i] !== undefined) {
      assert.strictEqual(gMap[i], fMap[i], `assetId @${i} should ignore mode`);
    }
  }
}

console.log('kernel/rng.selfcheck: OK (K0)');

{
  const zeros = { spatial: 0, color: 0, asset: 0, noise: 0 };
  const channels = [CH.dens, CH.geo, CH.attr, CH.asset, CH.color, CH.noise, CH.dyn, 'field', 'ca'];
  for (const ch of channels) {
    for (const i of [0, 1, 7, 12345]) {
      const plain = hashU32(seed, ch, i);
      assert.strictEqual(hashU32(seed, ch, i, null), plain);
      assert.strictEqual(hashU32(seed, ch, i, zeros), plain);
      assert.strictEqual(hashU01(seed, ch, i), hashU01(seed, ch, i, zeros));
    }
  }
  const spatialMut = { ...zeros, spatial: 1 };
  assert.notStrictEqual(hashU32(seed, CH.geo, 7), hashU32(seed, CH.geo, 7, spatialMut));
  assert.strictEqual(hashU32(seed, CH.color, 7), hashU32(seed, CH.color, 7, spatialMut));
  assert.strictEqual(noiseSeedFor(seed, null), seed || 444);
  assert.strictEqual(noiseSeedFor(seed, zeros), seed || 444);
  console.log('kernel/rng.selfcheck: OK (#305 zero-offset identity)');
}

// String channel registry: field/ca ride spatial offsets
{
  assert.ok(STRING_CHANNEL_GROUPS.field === 'spatial');
  assert.ok(STRING_CHANNEL_GROUPS.ca === 'spatial');
  const base = hashU32(1, 'field', 0, { spatial: 0, color: 0, asset: 0, noise: 0 });
  const moved = hashU32(1, 'field', 0, { spatial: 99, color: 0, asset: 0, noise: 0 });
  assert.notStrictEqual(base, moved, 'spatial offset must move field channel');
}
