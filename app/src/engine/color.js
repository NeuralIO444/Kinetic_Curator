// Color engine — palette shift and per-placement color computation
// Pure logic, no React

/**
 * Choose a swatch color for a placement.
 * @param {object} opts
 * @param {string[]} opts.swatches - palette swatch array
 * @param {string} opts.strategy  - 'band' | 'zone' | 'split'
 * @param {number} opts.t         - normalized position 0–1
 * @param {number} opts.index     - placement index
 * @param {Function} opts.rng     - seeded RNG function
 */
export function colorForPlacement({ swatches, strategy, t, index, rng }) {
  if (!swatches || swatches.length === 0) return '#ffffff';

  switch (strategy) {
    case 'band': {
      const bandIndex = Math.floor(t * swatches.length) % swatches.length;
      return swatches[bandIndex];
    }
    case 'zone': {
      // Quadrant-based: use index mod to pick zone, then swatch within
      const zone = index % 4;
      const offset = Math.floor(zone * swatches.length / 4);
      return swatches[(offset + Math.floor(rng() * 2)) % swatches.length];
    }
    case 'split': {
      // Binary split: odd/even get different swatch halves
      const half = index % 2 === 0
        ? swatches.slice(0, Math.ceil(swatches.length / 2))
        : swatches.slice(Math.ceil(swatches.length / 2));
      return half[Math.floor(rng() * half.length)] || swatches[0];
    }
    default:
      return swatches[Math.floor(rng() * swatches.length)];
  }
}

/**
 * Resolve CSS custom property colors for an SVG string.
 * Replaces var(--ink) and var(--accent) with actual hex values.
 */
export function resolveColors(svgStr, ink, accent) {
  return svgStr
    .replace(/var\(--ink\)/g, ink)
    .replace(/var\(--accent\)/g, accent);
}

// ── Hue manipulation for color harmony ──────────────────────────────────────

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = h.length === 3
    ? h.split('').map(c => c + c).join('')
    : h.padEnd(6, '0').slice(0, 6);
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
}

function rgbToHex(r, g, b) {
  const to = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return '#' + to(r) + to(g) + to(b);
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h *= 60;
  }
  return [h, s, l];
}

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  if (s === 0) {
    const v = l * 255;
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hk = h / 360;
  const tc = (t) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [tc(hk + 1 / 3) * 255, tc(hk) * 255, tc(hk - 1 / 3) * 255];
}

/**
 * Rotate the hue of a hex color by `degrees`.
 */
export function rotateHue(hex, degrees) {
  if (!hex || hex.length < 4) return hex;
  const [r, g, b] = hexToRgb(hex);
  const [h, s, l] = rgbToHsl(r, g, b);
  if (s < 0.05) return hex; // skip near-greyscale to keep neutrals neutral
  const [r2, g2, b2] = hslToRgb(h + degrees, s, l);
  return rgbToHex(r2, g2, b2);
}

const HARMONY_OFFSETS = {
  none: [0],
  complementary: [0, 180],
  triadic: [0, 120, 240],
  analogous: [0, 30, -30],
};

/**
 * Expand a palette by applying a harmony rule. Returns the augmented swatch list.
 * 'none' is a no-op pass-through.
 */
export function applyHarmony(swatches, harmony) {
  const offsets = HARMONY_OFFSETS[harmony] || HARMONY_OFFSETS.none;
  if (offsets.length === 1 && offsets[0] === 0) return swatches;
  const out = [];
  for (let i = 0; i < swatches.length; i++) {
    const offset = offsets[i % offsets.length];
    out.push(offset === 0 ? swatches[i] : rotateHue(swatches[i], offset));
  }
  return out;
}
