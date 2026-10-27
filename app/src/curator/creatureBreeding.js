// curator/creatureBreeding.js — #1738: breeding from keeps. The keep-folder is the breeding pool.
//
// After Creatures (1996) and interactive evolution (Karl Sims 1994; Galápagos): two genomes cross over at gene
// boundaries with copy errors (engine/creatureGenome.js crossover), and the scarce resource is human evaluation, so the
// population stays tiny and WHO THE HUMAN KEPT is the fitness function.
//
// KC-1 mapping (issue #1738): the genomes alive when the artist keeps a frame join the pool (curator/spawnState.js
// noteKeep, beside the trait ring the Queen already reads). When a new creature is born and the pool holds two or more
// genomes, its genome is a child of two kept parents. The guards that ship with the idea:
//   - IMMIGRANTS: every IMMIGRANT_EVERY-th birth is a wild type from Davis's roll, never bred — fresh genes keep coming;
//   - DIVERSITY: parents are chosen to differ (the least alike pair among a few seeded candidates), the last pair is not
//     repeated, and a pool that has collapsed to near-clones (MONOCULTURE) breeds nothing until immigrants refresh it;
//   - THE SPORE WARNING: a child's genes change its behaviour and fate (drives, instincts, temper, ornament), not only
//     its look — creatureGenome.js carries the behaviour genes for exactly this reason.
//
// Pure: seeded picks, so the same pool and birth give the same child (and the child's genome rides the resolver input,
// so a take replays it without the pool).
import { hashU01 } from '../engine/kernel/rng.js';
import { crossover, genomeSimilarity, sanitizeGenome } from '../engine/creatureGenome.js';

/** Every Nth birth is a wild-type immigrant, never bred. */
export const IMMIGRANT_EVERY = 4;
/** A pool whose every pair is at least this alike has collapsed: breed nothing (immigrants refresh it). */
export const MONOCULTURE = 0.97;
/** Candidate pairs considered per birth; the least alike wins. */
export const PAIR_CANDIDATES = 4;
/** The pool keeps at most this many genomes (oldest dropped first). */
export const POOL_CAP = 16;

/** The ring of keeps ([[genome …] per keep]) as one de-duplicated, capped pool, newest last. */
export function poolOf(ring) {
  const seen = new Set();
  const out = [];
  for (const list of Array.isArray(ring) ? ring : []) {
    for (const g of Array.isArray(list) ? list : []) {
      const s = sanitizeGenome(g);
      if (!s) continue;
      const k = JSON.stringify(s);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(s);
    }
  }
  return out.slice(-POOL_CAP);
}

const pick = (seed, key, salt, n) => Math.floor(hashU01(seed >>> 0, 'hierarchy', ((key >>> 0) ^ salt) >>> 0) * n) % n;

/**
 * The genome for a birth, or null when this birth should be a wild type (pool too small, an immigrant's turn, or a
 * collapsed pool). `ordinal` counts births (1-based); `key` is a stable number for this birth; `lastPair` is the
 * previous pair ([i, j] indices into the same pool) or null.
 * Returns { genome, pair } — `pair` sorted, for the next call's `lastPair`.
 */
export function breedFor({ ring, seed = 0, key = 0, ordinal = 1, lastPair = null } = {}) {
  const pool = poolOf(ring);
  if (pool.length < 2) return null;
  if (ordinal % IMMIGRANT_EVERY === 0) return null; // an immigrant's turn
  let best = null;
  for (let c = 0; c < PAIR_CANDIDATES; c++) {
    const i = pick(seed, key, 0x1b0 + c * 2, pool.length);
    let j = pick(seed, key, 0x1b1 + c * 2, pool.length - 1);
    if (j >= i) j += 1;
    const pair = i < j ? [i, j] : [j, i];
    if (lastPair && lastPair[0] === pair[0] && lastPair[1] === pair[1] && pool.length > 2) continue;
    const sim = genomeSimilarity(pool[pair[0]], pool[pair[1]]);
    if (!best || sim < best.sim) best = { pair, sim };
  }
  if (!best || best.sim >= MONOCULTURE) return null; // collapsed: let an immigrant in
  const genome = crossover(pool[best.pair[0]], pool[best.pair[1]], seed, `breed:${key >>> 0}`);
  return genome ? { genome, pair: best.pair } : null;
}
