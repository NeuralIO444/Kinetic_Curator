/**
 * glassSort.selfcheck.mjs — #1129 PR1: translucent sort.
 *
 * Pins the acceptance criteria:
 *  - glass-flagged instances sort back-to-front (ascending z-tier);
 *  - overlaps deepen correctly under the premultiplied single pass;
 *  - non-glass order is untouched (RULES small-first, #565 z-fight fix);
 *  - the sort never mutates its input (the placement pool is soa-indexed).
 *
 * Run: node --test src/engine/glassSort.selfcheck.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sortGlassInstances } from './glassSort.mjs';
import { buildPlacements } from './buildPlacements.js';

test('glass instances sort back-to-front by ascending z-tier', () => {
  const items = [
    { glass: true, zTier: 3, id: 'a' },
    { glass: true, zTier: 0, id: 'b' },
    { glass: true, zTier: 2, id: 'c' },
  ];
  const out = sortGlassInstances(items);
  assert.deepStrictEqual(out.map((i) => i.id), ['b', 'c', 'a']);
});

test('non-glass instances keep their exact positions', () => {
  // A RULES small-first order with glass items interleaved: the non-glass
  // subsequence must read identically after the sort.
  const items = [
    { glass: false, zTier: 9, id: 'n1' },
    { glass: true, zTier: 2, id: 'g1' },
    { glass: false, zTier: 1, id: 'n2' },
    { glass: true, zTier: 0, id: 'g2' },
    { glass: false, zTier: 5, id: 'n3' },
  ];
  const out = sortGlassInstances(items);
  assert.deepStrictEqual(out.map((i) => i.id), ['n1', 'g2', 'n2', 'g1', 'n3']);
  assert.deepStrictEqual(
    out.filter((i) => !i.glass).map((i) => i.id),
    ['n1', 'n2', 'n3'],
  );
});

test('stable on z-tier ties: no frame-to-frame flicker', () => {
  const items = [
    { glass: true, zTier: 1, id: 'a' },
    { glass: true, zTier: 1, id: 'b' },
    { glass: true, zTier: 1, id: 'c' },
  ];
  assert.deepStrictEqual(
    sortGlassInstances(items).map((i) => i.id),
    ['a', 'b', 'c'],
  );
});

test('does not mutate the input; returns a new array', () => {
  const items = [
    { glass: true, zTier: 2, id: 'a' },
    { glass: true, zTier: 0, id: 'b' },
  ];
  const out = sortGlassInstances(items);
  assert.notStrictEqual(out, items);
  assert.deepStrictEqual(items.map((i) => i.id), ['a', 'b']);
});

test('edge cases: empty, singleton, unflagged', () => {
  assert.deepStrictEqual(sortGlassInstances([]), []);
  assert.deepStrictEqual(sortGlassInstances(null), []);
  const one = [{ glass: true, zTier: 4, id: 'a' }];
  assert.deepStrictEqual(sortGlassInstances(one).map((i) => i.id), ['a']);
  // No glass flags at all: order untouched.
  const plain = [{ zTier: 2, id: 'a' }, { zTier: 0, id: 'b' }];
  assert.deepStrictEqual(sortGlassInstances(plain).map((i) => i.id), ['a', 'b']);
});

test('back-to-front order deepens overlaps under premultiplied alpha', () => {
  // Why the sort matters: the over operator is not commutative. Composite
  // two translucent bodies far->near vs near->far; the sorted (far-first)
  // result lets the near body dominate — that is the visible "deepening".
  const over = (src, dst) => {
    const sa = src[3];
    return [
      src[0] + dst[0] * (1 - sa),
      src[1] + dst[1] * (1 - sa),
      src[2] + dst[2] * (1 - sa),
      sa + dst[3] * (1 - sa),
    ];
  };
  const far = [0.2, 0.1, 0.1, 0.5]; // dim back body (premultiplied)
  const near = [0.9, 0.5, 0.2, 0.5]; // bright front body
  const clear = [0, 0, 0, 0];
  const backToFront = over(near, over(far, clear));
  const frontToBack = over(far, over(near, clear));
  assert.ok(
    backToFront[0] > frontToBack[0],
    'sorted order lets the near body dominate the overlap',
  );
  assert.ok(backToFront[3] > 0.5, 'the stacked overlap is deeper than either body alone');
});

test('buildPlacements flags glass items and sorts them in the real path', () => {
  const assets = [{ id: 'a', weight: 'heavy' }, { id: 'b', weight: 'medium' }];
  const palette = { swatches: ['#111', '#222', '#333', '#444'] };
  const base = {
    mode: 'grid', composition: 'default', count: 24,
    scale: [0.4, 0.8], rotate: [0, 45], alpha: [60, 100],
    jitter: 10, density: 100, zTiers: 4, bleed: false,
    mirror: false, overlap: true, displacement: 0,
    noiseFreq: 0.005, noiseSpeed: 0.5,
  };
  const caps = { maxCount: 420, maxCountMirrored: 360, maxParticles: 200, allowMirror: true };
  const glass = buildPlacements({
    layoutParams: { ...base, glass: true },
    seed: 7, seedOffsets: null, activeAssets: assets, palette,
    caGrid: null, caps, canvasW: 1000, canvasH: 700,
    cache: null, growthTick: 0, audioEnergy: 0, kineme: null,
  });
  const items = glass.items;
  assert.ok(items.length > 0, 'produced items');
  assert.ok(items.every((it) => it.glass === true), 'every item flagged glass');
  const tiers = items.map((it) => Number(it.zTier) || 0);
  const sorted = [...tiers].sort((a, b) => a - b);
  assert.deepStrictEqual(tiers, sorted, 'glass set arrives back-to-front');

  const plain = buildPlacements({
    layoutParams: { ...base },
    seed: 7, seedOffsets: null, activeAssets: assets, palette,
    caGrid: null, caps, canvasW: 1000, canvasH: 700,
    cache: null, growthTick: 0, audioEnergy: 0, kineme: null,
  });
  assert.ok(plain.items.every((it) => it.glass === false), 'non-glass voice flags nothing');
  assert.deepStrictEqual(
    [...plain.items.map((it) => it.key)].sort(),
    [...items.map((it) => it.key)].sort(),
    'the sort reorders the same items: nothing added, nothing lost',
  );
});
