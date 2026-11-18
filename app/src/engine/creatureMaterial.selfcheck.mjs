// creatureMaterial.selfcheck.mjs — creature PAINT P2 (#2339; spec creature-paint-drive §1.4, §1.5).
//
// The MATERIAL gene gets its value space: a creature's material is one of its body's Canon style's materials
// (data/canon/materials.js). The style is the body asset's own (data/assetStyle.js assetStyle), passed in by the
// caller so the engine stays pure. Children inherit it like LOOK and VOICE; a hand mutation re-picks another
// material of the same style; an old record with a null material still loads and breeds.
import assert from 'node:assert/strict';
import { assembleCreature, sanitizeCreatureRecord } from './creatureAssembler.js';
import { breedCreature, handEditRecord } from './creatureBreed.js';
import { materialsForStyle, materialStyle, materialById } from '../data/canon/materials.js';
import { CANON_STYLE_IDS } from '../data/canon/styles.js';
import { assetStyle } from '../data/assetStyle.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n += 1;
  console.log(`  ok - ${name}`);
};
const PTS = [
  { x: 50, y: 5, role: 'H' },
  { x: 10, y: 60, role: 'L' },
  { x: 90, y: 60, role: 'L' },
];
const mat = (rec) => rec.genome.find((g) => g.family === 'MATERIAL' && g.id === 'material');
const born = (assetId, seed, styleId) => assembleCreature({ assetId, points: PTS, seed, styleId });

ok('assembly deals a material of the body style, seeded, and it is never part of the record id', () => {
  for (const style of CANON_STYLE_IDS) {
    const a = born('org_blob_01', 7, style);
    const g = mat(a);
    assert.equal(materialStyle(g.value), style, style);
    assert.equal(g.source, 'dealt');
    assert.deepEqual(born('org_blob_01', 7, style), a, 'same seed + asset + style → the identical record');
    assert.equal(a.id, born('org_blob_01', 7, null).id, 'the material does not move the id');
    assert.ok(sanitizeCreatureRecord(a), 'the door loads a painted record');
  }
  // the seed spreads across a style's materials (not always the first)
  const seen = new Set(Array.from({ length: 24 }, (_, i) => mat(born('org_blob_01', i, 'op')).value));
  assert.equal(seen.size, materialsForStyle('op').length);
});

ok('no style (or an unknown one) keeps the old stub: null, source none', () => {
  for (const styleId of [null, undefined, 'nope']) {
    const g = mat(born('org_blob_01', 3, styleId));
    assert.equal(g.value, null);
    assert.equal(g.source, 'none');
  }
});

ok('the door: null or a real material loads; any other string is refused', () => {
  const a = born('org_blob_01', 5, 'swiss');
  const forged = { ...a, genome: a.genome.map((g) => (g.family === 'MATERIAL' ? { ...g, value: 'chrome' } : g)) };
  assert.equal(sanitizeCreatureRecord(forged), null);
  const old = {
    ...a,
    genome: a.genome.map((g) => (g.family === 'MATERIAL' ? { ...g, value: null, source: 'none' } : g)),
  };
  assert.ok(sanitizeCreatureRecord(old), 'an old null record still loads (no migration)');
});

ok('breeding inherits the material from a parent, like LOOK and VOICE', () => {
  const trio = [born('org_blob_01', 11, 'swiss'), born('geo_tri_02', 12, 'op'), born('flora_flower_01', 13, 'grunge')];
  const held = new Set(trio.map((p) => mat(p).value));
  for (let seed = 0; seed < 40; seed++) {
    const child = breedCreature(trio, seed);
    assert.ok(child, `seed ${seed}`);
    const g = mat(child);
    assert.ok(held.has(g.value), 'never a material none of the parents held');
    assert.match(g.source, /^(parent|mut):cr-/);
    assert.ok(sanitizeCreatureRecord(child));
  }
});

ok('old null records still breed, and a mixed trio passes either a parent material or null', () => {
  const nulls = [born('org_blob_01', 21, null), born('geo_tri_02', 22, null), born('flora_flower_01', 23, null)];
  assert.equal(mat(breedCreature(nulls, 1)).value, null);
  const mixed = [born('org_blob_01', 31, 'engraved'), nulls[1], nulls[2]];
  const vals = new Set(Array.from({ length: 30 }, (_, s) => mat(breedCreature(mixed, s)).value));
  for (const v of vals) assert.ok(v === null || materialById(v));
});

ok('a hand mutation re-picks a DIFFERENT material of the SAME style', () => {
  for (const style of CANON_STYLE_IDS) {
    const a = born('org_blob_01', 41, style);
    const before = mat(a).value;
    const { record, refusal } = handEditRecord(
      a,
      { family: 'MATERIAL', id: 'material', action: 'mutate' },
      { seed: 9 },
    );
    assert.equal(refusal, null, style);
    const after = mat(record);
    assert.notEqual(after.value, before);
    assert.equal(materialStyle(after.value), style);
    assert.equal(after.source, 'hand:mut');
    assert.equal(record.id, a.id, 'in place: the id holds');
  }
});

ok('a pre-PAINT creature (null material) gets its first material only by a hand act, from its body style', () => {
  const bare = born('org_blob_01', 42, null);
  const mutate = { family: 'MATERIAL', id: 'material', action: 'mutate' };
  // no migration: the door loads it unchanged
  assert.equal(mat(sanitizeCreatureRecord(bare)).value, null);
  // MUTATE with the host's body style deals one of that style (Matt, 2026-11-17)
  const { record, refusal } = handEditRecord(bare, mutate, { seed: 9, bodyStyle: 'engraved' });
  assert.equal(refusal, null);
  assert.equal(materialStyle(mat(record).value), 'engraved');
  assert.equal(mat(record).source, 'hand:mut');
  // with no body style named there is nothing to pick in: it refuses
  assert.equal(handEditRecord(bare, mutate, { seed: 9 }).refusal, 'no-mutation');
  // a painted creature keeps its own style even if the host names another
  const painted = born('org_blob_01', 43, 'swiss');
  const again = handEditRecord(painted, mutate, { seed: 9, bodyStyle: 'op' }).record;
  assert.equal(materialStyle(mat(again).value), 'swiss');
});

ok('the style mapping: assetStyle gives every library body and every construct tile a Canon style', () => {
  assert.equal(assetStyle({ id: 'hae_radiolarian_01' }), 'engraved');
  assert.equal(assetStyle({ id: 'user:cn-0000abcd', style: 'memphis' }), 'memphis', 'a construct carries its own');
  for (const id of ['org_blob_01', 'geo_tri_02', 'nope_x']) assert.ok(CANON_STYLE_IDS.includes(assetStyle({ id })));
});

console.log(`creatureMaterial selfcheck: ${n} ok`);
