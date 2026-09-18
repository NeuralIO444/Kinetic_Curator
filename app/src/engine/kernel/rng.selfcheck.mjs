// node src/engine/kernel/rng.selfcheck.mjs
// Kernel K0 acceptance (#58)

import assert from 'node:assert';
import { CH, hashU01, hashU32, rngForIndex, colorRngForIndex, pickWeightedIndexStable, noiseSeedFor } from './rng.js';
import { computePlacements } from '../placement.js';
import { buildPlacements } from '../buildPlacements.js';
import { assignColor } from './color/index.js';

const seed = 0x1a4f;

// --- hash determinism ---
assert.strictEqual(hashU32(seed, CH.attr, 7), hashU32(seed, CH.attr, 7));
assert.notStrictEqual(hashU32(seed, CH.attr, 7), hashU32(seed, CH.geo, 7));
assert.notStrictEqual(hashU01(seed, CH.dens, 3), hashU01(seed, CH.dens, 4));

// --- per-index geo streams isolated ---
{
  const a = rngForIndex(seed, CH.geo, 5);
  const b = rngForIndex(seed, CH.geo, 5);
  assert.strictEqual(a(), b());
  const c = rngForIndex(seed, CH.geo, 6);
  // different index → different stream (very high probability)
  assert.notStrictEqual(rngForIndex(seed, CH.geo, 5)(), c());
}

