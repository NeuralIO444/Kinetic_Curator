import { describe, it, expect } from 'vitest';
import { interpolateSnapshots, favoriteToSnapshot } from '../interpolate.js';

const A = {
  seed: 100,
  paletteId: 'praystation',
  layoutParams: {
    mode: 'grid', composition: 'a',
    count: 100, jitter: 0, density: 50, zTiers: 1,
    scale: [0, 1], rotate: [0, 0], alpha: [50, 100],
  },
};
const B = {
  seed: 200,
  paletteId: 'hydra',
  layoutParams: {
    mode: 'fibonacci', composition: 'b',
    count: 200, jitter: 100, density: 100, zTiers: 5,
    scale: [1, 2], rotate: [-90, 90], alpha: [0, 50],
  },
};

describe('interpolateSnapshots', () => {
  it('returns from at t=0 and to at t=1', () => {
    expect(interpolateSnapshots(A, B, 0)).toEqual(A);
    expect(interpolateSnapshots(A, B, 1)).toEqual(B);
  });

  it('lerps numeric layout values at midpoint', () => {
    const mid = interpolateSnapshots(A, B, 0.5);
    expect(mid.layoutParams.count).toBe(150);
    expect(mid.layoutParams.jitter).toBe(50);
    expect(mid.layoutParams.density).toBe(75);
    expect(mid.seed).toBe(150);
  });

  it('lerps pair arrays component-wise', () => {
    const mid = interpolateSnapshots(A, B, 0.5);
    expect(mid.layoutParams.scale).toEqual([0.5, 1.5]);
    expect(mid.layoutParams.rotate).toEqual([-45, 45]);
  });

  it('switches discrete fields at the midpoint', () => {
    const before = interpolateSnapshots(A, B, 0.49);
    const after = interpolateSnapshots(A, B, 0.51);
    expect(before.layoutParams.mode).toBe('grid');
    expect(after.layoutParams.mode).toBe('fibonacci');
    expect(before.paletteId).toBe('praystation');
    expect(after.paletteId).toBe('hydra');
  });

  it('survives null inputs', () => {
    expect(interpolateSnapshots(null, B, 0.5)).toBe(B);
    expect(interpolateSnapshots(A, null, 0.5)).toBe(A);
  });
});

describe('favoriteToSnapshot', () => {
  it('handles legacy favorite shape', () => {
    const fav = { seed: 7, config: { layout: { mode: 'grid' }, palette: { id: 'x' } } };
    expect(favoriteToSnapshot(fav)).toEqual({
      seed: 7,
      paletteId: 'x',
      layoutParams: { mode: 'grid' },
    });
  });
});
