// #1734 — the creature genome: structure genes with their own permissions and switch-on stages, crossover at gene
// boundaries, copy errors that change length, a protected body plan, and a record nothing can break.
import assert from 'node:assert/strict';
import {
  genomeFromTraits, sanitizeGenome, expressGenome, traitsOf, mutateGenome, crossover, genomeSimilarity,
  STAGES, MODES, DRIVES, MAX_GENES, GENE_RANGES, CELL_COUNT,
} from './creatureGenome.js';
import { TRAIT_RANGES, normalizeTraits } from './creature.js';

const T = { spread: 6, wing: 1.1, body: 0.95, swatch: 2 };

// 1. the wild type carries Davis's traits exactly, plus behaviour genes, led by the protected plan
{
  const g = genomeFromTraits(T, 4242, 'davis:0:1:500:350');
  assert.equal(g.genes[0].kind, 'plan');
  assert.equal(g.genes[0].protected, true);
  assert.deepEqual(traitsOf(g), normalizeTraits(T), 'genetics keep Davis\'s look');
  const kinds = new Set(g.genes.map((x) => x.kind));
  for (const k of ['trait', 'drive', 'instinct', 'temper', 'ornament']) assert.ok(kinds.has(k), `has ${k} genes`);
  assert.ok(JSON.stringify(g).length < 2048, 'a genome is under 2 KB');
  assert.deepEqual(genomeFromTraits(T, 4242, 'davis:0:1:500:350'), g, 'same seed and key, same genome');
  assert.notDeepEqual(genomeFromTraits(T, 4242, 'davis:0:2:500:350'), g, 'another birth, another genome');
}

// 2. stages: tempers switch on as a juvenile, the ornament as an adult
{
  const g = genomeFromTraits(T, 7, 'k');
  const embryo = expressGenome(g, 0);
  const juvenile = expressGenome(g, STAGES.juvenile);
  const adult = expressGenome(g, STAGES.adult);
  assert.deepEqual(embryo.temper, MODES.map(() => 0), 'no temper before juvenile');
  assert.ok(juvenile.temper.some((v) => v !== 0), 'temper on at juvenile');
  assert.equal(juvenile.flare, 0, 'no ornament before adult');
  assert.ok(adult.flare > 0, 'ornament switches on in adulthood');
  assert.equal(embryo.instincts.length, 2, 'instincts are embryo genes (rehearsed at hatch)');
}

// 3. non-brittle: any value at all comes back clamped; junk genes drop; the plan must lead exactly once
{
  const g = genomeFromTraits(T, 1, 'x');
  const wild = { v: 1, genes: g.genes.map((x) => ({ ...x, value: x.kind === 'plan' ? 0 : 1e9 * (x.value >= 0 ? 1 : -1) })) };
  wild.genes.push({ kind: 'nope', id: 'x' }, null, 5, { kind: 'drive', id: 'not-a-drive', value: 1 });
  const s = sanitizeGenome(wild);
  assert.ok(s, 'still a genome');
  const e = expressGenome(s, Infinity);
  for (const k of Object.keys(TRAIT_RANGES)) assert.ok(e.traits[k] >= TRAIT_RANGES[k].min && e.traits[k] <= TRAIT_RANGES[k].max, `${k} clamped`);
  for (const d of DRIVES) assert.ok(e.drives[d] <= GENE_RANGES.drive.max && e.drives[d] >= GENE_RANGES.drive.min);
  assert.equal(s.genes.length, g.genes.length, 'junk genes dropped');
  assert.equal(sanitizeGenome({ genes: [] }), null, 'no plan, no creature');
  assert.equal(sanitizeGenome({ genes: [g.genes[1], g.genes[0]] }), null, 'the plan leads');
  assert.equal(sanitizeGenome({ genes: [g.genes[0], g.genes[0]] }), null, 'exactly one plan');
  assert.equal(sanitizeGenome('x'), null);
  const many = { v: 1, genes: [g.genes[0], ...Array(200).fill(g.genes[1])] };
  assert.equal(sanitizeGenome(many).genes.length, MAX_GENES, 'capped');
}

// 4. mutation honours the flags: the plan never changes; length varies across many copies; result always valid
{
  const g = genomeFromTraits(T, 99, 'm');
  const lens = new Set();
  for (let n = 0; n < 200; n++) {
    const m = mutateGenome(g, 99, `m${n}`);
    assert.ok(m && m.genes[0].kind === 'plan' && m.genes[0].protected, 'plan intact');
    for (const x of m.genes) if (x.kind === 'trait' || x.kind === 'drive' || x.kind === 'temper') assert.ok(Number.isFinite(x.value));
    lens.add(m.genes.length);
  }
  assert.ok(lens.size >= 2, `offspring vary in length (${[...lens].join(',')})`);
  assert.deepEqual(mutateGenome(g, 99, 'same'), mutateGenome(g, 99, 'same'), 'deterministic');
}

// 5. crossover at gene boundaries: the child's genes come from its parents, the plan leads, deterministic
{
  const a = genomeFromTraits({ spread: -15, wing: 0.85, body: 0.9, swatch: 0 }, 1, 'a');
  const b = genomeFromTraits({ spread: 15, wing: 1.2, body: 1.15, swatch: 3 }, 2, 'b');
  const kids = Array.from({ length: 40 }, (_, n) => crossover(a, b, 5, `k${n}`));
  for (const k of kids) assert.equal(k.genes[0].kind, 'plan');
  const spreads = new Set(kids.map((k) => Math.sign(traitsOf(k).spread)));
  assert.ok(spreads.has(1) && spreads.has(-1), 'children inherit from both parents');
  assert.deepEqual(crossover(a, b, 5, 'k0'), kids[0], 'deterministic');
  const simAB = genomeSimilarity(a, b);
  const simAA = genomeSimilarity(a, a);
  assert.equal(simAA, 1);
  assert.ok(simAB < 0.8, `unlike parents read unlike (${simAB.toFixed(2)})`);
  for (const k of kids) {
    for (const x of k.genes.filter((y) => y.kind === 'instinct')) assert.ok(x.cell >= 0 && x.cell < CELL_COUNT && x.mode >= 0 && x.mode < MODES.length);
  }
}

console.log('creatureGenome.selfcheck: OK (#1734)');
