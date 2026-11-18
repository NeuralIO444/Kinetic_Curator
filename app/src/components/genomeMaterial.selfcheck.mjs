// genomeMaterial.selfcheck.mjs — creature PAINT P4 (#2341; spec creature-paint-drive §1.5, §1.6).
//
// The MATERIAL card: MUTATE and REPLACE like LOOK and VOICE, and PAINT LIKE — take a banked creature's material in
// one tap. Every write goes through the hand-edit door (handEditRecord). Matt (2026-11-17): REPLACE offers only the
// body style's materials; another style's material arrives by Paint Like.
import assert from 'node:assert/strict';
import { geneActions, paintLikeOptions, geneValueText, geneSourceText } from './genomeTimeline.model.mjs';
import { assembleCreature, sanitizeCreatureRecord } from '../engine/creatureAssembler.js';
import { handEditRecord } from '../engine/creatureBreed.js';
import { materialStyle, materialsForStyle } from '../data/canon/materials.js';

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
const born = (seed, styleId) => assembleCreature({ assetId: 'org_blob_01', points: PTS, seed, styleId });
const mat = (r) => r.genome.find((g) => g.family === 'MATERIAL');

ok('the card reads the material by name and pattern; an unpainted creature says so', () => {
  assert.match(geneValueText(mat(born(1, 'engraved'))), /^engraved-[a-z]+ · (hatch|stipple|plain)$/);
  assert.equal(geneValueText(mat(born(1, null))), 'none — unpainted');
  assert.equal(geneSourceText({ source: 'hand:material:op-dot' }), 'hand replace · material op-dot');
});

ok('MUTATE is offered for a painted creature, and for an unpainted one only when the body style is known', () => {
  assert.equal(geneActions(born(2, 'op'), mat(born(2, 'op'))).mutate.ok, true);
  const bare = born(2, null);
  assert.equal(geneActions(bare, mat(bare)).mutate.ok, false);
  assert.equal(geneActions(bare, mat(bare), { bodyStyle: 'grunge' }).mutate.ok, true);
});

ok('REPLACE offers the body style’s other materials only — never another style, never a donor', () => {
  const rec = born(3, 'swiss');
  const donor = born(4, 'memphis');
  const { replace } = geneActions(rec, mat(rec), { bodyStyle: 'swiss', donors: [donor] });
  const want = materialsForStyle('swiss')
    .filter((m) => m.id !== mat(rec).value)
    .map((m) => m.id);
  assert.deepEqual(
    replace.map((o) => o.value),
    want,
  );
  assert.ok(replace.every((o) => o.kind === 'deck'));
});

ok('the door: a deck replace inside the body style lands (hand:material:), outside it is refused', () => {
  const rec = born(5, 'swiss');
  const to = materialsForStyle('swiss').find((m) => m.id !== mat(rec).value).id;
  const edit = (value) => ({ action: 'replace', family: 'MATERIAL', id: 'material', origin: { kind: 'deck', value } });
  const r = handEditRecord(rec, edit(to), { bodyStyle: 'swiss' });
  assert.equal(r.refusal, null);
  assert.equal(mat(r.record).value, to);
  assert.equal(mat(r.record).source, `hand:material:${to}`);
  assert.ok(sanitizeCreatureRecord(r.record), 'the edited record loads');
  assert.equal(handEditRecord(rec, edit('op-dot'), { bodyStyle: 'swiss' }).refusal, 'illegal-value');
  assert.equal(handEditRecord(rec, edit('chrome'), { bodyStyle: 'swiss' }).refusal, 'illegal-source');
  // an unpainted creature takes its first material from the body style's deck
  const bare = born(5, null);
  assert.equal(handEditRecord(bare, edit(to), { bodyStyle: 'swiss' }).refusal, null);
});

ok('PAINT LIKE: lists banked creatures with a different material; one tap copies it, in place', () => {
  const rec = born(6, 'swiss');
  const same = { ...born(7, 'swiss') };
  same.genome = same.genome.map((g) => (g.family === 'MATERIAL' ? { ...g, value: mat(rec).value } : g));
  const other = born(8, 'memphis');
  const bare = born(9, null);
  const opts = paintLikeOptions(rec, [rec, sanitizeCreatureRecord(same), other, bare]);
  assert.deepEqual(
    opts.map((o) => o.donorId),
    [other.id],
    'not itself, not the same material, not an unpainted one',
  );
  const r = handEditRecord(
    rec,
    { action: 'replace', family: 'MATERIAL', id: 'material', origin: { kind: 'donor', donorId: other.id } },
    { donors: [other], bodyStyle: 'swiss' },
  );
  assert.equal(r.refusal, null);
  assert.equal(mat(r.record).value, mat(other).value, 'another style arrives by Paint Like');
  assert.equal(materialStyle(mat(r.record).value), 'memphis');
  assert.equal(mat(r.record).source, `hand:donor:${other.id}`);
  assert.equal(r.record.id, rec.id);
});

console.log(`genomeMaterial selfcheck: ${n} ok`);
