import { describe, it, expect } from 'vitest';
import { computePlacements } from '../placement.js';

const baseArgs = {
  mode: 'grid',
  count: 16,
  seed: 0x12345678,
  scale: [1, 1],
  rotate: [0, 0],
  alpha: [100, 100],
  jitter: 0,
  density: 50,
  canvasW: 1000,
  canvasH: 700,
  caGrid: null,
};

describe('placement: computePlacements', () => {
  it('returns exactly `count` items', () => {
    expect(computePlacements({ ...baseArgs, count: 32 })).toHaveLength(32);
  });

  it('is deterministic for the same seed', () => {
    const a = computePlacements(baseArgs);
    const b = computePlacements(baseArgs);
    expect(a).toEqual(b);
  });

  it('changes when seed changes', () => {
    const a = computePlacements({ ...baseArgs, mode: 'swarm', seed: 1 });
    const b = computePlacements({ ...baseArgs, mode: 'swarm', seed: 2 });
    expect(a).not.toEqual(b);
  });

  it('keeps grid output within canvas bounds (no jitter)', () => {
    const items = computePlacements(baseArgs);
    for (const it of items) {
      expect(it.x).toBeGreaterThanOrEqual(0);
      expect(it.x).toBeLessThanOrEqual(baseArgs.canvasW);
      expect(it.y).toBeGreaterThanOrEqual(0);
      expect(it.y).toBeLessThanOrEqual(baseArgs.canvasH);
    }
  });

  it('falls back to random for unknown mode', () => {
    const items = computePlacements({ ...baseArgs, mode: '__unknown__' });
    expect(items).toHaveLength(baseArgs.count);
  });
});
