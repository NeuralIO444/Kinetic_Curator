// creatureBreed.selfcheck.mjs — #1852 (slice 4 of #1848): WetLab breeding — three-source gene inheritance.
//
// The issue's acceptance, one check each, plus Matt's rulings (2026-10-29):
//   rate       the mutation fraction is a NAMED constant, 1/8 (rider to ruling 2), and the breeder honours it
//   repeat     a seeded trio breeds the identical child across runs, in any parent order, and through save / load
//   sources    every gene names its source: parent:<one of the three> / cross:<the trio> / mut:…
//   discrete   no discrete gene holds a value none of the parents held; the skeleton travels as one linkage group
//   continuous drives blend inside their legal range (inside the parents' own span unless mutated)
//   mutations  every mutation appears in the record's lineage, and every mut: gene has its lineage entry
//   decks      the child's Look and Voice resolve to the real decks
//   triad      only three distinct legal sources breed (ruling 3: creatures and asset + Look + Voice assemblies; never a
//              stage); an assembly's Look / Voice are the artist's, not a deal
//   door       a child with a dishonest lineage is refused whole
//   store      BREED banks the child with its pool tile (and its bones); a bad trio is refused with a note; children
//              breed on (generations)
import assert from 'node:assert/strict';
import { breedCreature, sourceRecord, MUTATION_RATE, BREED_PARENTS, BREED_LAW } from './creatureBreed.js';
import {
  assembleCreature,
  sanitizeCreatureRecord,
  isLookId,
  isVoiceId,
  DRIVE_RANGE,
  creatureTileId,
} from './creatureAssembler.js';
import { COMPOSITION_PRESETS } from '../data/presets.js';
import { VOICE_DECK } from '../data/voiceDeck.js';
import { useStore } from '../state/store.js';
import { serializeProject, parseProject } from '../state/projectDocument.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const S = () => useStore.getState();
const LOOKS = COMPOSITION_PRESETS.map((p) => p.id);
const VOICES = VOICE_DECK.map((v) => v.id);
const bytes = (v) => JSON.stringify(v);

const SHAPES = [
  [
    'org_blob_01',
    [
      { x: 50, y: 5, role: 'H' },
      { x: 10, y: 60, role: 'L' },
      { x: 90, y: 60, role: 'L' },
    ],
  ],
  [
    'geo_tri_02',
    [
      { x: 20, y: 90, role: 'L' },
      { x: 80, y: 90, role: 'L' },
    ],
  ],
  [
    'flora_flower_01',
    [
      { x: 50, y: 50, role: 'H' },
      { x: 5, y: 50, role: 'L' },
      { x: 95, y: 50, role: 'L' },
      { x: 50, y: 95, role: 'L' },
    ],
  ],
];
const assembly = (i, look = LOOKS[i * 2], voice = VOICES[i]) => ({
  kind: 'assembly',
  assetId: SHAPES[i][0],
  points: SHAPES[i][1],
  lookId: look,
  voiceId: voice,
});
const trio = [0, 1, 2].map((i) => sourceRecord(assembly(i), 7));
// drive values that differ, so the blend has a span to stay inside (birth records all start at the norm)
const withDrives = (rec, vals) => {
  const r = JSON.parse(JSON.stringify(rec));
  r.genome = r.genome.map((g) => (g.family === 'DRIVE' ? { ...g, value: vals[g.id] } : g));
  return sanitizeCreatureRecord(r);
};
const varied = [
  withDrives(trio[0], { approval: 0.5, crowding: 1.5, strain: 0.8, boredom: 1.2 }),
  withDrives(trio[1], { approval: 1.0, crowding: 0.6, strain: 1.9, boredom: 0.4 }),
  withDrives(trio[2], { approval: 1.4, crowding: 1.1, strain: 0.3, boredom: 1.8 }),
];
const SEEDS = Array.from({ length: 600 }, (_, i) => i * 7919 + 13);
const children = SEEDS.map((s) => breedCreature(varied, s));
const DISCRETE = BREED_LAW.filter((l) => l.kind !== 'continuous').map((l) => l.id);
const geneOf = (rec, id) => rec.genome.find((g) => g.id === id);

ok('rate: the mutation fraction is the named constant 1/8, and the breeder honours it', () => {
  assert.equal(MUTATION_RATE, 1 / 8, 'Matt: lively, ~1 gene in 8');
  assert.equal(BREED_PARENTS, 3, 'the triad');
  // mutation sites: each discrete gene, the skeleton (one linkage group), each drive
  const sites = BREED_LAW.filter((l) => l.kind !== 'skeleton').length + 1;
  const total = children.reduce((a, c) => a + c.lineage.mutations.length, 0);
  const rate = total / (children.length * sites);
  assert.ok(Math.abs(rate - MUTATION_RATE) < 0.03, `observed ${rate.toFixed(3)} ≈ ${MUTATION_RATE}`);
  assert.ok(
    children.some((c) => c.lineage.mutations.length === 0) && children.some((c) => c.lineage.mutations.length >= 2),
  );
});

