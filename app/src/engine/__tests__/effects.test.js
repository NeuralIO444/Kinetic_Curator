import { describe, it, expect } from 'vitest';
import { applyParticles, applyBlastRadius, applyEcho, processEffects } from '../effects.js';

const ctx = { canvasW: 1000, canvasH: 700, seed: 42, swatches: ['#ff0000', '#00ff00'] };

describe('effects: applyParticles (JS fallback)', () => {
  it('is a no-op when disabled', () => {
    const out = applyParticles([], { enabled: false, count: 100 }, ctx);
    expect(out).toEqual([]);
  });

  it('adds N particles when enabled', () => {
    const out = applyParticles([], { enabled: true, count: 16, speed: 1, motionEnabled: false }, ctx);
    expect(out).toHaveLength(16);
    expect(out[0].particle).toBe(true);
    expect(out[0]).toHaveProperty('x');
    expect(out[0]).toHaveProperty('y');
    expect(out[0]).toHaveProperty('color');
  });

  it('is deterministic across calls', () => {
    const a = applyParticles([], { enabled: true, count: 16, speed: 1, motionEnabled: true, motionType: 'swarm', tick: 100 }, ctx);
    const b = applyParticles([], { enabled: true, count: 16, speed: 1, motionEnabled: true, motionType: 'swarm', tick: 100 }, ctx);
    expect(a.map(p => [p.x, p.y])).toEqual(b.map(p => [p.x, p.y]));
  });

  it('produces different positions for different motion types', () => {
    const flow = applyParticles([], { enabled: true, count: 4, speed: 1, motionEnabled: true, motionType: 'flow', tick: 500 }, ctx);
    const orbit = applyParticles([], { enabled: true, count: 4, speed: 1, motionEnabled: true, motionType: 'orbit', tick: 500 }, ctx);
    expect(flow.map(p => [p.x, p.y])).not.toEqual(orbit.map(p => [p.x, p.y]));
  });
});

describe('effects: applyBlastRadius', () => {
  it('is a no-op when disabled', () => {
    const input = [{ x: 100, y: 100, particle: true }];
    expect(applyBlastRadius(input, { enabled: false, radius: 200, force: 1 })).toEqual(input);
  });

  it('pushes points within radius outward from center', () => {
    const items = [{ x: 510, y: 360, particle: true }]; // close to canvas centre (500, 350)
    const out = applyBlastRadius(items, { enabled: true, radius: 100, force: 1 }, { canvasW: 1000, canvasH: 700 });
    expect(out[0].x).toBeGreaterThan(items[0].x);
  });

  it('leaves points outside radius untouched', () => {
    const items = [{ x: 900, y: 600, particle: true }];
    const out = applyBlastRadius(items, { enabled: true, radius: 50, force: 1 }, { canvasW: 1000, canvasH: 700 });
    expect(out[0].x).toBe(items[0].x);
    expect(out[0].y).toBe(items[0].y);
  });
});

describe('effects: applyEcho', () => {
  it('multiplies items by (echoes + 1) when enabled', () => {
    const items = [{ x: 0, y: 0, scale: 1, alpha: 100 }];
    const out = applyEcho(items, { enabled: true, count: 3, decay: 0.5 });
    expect(out).toHaveLength(4); // original + 3 echoes
    expect(out[1].alpha).toBeLessThan(out[0].alpha);
  });
});

describe('effects: processEffects (pipeline)', () => {
  it('runs without throwing on empty config', () => {
    const out = processEffects([{ x: 0, y: 0 }], {}, ctx);
    expect(Array.isArray(out)).toBe(true);
  });
});
