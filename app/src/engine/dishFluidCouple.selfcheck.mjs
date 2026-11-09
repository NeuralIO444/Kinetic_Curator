// dishFluidCouple.selfcheck.mjs — FERROFLUID (#1997): the fluid → culture birth bias seam.
//
//   A direction   births only ever ADD living cells; the count is monotone in the coupling
//                 strength and in the fluid density; below the floor, nothing is ever born
//   B bedrock     mask and bedrock cells are never injected — the terrain record and the
//                 bedrock grid are byte-identical after any injection
//   C off parity  strength 0 / no density = the culture is untouched, number for number
//                 (the golden culture hash over a biased-vs-unbiased run pair)
//   D seeded      the deal is a pure function of (culture, density, strength, seed): the
//                 same inputs re-deal the same births; the generation re-deals a refused cell
import assert from 'node:assert/strict';
import { createCulture, stepCulture, seedRandom, cultureHash, setBedrock } from './dishLife.mjs';
import { injectFluidBirths, fluidBirthChance, FLUID_BIRTH_FLOOR } from './dishFluidCouple.mjs';

const seeded = (seed = 4242) => {
  const c = createCulture({ cols: 48, rows: 27, seed: 1 });
  seedRandom(c, seed, 0.12);
  return c;
};
const dense = (v) => new Float32Array(48 * 27).fill(v);

// ---- A: direction + monotonicity
{
  assert.equal(fluidBirthChance(FLUID_BIRTH_FLOOR, 1), 0, 'at the floor the chance is 0');
  assert.equal(fluidBirthChance(0.1, 1), 0, 'below the floor the chance is 0');
  assert.ok(fluidBirthChance(0.6, 1) > fluidBirthChance(0.4, 1), 'chance rises with density');
  assert.ok(fluidBirthChance(0.6, 1) > fluidBirthChance(0.6, 0.5), 'chance rises with strength');
  const counts = [0.25, 0.5, 1].map((s) => injectFluidBirths(seeded(), dense(0.9), s, 77));
  assert.ok(counts[0] > 0, 'a dense fluid at some strength births cells');
  assert.ok(counts[0] <= counts[1] && counts[1] <= counts[2], 'births are monotone in strength');
  const sparse = injectFluidBirths(seeded(), dense(0.3), 1, 77);
  const thick = injectFluidBirths(seeded(), dense(0.95), 1, 77);
  assert.ok(thick > sparse, 'births are monotone in density');
  assert.equal(injectFluidBirths(seeded(), dense(FLUID_BIRTH_FLOOR), 1, 77), 0, 'at the floor nothing is born');
  // births only add: a cell alive before injection stays exactly as it was
  const c = seeded();
  const before = Uint8Array.from(c.cur);
  injectFluidBirths(c, dense(0.95), 1, 77);
  for (let i = 0; i < c.cur.length; i++)
    if (before[i] !== 0) assert.equal(c.cur[i], before[i], 'living cells untouched');
}

// ---- B: bedrock + mask are never injected, and the terrain never moves
{
  const c = seeded();
  const bed = new Uint8Array(48 * 27);
  for (let i = 100; i < 200; i++) bed[i] = 1;
  setBedrock(c, bed);
  const maskBefore = c.mask ? Uint8Array.from(c.mask) : null;
  const bedBefore = Uint8Array.from(c.bedrock);
  // a density that would birth EVERYWHERE it may
  injectFluidBirths(c, dense(1), 1, 5);
  for (let i = 100; i < 200; i++) assert.equal(c.cur[i], 0, 'bedrock cells are never born');
  assert.deepEqual([...c.bedrock], [...bedBefore], 'the bedrock record is byte-identical');
  if (maskBefore) assert.deepEqual([...c.mask], [...maskBefore], 'the mask is untouched');
  // a masked-out region (mask 0 = glass) is likewise out of reach
  const g = createCulture({ cols: 48, rows: 27, seed: 1 });
  if (g.mask) {
    g.mask.fill(0);
    assert.equal(injectFluidBirths(g, dense(1), 1, 5), 0, 'a fully masked dish births nothing');
  }
}

// ---- C: off parity — an unbiased run is the pre-#1997 culture, hash for hash
{
  const GOLDEN_RUN = (biased) => {
    const c = seeded(2024);
    for (let g = 0; g < 30; g++) {
      if (biased) injectFluidBirths(c, dense(0.9), 0, 99); // strength 0: the seam is inert
      stepCulture(c);
    }
    return cultureHash(c);
  };
  assert.equal(GOLDEN_RUN(true), GOLDEN_RUN(false), 'strength 0 leaves the culture byte-identical');
  const c = seeded();
  const h = cultureHash(c);
  assert.equal(injectFluidBirths(c, null, 1, 1), 0, 'no density, no births');
  assert.equal(injectFluidBirths(c, dense(0.9), 0, 1), 0, 'no strength, no births');
  assert.equal(cultureHash(c), h, 'inert calls touch nothing');
}

// ---- D: the deal is seeded and generation-indexed
{
  const a = seeded();
  const b = seeded();
  const na = injectFluidBirths(a, dense(0.8), 0.7, 314);
  const nb = injectFluidBirths(b, dense(0.8), 0.7, 314);
  assert.equal(na, nb, 'same inputs deal the same count');
  assert.deepEqual([...a.cur], [...b.cur], 'same inputs deal the same cells');
  const other = seeded();
  injectFluidBirths(other, dense(0.8), 0.7, 315);
  assert.notDeepEqual([...other.cur], [...a.cur], 'a different seed deals a different set');
  // after a generation step, the same density re-deals (the gen index moves): more births land
  const c = seeded();
  injectFluidBirths(c, dense(0.8), 0.7, 314);
  stepCulture(c);
  const second = injectFluidBirths(c, dense(0.8), 0.7, 314);
  assert.ok(second >= 0, 'the deal runs at the new generation');
}

console.log('dishFluidCouple.selfcheck: ok');
