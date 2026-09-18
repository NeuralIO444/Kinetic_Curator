// node src/engine/buildPlacements.selfcheck.mjs
import assert from 'node:assert';
import { buildPlacements, pickWeighted, clampCount, MAX_ABSOLUTE_COUNT } from './buildPlacements.js';
import { mkRng } from './prng.js';

const assets = [
  { id: 'a', weight: 'heavy' },
  { id: 'b', weight: 'medium' },
  { id: 'c', weight: 'light' },
];
const palette = { swatches: ['#111', '#222', '#333', '#444'] };
const layoutParams = {
  mode: 'grid',
  composition: 'default',
  count: 40,
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

const capsBalanced = {
  maxCount: 420,
  maxCountMirrored: 360,
  maxParticles: 200,
  allowMirror: true,
};
const capsPerf = {
  maxCount: 180,
  maxCountMirrored: 140,
  maxParticles: 100,
  allowMirror: false,
};

// --- pickWeighted still deterministic ---
{
  const rngA = mkRng(7);
  const rngB = mkRng(7);
  const w = [4, 2, 1];
  const seqA = Array.from({ length: 10 }, () => pickWeighted(assets, w, 7, rngA).id);
  const seqB = Array.from({ length: 10 }, () => pickWeighted(assets, w, 7, rngB).id);
  assert.deepStrictEqual(seqA, seqB);
}

// --- clampCount ---
assert.strictEqual(clampCount(999, false, capsPerf), 180);
assert.strictEqual(clampCount(999, true, capsPerf), 140);
assert.strictEqual(clampCount(50, false, capsBalanced), 50);

// --- #269: absolute count ceiling, independent of caps ---
const noCaps = { maxCount: 1e9, maxCountMirrored: 1e9 };
assert.strictEqual(clampCount(1e7, false, noCaps), MAX_ABSOLUTE_COUNT, 'hostile count clamped, not OOM');
assert.strictEqual(clampCount(1e7, true, noCaps), MAX_ABSOLUTE_COUNT, 'ceiling holds on the mirror path');
assert.strictEqual(clampCount(999, false, capsPerf), 180, 'caps still bind below the ceiling');
assert.strictEqual(clampCount(800, false, { maxCount: 800, maxCountMirrored: 800 }), 800, 'richest tier unaffected');

// --- same inputs → same items ---
const opts = {
  layoutParams,
  seed: 0x1a4f,
  activeAssets: assets,
  palette,
  caps: capsBalanced,
  canvasW: 1000,
  canvasH: 700,
};
const a = buildPlacements(opts);
const b = buildPlacements(opts);
assert.strictEqual(a.items.length, b.items.length);
assert.strictEqual(a.safeCount, 40);
for (let i = 0; i < a.items.length; i++) {
  assert.strictEqual(a.items[i].assetId, b.items[i].assetId);
  assert.strictEqual(a.items[i].x, b.items[i].x);
  assert.strictEqual(a.items[i].y, b.items[i].y);
  assert.strictEqual(a.items[i].color, b.items[i].color);
}

// --- caps change density ---
const live = buildPlacements({
  ...opts,
  layoutParams: { ...layoutParams, count: 500 },
  caps: capsPerf,
});
const final = buildPlacements({
  ...opts,
  layoutParams: { ...layoutParams, count: 500 },
  caps: { maxCount: 800, maxCountMirrored: 650, maxParticles: 350, allowMirror: true },
});
assert.ok(live.safeCount <= 180, `perf clamp: ${live.safeCount}`);
assert.ok(final.safeCount > live.safeCount, 'uncapped-style caps should allow denser result');
assert.ok(final.items.length > live.items.length);

// --- mirror doubles when allowed ---
const mirrored = buildPlacements({
  ...opts,
  layoutParams: { ...layoutParams, count: 20, mirror: true },
  caps: capsBalanced,
});
assert.strictEqual(mirrored.items.length, mirrored.safeCount * 2);
assert.ok(mirrored.items.some((it) => it._mirrored));

const noMirrorCap = buildPlacements({
  ...opts,
  layoutParams: { ...layoutParams, count: 20, mirror: true },
  caps: capsPerf, // allowMirror: false
});
assert.strictEqual(noMirrorCap.items.length, noMirrorCap.safeCount);
assert.ok(!noMirrorCap.items.some((it) => it._mirrored));

// --- empty assets ---
const empty = buildPlacements({ ...opts, activeAssets: [] });
assert.deepStrictEqual(empty.items, []);
assert.strictEqual(empty.safeCount, 0);

console.log('buildPlacements.selfcheck: OK', {
  balanced: a.items.length,
  perfClamped: live.items.length,
  highCaps: final.items.length,
  mirrored: mirrored.items.length,
});
