// #1738 — breeding from keeps: kept genomes are the pool, children cross two kept parents, and the diversity guards
// (immigrants, least-alike pairs, no repeated pair, monoculture stop) hold.
import assert from 'node:assert/strict';
import { breedFor, poolOf, IMMIGRANT_EVERY, POOL_CAP } from './creatureBreeding.js';
import { genomeFromTraits, traitsOf, genomeSimilarity, expressGenome } from '../engine/creatureGenome.js';

const A = genomeFromTraits({ spread: -16, wing: 0.82, body: 0.88, swatch: 0 }, 1, 'A');
const B = genomeFromTraits({ spread: 16, wing: 1.22, body: 1.18, swatch: 3 }, 2, 'B');
const C = genomeFromTraits({ spread: 0, wing: 1, body: 1, swatch: 1 }, 3, 'C');

// 1. too small a pool breeds nothing (Davis's wild type stands)
assert.equal(breedFor({ ring: [], seed: 1, key: 1, ordinal: 1 }), null);
assert.equal(breedFor({ ring: [[A]], seed: 1, key: 1, ordinal: 1 }), null);

// 2. two kept parents: a child that is theirs, not a clone of either
{
  const r = breedFor({ ring: [[A], [B]], seed: 9, key: 5, ordinal: 1 });
  assert.ok(r && r.genome && Array.isArray(r.pair));
  const t = traitsOf(r.genome);
  const span = { spread: 36 * 0.15, wing: 0.45 * 0.15, body: 0.35 * 0.15 }; // one point mutation's reach (MUTATION.pointSpan of each range)
  for (const k of Object.keys(span)) {
    const lo = Math.min(traitsOf(A)[k], traitsOf(B)[k]) - span[k] - 1e-9;
    const hi = Math.max(traitsOf(A)[k], traitsOf(B)[k]) + span[k] + 1e-9;
    assert.ok(t[k] >= lo && t[k] <= hi, `${k} comes from the parents (${t[k]})`);
  }
  assert.ok(genomeSimilarity(r.genome, A) < 1 || genomeSimilarity(r.genome, B) < 1);
  assert.deepEqual(breedFor({ ring: [[A], [B]], seed: 9, key: 5, ordinal: 1 }), r, 'deterministic');
  // the Spore warning: behaviour genes travel with the child, not only looks
  const e = expressGenome(r.genome, Infinity);
  assert.ok(e.instincts.length >= 0 && Object.keys(e.drives).length === 4 && e.temper.length === 4);
}

// 3. immigrants: every IMMIGRANT_EVERY-th birth is wild type
assert.equal(breedFor({ ring: [[A], [B], [C]], seed: 9, key: 5, ordinal: IMMIGRANT_EVERY }), null);

// 4. diversity: the least alike pair is preferred; the last pair is not repeated when there is a choice
{
  const near = genomeFromTraits({ spread: -15.5, wing: 0.83, body: 0.89, swatch: 0 }, 1, 'A'); // A's near-twin
  let crossed = 0;
  for (let k = 0; k < 40; k++) {
    const r = breedFor({ ring: [[A, near], [B]], seed: 4, key: k, ordinal: 1 + (k % 3) });
    if (r && r.pair.includes(2)) crossed++; // B is index 2 in the pool
  }
  assert.ok(crossed >= 30, `unlike parents are preferred (${crossed}/40 pairings include B)`);
  const first = breedFor({ ring: [[A], [B], [C]], seed: 6, key: 77, ordinal: 1 });
  const again = breedFor({ ring: [[A], [B], [C]], seed: 6, key: 77, ordinal: 1, lastPair: first.pair });
  assert.ok(!again || again.pair.join() !== first.pair.join(), 'the same pair is not repeated');
}

// 5. monoculture: a pool of clones breeds nothing
{
  const clones = [[A], [JSON.parse(JSON.stringify(A))], [genomeFromTraits(traitsOf(A), 1, 'A')]];
  assert.equal(poolOf(clones).length, 1, 'identical genomes count once');
  const twin = { ...A, genes: A.genes.map((g) => (g.kind === 'ornament' ? { ...g, value: g.value + 0.0001 } : g)) };
  assert.equal(breedFor({ ring: [[A], [twin]], seed: 2, key: 3, ordinal: 1 }), null, 'near-clones do not breed');
}

// 6. the pool is capped, newest kept; junk in the ring is ignored
{
  const ring = Array.from({ length: 30 }, (_, n) => [genomeFromTraits({ spread: n - 15, wing: 1, body: 1, swatch: n % 4 }, n, `g${n}`)]);
  ring.push([null, { genes: 'x' }, 7]);
  const pool = poolOf(ring);
  assert.equal(pool.length, POOL_CAP);
  assert.deepEqual(traitsOf(pool[pool.length - 1]), traitsOf(ring[29][0]), 'newest kept');
}

console.log('creatureBreeding.selfcheck: OK (#1738)');