ok('repeat: same trio + seed = the same child, in any order, across runs and through save / load', () => {
  const a = breedCreature(varied, 1852);
  assert.ok(a && /^cr-[0-9a-f]{8}$/.test(a.id));
  assert.equal(bytes(breedCreature(varied, 1852)), bytes(a), 'again');
  assert.equal(bytes(breedCreature([varied[2], varied[0], varied[1]], 1852)), bytes(a), 'order-free');
  assert.notEqual(breedCreature(varied, 1853).id, a.id, 'another seed, another child');
  assert.equal(bytes(sanitizeCreatureRecord(JSON.parse(bytes(a)))), bytes(a), 'its own door keeps it byte for byte');
  useStore.setState({ creatureRecords: [a] });
  const text = JSON.stringify(serializeProject(S()));
  const parsed = parseProject(JSON.parse(text));
  assert.ok(parsed.ok, parsed.error);
  useStore.setState({ creatureRecords: [] });
  S().applyProject(parsed.doc);
  assert.equal(bytes(S().creatureRecords), bytes([a]), 'reloaded intact, lineage and all');
  assert.equal(JSON.stringify(serializeProject(S())), text, 'a second save is the same bytes');
});

ok('sources: every gene names its source — one of the three parents, the trio, or a recorded mutation', () => {
  const ids = new Set(varied.map((p) => p.id));
  for (const c of children) {
    assert.deepEqual([...c.lineage.parents].sort(), [...ids].sort(), 'the child names its three parents');
    for (const g of c.genome) {
      const [kind, rest] = [g.source.split(':')[0], g.source.slice(g.source.indexOf(':') + 1)];
      if (kind === 'parent') assert.ok(ids.has(rest), `${g.id} from a parent`);
      else if (kind === 'cross')
        assert.deepEqual(rest.split('~').sort(), [...ids].sort(), `${g.id} blended from the trio`);
      else if (kind === 'mut') assert.ok(ids.has(rest) || rest === g.id, `${g.id} mutated`);
      else assert.fail(`${g.id} has no breeding source: ${g.source}`);
    }
  }
});

ok('discrete: no discrete gene holds a value none of the parents held; the skeleton travels whole', () => {
  for (const c of children) {
    for (const id of DISCRETE) {
      const v = bytes(geneOf(c, id).value);
      assert.ok(
        varied.some((p) => bytes(geneOf(p, id).value) === v),
        `${id} came from a parent`,
      );
    }
    const skel = (r) => bytes(['head', 'limbs', 'joints'].map((id) => geneOf(r, id).value));
    assert.ok(
      varied.some((p) => skel(p) === skel(c)),
      'head, limbs and joints are one parent’s skeleton',
    );
    assert.ok(c.limbs.length + c.joints.length + (c.head ? 1 : 0) <= 4, 'the body plan holds');
  }
  // over many children every parent passes something on: it is a triad, not one dominant parent
  for (const p of varied)
    assert.ok(
      children.some((c) => geneOf(c, 'body').value === p.body),
      `${p.body} is passed on`,
    );
  assert.ok(new Set(children.map((c) => c.look)).size === 3, 'each parent’s Look turns up');
});

ok('continuous: drives blend inside their range — inside the parents’ own span unless mutated', () => {
  for (const c of children) {
    for (const l of BREED_LAW.filter((x) => x.kind === 'continuous')) {
      const g = geneOf(c, l.id);
      assert.ok(g.value >= DRIVE_RANGE.min && g.value <= DRIVE_RANGE.max, `${l.id} in range`);
      assert.equal(c.drives[l.id], g.value, 'the record’s slot is the gene');
      if (g.source.startsWith('cross:')) {
        const vals = varied.map((p) => geneOf(p, l.id).value);
        assert.ok(
          g.value >= Math.min(...vals) - 1e-9 && g.value <= Math.max(...vals) + 1e-9,
          `${l.id} within the parents`,
        );
      }
    }
  }
  const blended = children
    .map((c) => geneOf(c, 'approval').value)
    .filter((v, i) => geneOf(children[i], 'approval').source.startsWith('cross:'));
  assert.ok(new Set(blended).size > 20, 'a real blend, not a pick: many values between the parents');
});

ok('mutations: each one is in the lineage, and each mut: gene has its entry', () => {
  for (const c of children) {
    const muts = new Set(c.lineage.mutations.map((m) => m.gene));
    for (const g of c.genome) {
      if (!g.source.startsWith('mut:')) continue;
      const fam = ['head', 'limbs', 'joints'].includes(g.id) ? 'FORM.skeleton' : `${g.family}.${g.id}`;
      assert.ok(muts.has(fam), `${g.id} is a recorded mutation`);
    }
    for (const m of c.lineage.mutations) {
      if (m.kind === 'reroll')
        assert.equal(geneOf(c, m.gene.split('.')[1]).value, m.value, 'the re-rolled value is the gene');
      else assert.ok(m.from !== m.to && c.lineage.parents.includes(m.to), 'a swap moves to another parent');
    }
  }
});

ok('decks: the child’s Look and Voice resolve to the real decks', () => {
  for (const c of children) assert.ok(isLookId(c.look) && isVoiceId(c.voice));
});

