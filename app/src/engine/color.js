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
 * @returns {{color:string, slot:number}} the chosen swatch and its slot index.
 *   The slot is returned explicitly because palettes may repeat a hex —
 *   re-deriving it with indexOf(color) silently returns the first match.
 */
export function colorForPlacement({ swatches, strategy, t, index, rng }) {
  if (!swatches || swatches.length === 0) return { color: '#ffffff', slot: -1 };

  switch (strategy) {
    case 'band': {
      const bandIndex = Math.floor(t * swatches.length) % swatches.length;
      return { color: swatches[bandIndex], slot: bandIndex };
    }
    case 'zone': {
      // Quadrant-based: use index mod to pick zone, then swatch within
      const zone = index % 4;
      const offset = Math.floor(zone * swatches.length / 4);
      const slot = (offset + Math.floor(rng() * 2)) % swatches.length;
      return { color: swatches[slot], slot };
    }
    case 'split': {
      // Binary split: odd/even get different swatch halves
      const halfLen = Math.ceil(swatches.length / 2);
      const even = index % 2 === 0;
      const pick = Math.floor(rng() * (even ? halfLen : swatches.length - halfLen));
      const slot = even ? pick : halfLen + pick;
      return swatches[slot]
        ? { color: swatches[slot], slot }
        : { color: swatches[0], slot: 0 };
    }
    default: {
      const slot = Math.floor(rng() * swatches.length);
      return { color: swatches[slot], slot };
    }
  }
}
