// Placement engine — orchestrates mode positions + depth + noise warp
import { mkRng } from './prng.js';
import { fBm3D } from './noise.js';
import { MODE_FNS, randomPos } from './placement/modes.js';

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
  const rng = mkRng(seed);
  const placements = [];

  const bx = bleed ? canvasW * 0.2 : 0;
  const by = bleed ? canvasH * 0.2 : 0;
  const effectiveW = canvasW + bx * 2;
  const effectiveH = canvasH + by * 2;
  const tiers = Math.max(1, zTiers || 1);
  const posFn = MODE_FNS[mode] || randomPos;

  for (let i = 0; i < count; i++) {
    const t = count > 1 ? i / (count - 1) : 0.5;

    if (density < 100 && rng() * 100 > density) continue;

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

    if (displacement > 0) {
      const nt = (seed & 0xffff) * 0.02;
      const dx = fBm3D(pos.x * noiseFreq, pos.y * noiseFreq, nt, 3) * displacement;
      const dy = fBm3D(pos.x * noiseFreq + 200, pos.y * noiseFreq + 200, nt + 100, 3) * displacement;
      pos.x += dx;
      pos.y += dy;
    }

    if (bleed) {
      pos.x -= bx;
      pos.y -= by;
    }

    const zTier = i % tiers;
    const depthFactor = tiers > 1 ? 0.6 + (zTier / (tiers - 1)) * 0.8 : 1.0;
    const s = lerp(scale[0], scale[1], rng()) * depthFactor;
    const r = lerp(rotate[0], rotate[1], rng());
    const a = lerp(alpha[0], alpha[1], rng());

    placements.push({ ...pos, scale: s, rotation: r, alpha: a, index: i, t, zTier });
  }

  return placements;
}
