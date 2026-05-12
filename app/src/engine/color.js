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
