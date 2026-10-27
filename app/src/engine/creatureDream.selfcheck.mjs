// #1737 — dreaming rehearses the genome's instincts (never lived experience); consolidation folds short-term weights into
// the long-term record, which travels as a kc-creature/1 file.
import assert from 'node:assert/strict';
import { rehearseInstincts, consolidate, creatureRecord, parseCreatureRecord, CREATURE_RECORD_KIND, HATCH_PASSES } from './creatureDream.js';
import { createPolicy, chooseMode, reinforce, learnedFor, POLICY_SIZE, POLICY_RATES } from './creaturePolicy.js';
import { genomeFromTraits, expressGenome } from './creatureGenome.js';

const g = genomeFromTraits({ spread: 0, wing: 1, body: 1, swatch: 1 }, 77, 'dream');
const { instincts } = expressGenome(g, 0);

// 1. a newborn's rehearsal writes exactly its instincts into the long-term weights, and only those
{
  const p = createPolicy();
  const wrote = rehearseInstincts(p, instincts, HATCH_PASSES);
  assert.equal(wrote, instincts.length * HATCH_PASSES);
  const touched = new Set(instincts.map((i) => i.cell * 4 + i.mode));
  for (let i = 0; i < POLICY_SIZE; i++) {
    if (touched.has(i)) assert.ok(p.ltw[i] > 0, 'an instinct is written');
    else assert.equal(p.ltw[i], 0, 'nothing else is');
  }
  for (const ins of instincts) {
    const l = learnedFor(p, ins.cell);
    assert.equal(l.indexOf(Math.max(...l)), ins.mode, 'the newborn already knows its instinct');
  }
}

// 2. rehearsal never replays lived experience: a policy's lived learning in other cells survives a dream untouched
{
  const p = createPolicy();
  for (let t = 0; t < 200; t++) { chooseMode(p, 17, { seed: 1, key: 1, tick: t }); reinforce(p, 0.3, 0); }
  const lived = Array.from(p.ltw.subarray(17 * 4, 17 * 4 + 4));
  rehearseInstincts(p, instincts.filter((i) => i.cell !== 17), 5);
  assert.deepEqual(Array.from(p.ltw.subarray(17 * 4, 17 * 4 + 4)), lived);
  assert.equal(rehearseInstincts(p, [], 3), 0);
  assert.equal(rehearseInstincts(p, [{ cell: 99, mode: 0, strength: 1 }, null, { cell: 0 }], 1), 0, 'malformed instincts are ignored');
}

// 3. consolidation folds STW into LTW; the record round-trips and refuses junk
{
  const p = createPolicy();
  for (let t = 0; t < 100; t++) { chooseMode(p, 3, { seed: 2, key: 2, tick: t }); reinforce(p, 0.5, 0); }
  consolidate(p);
  for (let i = 0; i < POLICY_SIZE; i++) assert.ok(Math.abs(p.ltw[i] - p.stw[i]) < 1e-12 && Math.abs(p.ltw[i]) <= POLICY_RATES.wCap);
  const rec = creatureRecord(g, p);
  assert.equal(rec.kind, CREATURE_RECORD_KIND);
  const json = JSON.stringify(rec);
  assert.ok(json.length < 4096, `a creature's education is a small file (${json.length} B)`);
  const back = parseCreatureRecord(JSON.parse(json));
  assert.ok(back && back.genome.genes.length === g.genes.length);
  for (let i = 0; i < POLICY_SIZE; i++) assert.ok(Math.abs(back.policy.ltw[i] - p.ltw[i]) < 1e-4);
  assert.equal(parseCreatureRecord({ ...rec, kind: 'x' }), null);
  assert.equal(parseCreatureRecord({ ...rec, ltw: [1, 2] }), null);
  assert.equal(parseCreatureRecord({ ...rec, genome: { genes: [] } }), null);
  const wild = parseCreatureRecord({ ...rec, ltw: rec.ltw.map(() => 1e9) });
  assert.ok(wild.policy.ltw.every((v) => v === POLICY_RATES.wCap), 'weights clamp on the way in');
}

console.log('creatureDream.selfcheck: OK (#1737)');
