// Placement engine — orchestrates mode positions + depth + noise warp
// Kernel K0: density + attributes index-stable; per-index geo streams (#58)
// Kernel K1: displacement uses instanced noise from seed (#59)

import { createNoise } from './noise.js';
import { MODE_FNS, randomPos } from './placement/modes.js';
import { CH, hashU01, hashU32, rngForIndex } from './kernel/rng.js';

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Compute placement positions for a given layout mode.
 * @returns {{ x, y, scale, rotation, alpha, index, t, zTier }[]}
 */
export function computePlacements({
  mode, count, seed, scale, rotate, alpha, jitter, density, zTiers, bleed,
  canvasW, canvasH, caGrid,
  displacement = 0, noiseFreq = 0.005, noiseSpeed = 0.5,
}) {
  const placements = [];

  const bx = bleed ? canvasW * 0.2 : 0;
  const by = bleed ? canvasH * 0.2 : 0;
  const effectiveW = canvasW + bx * 2;
  const effectiveH = canvasH + by * 2;
  const tiers = Math.max(1, zTiers || 1);
  const posFn = MODE_FNS[mode] || randomPos;

  // K1: noise field isolated to this eval (channel subseed)
  const noise = displacement > 0
    ? createNoise(hashU32(seed, CH.noise, 0))
    : null;

  for (let i = 0; i < count; i++) {
    const t = count > 1 ? i / (count - 1) : 0.5;

    if (density < 100 && hashU01(seed, CH.dens, i) * 100 > density) continue;

    const rng = rngForIndex(seed, CH.geo, i);

    let pos;
    if (mode === 'ca') {
      pos = posFn(i, count, effectiveW, effectiveH, rng, jitter, caGrid);
    } else if (mode === 'orbit' || mode === 'abacus') {
      pos = posFn(i, count, effectiveW, effectiveH, rng, seed);
    } else if (posFn === randomPos) {
      pos = randomPos(effectiveW, effectiveH, rng);
    } else {
      pos = posFn(i, count, effectiveW, effectiveH, rng, jitter);
    }

    if (noise && displacement > 0) {
      const nt = (seed & 0xffff) * 0.02 * noiseSpeed;
      const dx = noise.fBm3D(pos.x * noiseFreq, pos.y * noiseFreq, nt, 3) * displacement;
      const dy = noise.fBm3D(pos.x * noiseFreq + 200, pos.y * noiseFreq + 200, nt + 100, 3) * displacement;
      pos.x += dx;
      pos.y += dy;
    }

    if (bleed) {
      pos.x -= bx;
      pos.y -= by;
    }

    const zTier = i % tiers;
    const depthFactor = tiers > 1 ? 0.6 + (zTier / (tiers - 1)) * 0.8 : 1.0;

    const s = lerp(scale[0], scale[1], hashU01(seed, CH.attr, i * 3)) * depthFactor;
    const r = lerp(rotate[0], rotate[1], hashU01(seed, CH.attr, i * 3 + 1));
    const a = lerp(alpha[0], alpha[1], hashU01(seed, CH.attr, i * 3 + 2));

    placements.push({ ...pos, scale: s, rotation: r, alpha: a, index: i, t, zTier });
  }

  return placements;
}