// --- AC1: attrs stable across count for shared indices ---
{
  const base = {
    mode: 'grid',
    seed,
    scale: [0.4, 0.8],
    rotate: [0, 45],
    alpha: [60, 100],
    jitter: 10,
    density: 100,
    zTiers: 1,
    bleed: false,
    canvasW: 1000,
    canvasH: 700,
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

// --- AC2: density skip does not reassign attrs of survivors ---
{
  const base = {
    mode: 'grid',
    seed,
    count: 50,
    scale: [0.4, 0.8],
    rotate: [0, 45],
    alpha: [60, 100],
    jitter: 10,
    zTiers: 1,
    bleed: false,
    canvasW: 1000,
    canvasH: 700,
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

// --- AC3: asset pick independent of geometry (index-stable) ---
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
  // full pipeline: same index → same assetId for two different modes (attrs/geo differ)
  const palette = { swatches: ['#111', '#222', '#333', '#444'] };
  const layout = {
    mode: 'grid',
    composition: 'default',
    count: 20,
    scale: [0.4, 0.8],
    rotate: [0, 45],
    alpha: [60, 100],
    jitter: 10,
    density: 100,
    zTiers: 1,
    bleed: false,
    mirror: false,
    overlap: true,
    displacement: 0,
    noiseFreq: 0.005,
    noiseSpeed: 0.5,
  };
  const caps = { maxCount: 420, maxCountMirrored: 360, allowMirror: true };
  const g = buildPlacements({
    layoutParams: layout,
    seed,
    activeAssets: assets,
    palette,
    caps,
    canvasW: 1000,
    canvasH: 700,
  });
  const f = buildPlacements({
    layoutParams: { ...layout, mode: 'fibonacci' },
    seed,
    activeAssets: assets,
    palette,
    caps,
    canvasW: 1000,
    canvasH: 700,
  });
  const gMap = Object.fromEntries(g.items.map((it) => [it.index, it.assetId]));
  const fMap = Object.fromEntries(f.items.map((it) => [it.index, it.assetId]));
  for (const i of Object.keys(gMap)) {
    if (fMap[i] !== undefined) {
      assert.strictEqual(gMap[i], fMap[i], `assetId @${i} should ignore mode`);
    }
  }
}

console.log('kernel/rng.selfcheck: OK (K0)');

// --- #305: zero sub-seed offsets are the identity ---
// A seed called with no offsets (the old behavior) MUST be bit-identical to
// the same seed called with all-zero offsets. The mix only takes effect when
// a stream's offset is actually non-zero, and then only on that stream.
{
  const zeros = { spatial: 0, color: 0, asset: 0, noise: 0 };
  const channels = [CH.dens, CH.geo, CH.attr, CH.asset, CH.color, CH.noise, CH.dyn, 'field', 'ca'];
  for (const ch of channels) {
    for (const i of [0, 1, 7, 12345]) {
      const plain = hashU32(seed, ch, i);
      assert.strictEqual(hashU32(seed, ch, i, null), plain,
        `hashU32 identity (null) @ ${String(ch)}/${i}`);
      assert.strictEqual(hashU32(seed, ch, i, zeros), plain,
        `hashU32 identity (zeros) @ ${String(ch)}/${i}`);
      assert.strictEqual(hashU01(seed, ch, i), hashU01(seed, ch, i, zeros),
        `hashU01 identity @ ${String(ch)}/${i}`);
    }
  }
  // stream helpers stay identical with zero offsets
  {
    const a = rngForIndex(seed, CH.geo, 5);
    const b = rngForIndex(seed, CH.geo, 5, zeros);
    assert.strictEqual(a(), b());
    const ca = colorRngForIndex(seed, 9);
    const cb = colorRngForIndex(seed, 9, zeros);
    assert.strictEqual(ca(), cb());
    const assets = [{ id: 'a' }, { id: 'b' }];
    assert.strictEqual(
      pickWeightedIndexStable(assets, [4, 2], 6, seed, 3).id,
      pickWeightedIndexStable(assets, [4, 2], 6, seed, 3, zeros).id,
      'pickWeightedIndexStable identity');
  }
  // a non-zero offset re-rolls its own stream and locks the others
  const spatialMut = { ...zeros, spatial: 1 };
  assert.notStrictEqual(hashU32(seed, CH.geo, 7), hashU32(seed, CH.geo, 7, spatialMut),
    'spatial offset must re-roll the geo stream');
  assert.notStrictEqual(hashU32(seed, CH.dyn, 7), hashU32(seed, CH.dyn, 7, spatialMut),
    'spatial offset must re-roll the dyn stream');
  assert.notStrictEqual(hashU32(seed, 'field', 7), hashU32(seed, 'field', 7, spatialMut),
    'spatial offset must re-roll the field stream');
  assert.strictEqual(hashU32(seed, CH.color, 7), hashU32(seed, CH.color, 7, spatialMut),
    'spatial offset must NOT touch the color stream');
  assert.strictEqual(hashU32(seed, CH.asset, 7), hashU32(seed, CH.asset, 7, spatialMut),
    'spatial offset must NOT touch the asset stream');
  assert.strictEqual(hashU32(seed, CH.noise, 7), hashU32(seed, CH.noise, 7, spatialMut),
    'spatial offset must NOT touch the noise stream');
  // deterministic: same offset → same stream
  assert.strictEqual(hashU32(seed, CH.geo, 7, spatialMut), hashU32(seed, CH.geo, 7, { ...zeros, spatial: 1 }));
  // end-to-end: buildPlacements with no offsets ≡ with zero offsets
  const palette = { swatches: ['#111', '#222', '#333', '#444'] };
  const layout = {
    mode: 'grid', composition: 'default', count: 20,
    scale: [0.4, 0.8], rotate: [0, 45], alpha: [60, 100],
    jitter: 10, density: 100, zTiers: 1, bleed: false, mirror: false, overlap: true,
    displacement: 5, noiseFreq: 0.005, noiseSpeed: 0.5,
  };
  const assets = [{ id: 'a', weight: 'heavy' }, { id: 'b', weight: 'medium' }];
  const caps = { maxCount: 420, maxCountMirrored: 360, allowMirror: true };
  const baseArgs = { layoutParams: layout, seed, activeAssets: assets, palette, caps, canvasW: 1000, canvasH: 700 };
  const plainPlacements = buildPlacements(baseArgs);
  const zeroPlacements = buildPlacements({ ...baseArgs, seedOffsets: zeros });
  assert.deepStrictEqual(zeroPlacements.items, plainPlacements.items,
    'buildPlacements: zero offsets must be bit-identical to no offsets');
  // a color offset re-rolls the color stream and only that stream
  const colorMut = { ...zeros, color: 77 };
  assert.notStrictEqual(hashU32(seed, CH.color, 7), hashU32(seed, CH.color, 7, colorMut),
    'color offset must re-roll the color stream');
  assert.strictEqual(hashU32(seed, CH.geo, 7), hashU32(seed, CH.geo, 7, colorMut),
    'color offset must NOT touch the geo stream');
  {
    const r1 = colorRngForIndex(seed, 3, zeros);
    const r2 = colorRngForIndex(seed, 3, colorMut);
    assert.notStrictEqual(r1(), r2(), 'color offset must change the color draw sequence');
    const a1 = assignColor({ seed, index: 3, t: 0.5, seedOffsets: zeros }, palette, 'random');
    const a2 = assignColor({ seed, index: 3, t: 0.5, seedOffsets: colorMut }, palette, 'random');
    assert.strictEqual(a1.color, assignColor({ seed, index: 3, t: 0.5 }, palette, 'random').color,
      'assignColor: zero offsets ≡ no offsets');
    let slotsDiffer = 0;
    for (let i = 0; i < 20; i++) {
      const s1 = assignColor({ seed, index: i, t: 0.5, seedOffsets: zeros }, palette, 'random').slot;
      const s2 = assignColor({ seed, index: i, t: 0.5, seedOffsets: colorMut }, palette, 'random').slot;
      if (s1 !== s2) slotsDiffer++;
    }
    assert.ok(slotsDiffer > 0,
      'assignColor: a color offset must re-roll slots (random strategy)');
  }
  // noiseSeedFor: the scalar seed for flow-field noise init. Zero offsets →
  // exactly the old `seed || 444`; a noise offset derives deterministically;
  // other streams never touch it.
  assert.strictEqual(noiseSeedFor(seed, null), seed || 444, 'noiseSeedFor identity (null)');
  assert.strictEqual(noiseSeedFor(seed, zeros), seed || 444, 'noiseSeedFor identity (zeros)');
  assert.strictEqual(noiseSeedFor(0, null), 444, 'noiseSeedFor falls back to 444 for seed 0');
  const nzNoise = noiseSeedFor(seed, { ...zeros, noise: 9 });
  assert.notStrictEqual(nzNoise, seed || 444, 'a noise offset must re-roll the noise seed');
  assert.strictEqual(nzNoise, noiseSeedFor(seed, { ...zeros, noise: 9 }),
    'noiseSeedFor must be deterministic');
  assert.strictEqual(noiseSeedFor(seed, { ...zeros, spatial: 5 }), seed || 444,
    'spatial offset must NOT touch the noise seed');
  assert.strictEqual(noiseSeedFor(seed, { ...zeros, color: 5 }), seed || 444,
    'color offset must NOT touch the noise seed');
  console.log('kernel/rng.selfcheck: OK (#305 zero-offset identity)');
}
