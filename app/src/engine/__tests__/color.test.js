import { describe, it, expect } from 'vitest';
import { rotateHue, applyHarmony, colorForPlacement, resolveColors } from '../color.js';

describe('color: rotateHue', () => {
  it('returns same color for 0° rotation', () => {
    expect(rotateHue('#ff0000', 0)).toBe('#ff0000');
  });

  it('rotates red → cyan for 180°', () => {
    const out = rotateHue('#ff0000', 180);
    // red (#ff0000) → cyan (#00ffff). Allow ±1 rounding per channel.
    expect(out).toMatch(/^#(00|01)(ff|fe)(ff|fe)$/);
  });

  it('preserves greyscale (low saturation)', () => {
    expect(rotateHue('#808080', 90)).toBe('#808080');
  });

  it('passes through invalid input', () => {
    expect(rotateHue('', 30)).toBe('');
    expect(rotateHue('#x', 30)).toBe('#x');
  });
});

describe('color: applyHarmony', () => {
  const swatches = ['#ff0000', '#00ff00', '#0000ff'];

  it('returns input unchanged for "none"', () => {
    expect(applyHarmony(swatches, 'none')).toEqual(swatches);
  });

  it('rotates alternates for complementary', () => {
    const out = applyHarmony(swatches, 'complementary');
    expect(out[0]).toBe(swatches[0]);
    expect(out[1]).not.toBe(swatches[1]); // rotated 180°
  });

  it('cycles through 3 offsets for triadic', () => {
    const out = applyHarmony(swatches, 'triadic');
    expect(out[0]).toBe(swatches[0]); // offset 0
    expect(out).toHaveLength(3);
  });
});

describe('color: colorForPlacement', () => {
  const swatches = ['#aa0000', '#00aa00', '#0000aa', '#aaaa00'];
  const rng = () => 0.5;

  it('band strategy is deterministic on t', () => {
    expect(colorForPlacement({ swatches, strategy: 'band', t: 0, index: 0, rng })).toBe('#aa0000');
    expect(colorForPlacement({ swatches, strategy: 'band', t: 0.99, index: 0, rng })).toBe('#aaaa00');
  });

  it('falls back to white when no swatches', () => {
    expect(colorForPlacement({ swatches: [], strategy: 'band', t: 0, index: 0, rng })).toBe('#ffffff');
  });
});

describe('color: resolveColors', () => {
  it('substitutes both ink and accent placeholders', () => {
    const out = resolveColors('<rect fill="var(--ink)" stroke="var(--accent)"/>', '#111', '#222');
    expect(out).toContain('#111');
    expect(out).toContain('#222');
    expect(out).not.toContain('var(--');
  });
});
