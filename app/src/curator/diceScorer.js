// diceScorer.js — the scorer interface behind the tasteful dice.
//
// A scorer is { id: string, score(candidate) => number } where
// candidate = { layoutId, assetIds: string[] }. Higher = more keep-worthy.
//
// The dice imports only this interface. Phase B (MLX taste.json) ships a
// scorer with the same shape — e.g. { id: 'mlx-head-v1', score } — and the
// dice, the UI, and the crown log never change. That is the cross-pollination
// contract: MLX becomes the trio's judgment, not a rewrite.
//
// createPersonaScorer is the interim: LOIS's taste as metadata heuristics.
// It is honest about what it is — role coverage, category coherence, tag
// overlap — and it is meant to be outgrown.

/** Role predicates mirror the dealer's (curator/dice.js) so coverage is checkable. */
const isLead = (a) => a && (a.weight === 'heavy' || a.density === 'solid');
const isTexture = (a) => a && (a.density === 'sparse' || a.category === 'dots');
const isAccent = (a) =>
  a &&
  (a.category === 'linework' ||
    (Array.isArray(a.tags) && a.tags.some((t) => t === 'glyph' || t === 'letter' || t === 'emblem')));

export function createPersonaScorer({ assetsById } = {}) {
  const byId = assetsById || new Map();
  const lookup = (id) => byId.get(id);

  function score(candidate) {
    const ids = candidate && Array.isArray(candidate.assetIds) ? candidate.assetIds : [];
    const cast = ids.map(lookup).filter(Boolean);
    if (!cast.length) return 0;
    let s = 0;
    // Role coverage: a cast with an anchor, air, and jewelry reads as intentional.
    if (cast.some(isLead)) s += 0.3;
    if (cast.some(isTexture)) s += 0.2;
    if (cast.some(isAccent)) s += 0.2;
    // Category coherence (the weak prior, as a scoring signal): pairs that share
    // a category usually hang together — but all-same is monotony, not harmony.
    let same = 0;
    let pairs = 0;
    let sharedTags = 0;
    for (let i = 0; i < cast.length; i++) {
      for (let j = i + 1; j < cast.length; j++) {
        pairs++;
        if (cast[i].category && cast[i].category === cast[j].category) same++;
        const ti = new Set(cast[i].tags || []);
        for (const t of cast[j].tags || []) if (ti.has(t)) sharedTags++;
      }
    }
    if (pairs) {
      const frac = same / pairs;
      s += frac >= 1 ? 0.05 : frac * 0.2; // all-same gets almost nothing
      s += Math.min(0.1, sharedTags / pairs * 0.05);
    }
    // Size sweet spot: 3–4 is a cast; 2 is a duet, 5 is a crowd.
    if (cast.length === 3 || cast.length === 4) s += 0.1;
    return Math.min(1, Math.max(0, s));
  }

  return { id: 'persona-v1', score };
}
