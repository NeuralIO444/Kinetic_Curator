// Golden placement fixture (#37 / kernel K0 #58)
// Fixed seed + layout + assets → stable SHA-256 of canonical placement list.
// Update EXPECTED_* hashes only when the placement engine intentionally changes.
//
//   node src/engine/goldenPlacement.selfcheck.mjs
//
// kernel.v1 — index-stable channel RNG (K0). Previous 0.8 hash:
//   0680677b5fa52c81d3c60e9538c1173f89430971e1d89ab8c57b432062fec6d1
// Expanded fixtures (harden/math-selfcheck): displacement, stratified,
// noise seedOffset — zero offsets remain bit-identical to the primary hash.

import assert from 'node:assert';
import { createHash } from 'node:crypto';
import { buildPlacements } from './buildPlacements.js';
import { KERNEL_VERSION } from './kernel/version.js';

/** Primary grid fixture — bump when placement/weight/color pipeline changes. */
export const EXPECTED_HASH =
  'e892d112b20d92b6611c0619cb6b6e2bbddb52a179d1c9dc38d3b8185690a9a2';

/** Grid + fBm displacement (noise channel active). */
export const EXPECTED_HASH_DISPLACEMENT =
  '7dae61d14441b3aca6bae359c1941c66851f85954ecf518bba2dbae9344eb85c';

/** Stratified sampler mode. */
export const EXPECTED_HASH_STRATIFIED =
  '95612a6179201f9a898ab5141b0cd13b3af804bdba8a46d895bd6692be00cf63';

/** Displacement + non-zero noise seedOffset (spatial/color/asset locked). */
export const EXPECTED_HASH_NOISE_OFFSET =
  '11d512c4b8c6020727090a792c2f7acfdde8f9afdec1f48563bd328b9cd8b8a4';

export const KERNEL_GOLDEN_VERSION = KERNEL_VERSION;

const ASSETS = [
  { id: 'a', weight: 'heavy' },
  { id: 'b', weight: 'medium' },
  { id: 'c', weight: 'light' },
];
const PALETTE = { swatches: ['#111', '#222', '#333', '#444'] };
const CAPS = {
  maxCount: 420,
  maxCountMirrored: 360,
  maxParticles: 200,
  allowMirror: true,
};

const LAYOUT_BASE = {
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

const GOLDEN = {
  seed: 0x1a4f,
  layoutParams: { ...LAYOUT_BASE, mode: 'grid' },
  assets: ASSETS,
  palette: PALETTE,
  caps: CAPS,
  canvasW: 1000,
  canvasH: 700,
};

export function fingerprintPlacements(items, safeCount) {
  const canonical = items.map((it) => ({
    x: +Number(it.x).toFixed(4),
    y: +Number(it.y).toFixed(4),
    scale: +Number(it.scale).toFixed(4),
    rotation: +Number(it.rotation).toFixed(4),
    alpha: +Number(it.alpha).toFixed(4),
    assetId: it.assetId,
    color: it.color,
    key: it.key || null,
  }));
  const payload = JSON.stringify({ safeCount, n: items.length, items: canonical });
  return createHash('sha256').update(payload).digest('hex');
}

function runFixture(label, layoutParams, seedOffsets, expected) {
  const { items, safeCount } = buildPlacements({
    layoutParams,
    seed: GOLDEN.seed,
    activeAssets: GOLDEN.assets,
    palette: GOLDEN.palette,
    caps: GOLDEN.caps,
    canvasW: GOLDEN.canvasW,
    canvasH: GOLDEN.canvasH,
    seedOffsets,
  });
  assert.strictEqual(items.length, 40, `${label}: count`);
  const hash = fingerprintPlacements(items, safeCount);
  assert.strictEqual(
    hash,
    expected,
    `Golden placement hash mismatch (${label}, ${KERNEL_GOLDEN_VERSION}).\n  got:      ${hash}\n  expected: ${expected}\n` +
      'If the engine change is intentional, update the matching EXPECTED_* in goldenPlacement.selfcheck.mjs.',
  );
  return hash;
}

export function runGolden() {
  const primary = runFixture('grid', GOLDEN.layoutParams, null, EXPECTED_HASH);

  // Zero seedOffsets must be bit-identical to the primary (no-offset) path.
  const zeroOff = runFixture(
    'grid+zeroOffsets',
    GOLDEN.layoutParams,
    { spatial: 0, color: 0, asset: 0, noise: 0 },
    EXPECTED_HASH,
  );
  assert.strictEqual(zeroOff, primary, 'zero offsets must match primary golden');

  runFixture(
    'grid+displacement',
    { ...LAYOUT_BASE, mode: 'grid', displacement: 40 },
    null,
    EXPECTED_HASH_DISPLACEMENT,
  );

  runFixture(
    'stratified',
    { ...LAYOUT_BASE, mode: 'stratified' },
    null,
    EXPECTED_HASH_STRATIFIED,
  );

  runFixture(
    'grid+displacement+noiseOffset',
    { ...LAYOUT_BASE, mode: 'grid', displacement: 40 },
    { spatial: 0, color: 0, asset: 0, noise: 0xabcd },
    EXPECTED_HASH_NOISE_OFFSET,
  );

  // Repeat primary for run-to-run identity.
  const again = buildPlacements({
    layoutParams: GOLDEN.layoutParams,
    seed: GOLDEN.seed,
    activeAssets: GOLDEN.assets,
    palette: GOLDEN.palette,
    caps: GOLDEN.caps,
    canvasW: GOLDEN.canvasW,
    canvasH: GOLDEN.canvasH,
  });
  assert.strictEqual(fingerprintPlacements(again.items, again.safeCount), primary);

  return {
    hash: primary,
    n: 40,
    version: KERNEL_GOLDEN_VERSION,
    variants: ['displacement', 'stratified', 'noiseOffset'],
  };
}

const result = runGolden();
console.log('goldenPlacement.selfcheck: OK', result);