ok('triad: only three distinct legal sources breed; an assembly wears the artist’s Look and Voice', () => {
  assert.equal(breedCreature(varied.slice(0, 2), 1), null, 'two parents: no');
  assert.equal(breedCreature([...varied, varied[0]], 1), null, 'four: no');
  assert.equal(breedCreature([varied[0], varied[0], varied[1]], 1), null, 'one parent twice: no');
  assert.equal(
    breedCreature([varied[0], varied[1], { kind: 'stage', layers: [] }], 1),
    null,
    'a stage is not a parent',
  );
  assert.equal(sourceRecord({ kind: 'stage' }, 1), null);
  assert.equal(sourceRecord(assembly(0, 'no-such-look'), 1), null, 'an assembly needs a real Look');
  assert.equal(sourceRecord(assembly(0, LOOKS[0], null), 1), null, '…and a real Voice — chosen, never dealt');
  const asm = sourceRecord(assembly(1, LOOKS[3], VOICES[2]), 1);
  assert.equal(asm.look, LOOKS[3]);
  assert.equal(asm.voice, VOICES[2]);
  assert.equal(sourceRecord({ kind: 'creature', record: { kind: 'kc-assembled/1', id: 'cr-00000000' } }, 1), null);
});

ok('door: a child that lies about its lineage is refused whole', () => {
  const c = children[0];
  const lie = (patch) => sanitizeCreatureRecord({ ...c, lineage: { ...c.lineage, ...patch } });
  assert.equal(lie({ parents: c.lineage.parents.slice(0, 2) }), null, 'two parents');
  assert.equal(lie({ parents: [c.lineage.parents[0], c.lineage.parents[0], c.lineage.parents[1]] }), null, 'a repeat');
  assert.equal(lie({ seed: -1 }), null);
  assert.equal(
    lie({ mutations: [{ gene: 'LOOK.look', kind: 'swap', from: c.lineage.parents[0], to: 'cr-ffffffff' }] }),
    null,
    'a stranger',
  );
  assert.equal(lie({ mutations: [{ gene: 'DRIVE.strain', kind: 'reroll', value: 99 }] }), null, 'out of range');
  assert.equal(lie({ mutations: [{ gene: '<x>', kind: 'reroll', value: 1 }] }), null);
  assert.equal(sanitizeCreatureRecord({ ...c, lineage: 'x' }), null);
  const born = assembleCreature({ assetId: 'org_blob_01', points: SHAPES[0][1], seed: 3 });
  assert.ok(!('lineage' in sanitizeCreatureRecord(born)), 'an assembled creature has no lineage');
});

ok('store: BREED banks the child with its tile and bones; a bad trio is refused; children breed on', () => {
  useStore.setState({
    seed: 0x1852,
    creatureRecords: [],
    customAssets: [],
    creatureBreedNote: null,
    creatureAssembleNote: null,
  });
  S().assembleCreature(SHAPES[0][0], SHAPES[0][1]);
  S().assembleCreature(SHAPES[1][0], SHAPES[1][1]);
  const [a, b] = S().creatureRecords;
  S().breedCreature([
    { kind: 'creature', id: a.id },
    { kind: 'creature', id: b.id },
  ]);
  assert.equal(S().creatureBreedNote.status, 'need-three', 'two sources: refused with a note');
  assert.equal(S().creatureRecords.length, 2, 'nothing banked');
  S().breedCreature([{ kind: 'creature', id: a.id }, { kind: 'creature', id: a.id }, assembly(2)]);
  assert.equal(S().creatureBreedNote.status, 'need-three', 'a parent twice: refused');
  S().breedCreature([{ kind: 'creature', id: a.id }, { kind: 'creature', id: b.id }, assembly(2)]);
  assert.equal(S().creatureBreedNote.status, 'banked');
  const child = S().creatureRecords[2];
  assert.ok(child.lineage && child.lineage.parents.includes(a.id) && child.lineage.parents.includes(b.id));
  const tile = S().customAssets.find((t) => t.id === creatureTileId(child.id));
  assert.ok(tile && tile.rig, 'its tile is in the pool, with its bones');
  assert.equal(S().creatureRecords.length, 3, 'the assembly parent is not banked by being a parent');
  S().breedCreature([{ kind: 'creature', id: a.id }, { kind: 'creature', id: b.id }, assembly(2)]);
  assert.equal(S().creatureBreedNote.status, 'already', 'the same trio + seed is the same child');
  // generations: the child is a parent
  S().assembleCreature(SHAPES[2][0], SHAPES[2][1]);
  const c = S().creatureRecords[3];
  S().breedCreature([
    { kind: 'creature', id: child.id },
    { kind: 'creature', id: a.id },
    { kind: 'creature', id: c.id },
  ]);
  assert.equal(S().creatureBreedNote.status, 'banked');
  assert.ok(S().creatureRecords.at(-1).lineage.parents.includes(child.id), 'a grandchild names its bred parent');
});

console.log(`creatureBreed.selfcheck: ${n} checks passed`);
