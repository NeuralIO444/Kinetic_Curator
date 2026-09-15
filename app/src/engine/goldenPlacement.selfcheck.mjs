// Golden placement fixture (#37)
// Fixed seed + layout + assets → stable SHA-256 of canonical placement list.
// Update EXPECTED_HASH only when the placement engine intentionally changes.
//
//   node src/engine/goldenPlacement.selfcheck.mjs

import assert from 'node:assert';
import { createHash } from 'node:crypto';
import { buildPlacements } from './buildPlacements.js';

/** Bump intentionally when placement/weight/color pipeline changes. */
export const EXPECTED_HASH =
  '0680677b5fa52c81d3c60e9538c1173f89430971e1d89ab8c57b432062fec6d1';

const GOLDEN = {
  seed: 0x1a4f,
  layoutParams: {
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
  },
  assets: [
    { id: 'a', weight: 'heavy' },
    { id: 'b', weight: 'medium' },
    { id: 'c', weight: 'light' },
  ],
  palette: { swatches: ['#111', '#222', '#333', '#444'] },
  caps: {
    maxCount: 420,
    maxCountMirrored: 360,
    maxParticles: 200,
    allowMirror: true,
  },
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

export function runGolden() {
  const { items, safeCount } = buildPlacements({
    layoutParams: GOLDEN.layoutParams,
    seed: GOLDEN.seed,
    activeAssets: GOLDEN.assets,
    palette: GOLDEN.palette,
    caps: GOLDEN.caps,
    canvasW: GOLDEN.canvasW,
    canvasH: GOLDEN.canvasH,
  });

  assert.strictEqual(safeCount, 40);
  assert.strictEqual(items.length, 40);

  const hash = fingerprintPlacements(items, safeCount);
  assert.strictEqual(
    hash,
    EXPECTED_HASH,
    `Golden placement hash mismatch.\n  got:      ${hash}\n  expected: ${EXPECTED_HASH}\n` +
      'If the engine change is intentional, update EXPECTED_HASH in goldenPlacement.selfcheck.mjs.',
  );

  // Determinism: second call must match
  const again = buildPlacements({
    layoutParams: GOLDEN.layoutParams,
    seed: GOLDEN.seed,
    activeAssets: GOLDEN.assets,
    palette: GOLDEN.palette,
    caps: GOLDEN.caps,
    canvasW: GOLDEN.canvasW,
    canvasH: GOLDEN.canvasH,
  });
  assert.strictEqual(fingerprintPlacements(again.items, again.safeCount), hash);

  return { hash, n: items.length };
}

const result = runGolden();
console.log('goldenPlacement.selfcheck: OK', result);
