// genomeTimeline.selfcheck.mjs — #1870 (creatures, of #1848): the Genome Timeline, measured against the spec.
//
//   strip     one node per gene, in record order, banded by family — including genes past the birth eleven
//             (a newer build's genes, beast measures) in their own band
//   readout   a gene's value and source in words, for assembled, bred and hand-edited genes alike
//   mutate    the breeding mutation laws, applied by hand: always in the family's legal value space, seeded
//             and repeatable, source rewritten to hand:mut; genes with no lawful mutation refuse
//   replace   deck / pool / the shape's own points / a donor record are legal sources; a whole stage, an
//             illegal value, the record itself are refused — and a refusal changes nothing
//   in place  the edit keeps the record's id, gene order and lineage; no child is born; the bank does not grow
//   lineage   a hand-edited parent breeds: the child names it and passes the door whole
//   door      a hand-edited record passes the assembler's door (a bred record's superseded mutation entry
//             included — a birth mutation and a skeleton swap alike); a tampered post-edit record is refused whole
//   persist   an edited record survives the document round-trip byte for byte, and its tile still validates
//   store     editCreatureGene banks the edit with its rebuilt tile and notes refusals without touching state —
//             including the tile refusals: a full pool, or an import squatting on the tile id
import assert from 'node:assert/strict';
import {
  assembleCreature,
  sanitizeCreatureRecord,
  sanitizeCreatureRecords,
  creatureTile,
  creatureTileId,
  isLookId,
  DRIVE_RANGE,
} from '../engine/creatureAssembler.js';
import { breedCreature, handEditRecord, handMutateValue } from '../engine/creatureBreed.js';
import { ASSETS } from '../data/assets/index.js';
import { autoAttachPoints } from '../engine/autoAttach.js';
import { sanitizeOverlay, OVERLAY_CAP } from '../assets/overlay.js';
import { serializeProject } from '../state/projectDocument.js';
import { useStore } from '../state/store.js';
import { genomeStrip, geneActions, geneValueText, geneSourceText } from './genomeTimeline.model.mjs';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const S = () => useStore.getState();
const bytes = (v) => JSON.stringify(v);
const geneOf = (rec, family, id) => rec.genome.find((g) => g.family === family && g.id === id);

/** Mark an asset's points the way an artist would: the first point the head, the next two limbs. */
const marked = (asset) =>
  autoAttachPoints(asset.svg).map((p, i) => ({ ...p, role: i === 0 ? 'H' : i <= 2 ? 'L' : undefined }));

const BODIES = ASSETS.filter((a) => a.category !== 'creature').map((a) => a.id);
const mkParent = (i, seed) =>
  assembleCreature({ assetId: ASSETS[i].id, points: marked(ASSETS[i]), seed, lookId: null, voiceId: null });
const parents = [mkParent(0, 11), mkParent(1, 22), mkParent(2, 33)];
assert.ok(parents.every(Boolean) && new Set(parents.map((p) => p.id)).size === 3, 'three distinct parents assemble');
const rec = parents[0];

ok('strip: one node per gene, in record order, banded by family', () => {
  const strip = genomeStrip(rec);
  assert.equal(strip.count, rec.genome.length);
  assert.deepEqual(
    strip.bands.map((b) => b.family),
    ['FORM', 'LOOK', 'VOICE', 'MATERIAL', 'DRIVE'],
  );
  assert.deepEqual(
    strip.bands.map((b) => b.nodes.length),
    [4, 1, 1, 1, 4],
  );
  const flat = strip.bands.flatMap((b) => b.nodes);
  assert.deepEqual(
    flat.map((nd) => nd.index),
    rec.genome.map((_, i) => i),
    'nodes stand in record order',
  );
  assert.ok(flat.every((nd) => nd.key === `${nd.family}.${nd.id}` && nd.valueText && nd.sourceText));
});

ok('strip: genes past the birth eleven (beast measures, a newer build’s genes) band after the five', () => {
  const wide = sanitizeCreatureRecord({
    ...rec,
    genome: [
      ...rec.genome,
      { family: 'MEASURE', id: 'stride', value: 1.5, source: 'wild' },
      { family: 'MEASURE', id: 'phase', value: 0.25, source: 'wild' },
    ],
  });
  assert.ok(wide, 'the door keeps well-formed extra genes');
  const strip = genomeStrip(wide);
  assert.equal(strip.count, 13);
  assert.deepEqual(
    strip.bands.map((b) => b.family),
    ['FORM', 'LOOK', 'VOICE', 'MATERIAL', 'DRIVE', 'MEASURE'],
  );
  const measure = strip.bands.at(-1);
  assert.deepEqual(
    measure.nodes.map((nd) => nd.id),
    ['stride', 'phase'],
  );
  assert.equal(measure.nodes[0].valueText, '1.5');
});

ok('readout: assembled genes read as value + origin', () => {
  const named = assembleCreature({
    assetId: ASSETS[3].id,
    points: marked(ASSETS[3]),
    seed: 5,
    lookId: 'praystation',
    voiceId: null,
  });
  assert.ok(named);
  assert.equal(geneSourceText(geneOf(named, 'FORM', 'body')), `assembly · shape ${named.body}`);
  assert.equal(geneSourceText(geneOf(named, 'LOOK', 'look')), 'assembly · named look praystation');
  assert.equal(geneSourceText(geneOf(named, 'VOICE', 'voice')), 'dealt at assembly');
  assert.equal(geneSourceText(geneOf(named, 'DRIVE', 'approval')), 'wild type');
  assert.equal(geneSourceText(geneOf(named, 'MATERIAL', 'material')), 'no source — a stub');
  assert.equal(geneValueText(geneOf(named, 'MATERIAL', 'material')), 'none — no material yet');
  assert.equal(geneValueText(geneOf(named, 'DRIVE', 'approval')), '1');
  const head = geneOf(named, 'FORM', 'head');
  if (head.value) assert.equal(geneValueText(head), `(${head.value.x}, ${head.value.y})`);
  assert.ok(geneValueText(geneOf(named, 'LOOK', 'look')).includes('praystation'));
});

ok('readout: bred genes name their parents, their blend, their mutations', () => {
  let child = null;
  for (let seed = 0; seed < 400 && !child; seed++) {
    const c = breedCreature(parents, seed);
    if (c && c.lineage.mutations.length > 0) child = c;
  }
  assert.ok(child, 'a bred child with a mutation exists in the seed walk');
  const parentGene = child.genome.find((g) => g.source.startsWith('parent:'));
  assert.equal(geneSourceText(parentGene), `breeding · parent ${parentGene.source.slice(7)}`);
  const cross = child.genome.find((g) => g.source.startsWith('cross:'));
  assert.equal(geneSourceText(cross), 'breeding · blend of the three parents');
  const mut = child.genome.find((g) => g.source.startsWith('mut:'));
  assert.ok(geneSourceText(mut).startsWith('breeding mutation ·'), `mutation readout: ${geneSourceText(mut)}`);
});

ok('mutate: a drive re-rolls inside its legal range, seeded, repeatable, marked hand:mut', () => {
  const edit = { action: 'mutate', family: 'DRIVE', id: 'approval' };
  const env = { seed: 42, legalBodies: BODIES, donors: parents.slice(1) };
  const a = handEditRecord(rec, edit, env);
  assert.equal(a.refusal, null);
  const g = geneOf(a.record, 'DRIVE', 'approval');
  assert.ok(g.value >= DRIVE_RANGE.min && g.value <= DRIVE_RANGE.max, 'inside the legal range');
  assert.notEqual(g.value, geneOf(rec, 'DRIVE', 'approval').value, 'a mutation changes the value');
  assert.equal(Math.round(g.value * 1000) / 1000, g.value, 'rounded the breeding way (r3)');
  assert.equal(g.source, 'hand:mut');
  const b = handEditRecord(rec, edit, env);
  assert.deepEqual(b.record, a.record, 'same record + gene + seed = the same mutation, byte for byte');
  assert.equal(handMutateValue(rec, geneOf(rec, 'DRIVE', 'approval'), 42, BODIES), g.value);
});

ok('mutate: deck and body genes re-pick a different legal holder', () => {
  const look = handEditRecord(rec, { action: 'mutate', family: 'LOOK', id: 'look' }, { seed: 7, legalBodies: BODIES });
  assert.equal(look.refusal, null);
  assert.ok(isLookId(geneOf(look.record, 'LOOK', 'look').value), 'still a real Look');
  assert.notEqual(look.record.look, rec.look, 'a different Look, and the record field follows its gene');
  const body = handEditRecord(rec, { action: 'mutate', family: 'FORM', id: 'body' }, { seed: 7, legalBodies: BODIES });
  assert.equal(body.refusal, null);
  assert.ok(BODIES.includes(body.record.body) && body.record.body !== rec.body, 'a different pool shape');
  assert.equal(geneOf(body.record, 'FORM', 'body').source, 'hand:mut');
});

ok('mutate: the skeleton, the material stub and a one-shape pool refuse — never clamp, never invent', () => {
  for (const id of ['head', 'limbs', 'joints']) {
    const r = handEditRecord(rec, { action: 'mutate', family: 'FORM', id }, { seed: 1, legalBodies: BODIES });
    assert.deepEqual([r.record, r.refusal], [null, 'no-mutation'], `${id} is one linkage group`);
  }
  const mat = handEditRecord(rec, { action: 'mutate', family: 'MATERIAL', id: 'material' }, { seed: 1 });
  assert.deepEqual([mat.record, mat.refusal], [null, 'no-mutation']);
  const onePool = handEditRecord(
    rec,
    { action: 'mutate', family: 'FORM', id: 'body' },
    { seed: 1, legalBodies: [rec.body] },
  );
  assert.deepEqual([onePool.record, onePool.refusal], [null, 'no-mutation'], 'nothing different to mutate to');
  const actions = geneActions(rec, geneOf(rec, 'FORM', 'limbs'), { legalBodies: BODIES, donors: [] });
  assert.equal(actions.mutate.ok, false);
  assert.match(actions.mutate.why, /linkage group/);
});

ok('replace: the deck, the pool and the shape’s own points are legal sources', () => {
  const otherLook = rec.look === 'praystation' ? 'megacity' : 'praystation';
  const deck = handEditRecord(
    rec,
    { action: 'replace', family: 'LOOK', id: 'look', origin: { kind: 'deck', value: otherLook } },
    { legalBodies: BODIES },
  );
  assert.equal(deck.refusal, null);
  assert.equal(deck.record.look, otherLook);
  assert.equal(geneOf(deck.record, 'LOOK', 'look').source, `hand:look:${otherLook}`);

  const poolBody = BODIES.find((id) => id !== rec.body);
  const pool = handEditRecord(
    rec,
    { action: 'replace', family: 'FORM', id: 'body', origin: { kind: 'pool', value: poolBody } },
    { legalBodies: BODIES },
  );
  assert.equal(pool.refusal, null);
  assert.equal(pool.record.body, poolBody);
  assert.equal(geneOf(pool.record, 'FORM', 'body').source, `hand:asset:${poolBody}`);

  const pts = [
    { x: 50, y: 10, role: 'H' },
    { x: 15, y: 70, role: 'L' },
    { x: 85, y: 70 },
  ];
  const skel = handEditRecord(
    rec,
    { action: 'replace', family: 'FORM', id: 'joints', origin: { kind: 'asset' } },
    { legalBodies: BODIES, bodyAttachPoints: pts },
  );
  assert.equal(skel.refusal, null);
  assert.deepEqual(skel.record.joints, [{ x: 85, y: 70 }], 'the plain points, derived as the assembler derives them');
  assert.equal(geneOf(skel.record, 'FORM', 'joints').source, `hand:asset:${rec.body}`);
});

ok('replace: a donor record’s corresponding gene — the value travels, the source names the donor', () => {
  const donorFirst = handEditRecord(
    parents[1],
    { action: 'mutate', family: 'DRIVE', id: 'strain' },
    { seed: 9, legalBodies: BODIES },
  );
  assert.equal(donorFirst.refusal, null);
  const donor = donorFirst.record;
  const r = handEditRecord(
    rec,
    { action: 'replace', family: 'DRIVE', id: 'strain', origin: { kind: 'donor', donorId: donor.id } },
    { legalBodies: BODIES, donors: [donor] },
  );
  assert.equal(r.refusal, null);
  assert.equal(geneOf(r.record, 'DRIVE', 'strain').value, geneOf(donor, 'DRIVE', 'strain').value);
  assert.equal(geneOf(r.record, 'DRIVE', 'strain').source, `hand:donor:${donor.id}`);
  assert.equal(geneSourceText(geneOf(r.record, 'DRIVE', 'strain')), `hand replace · donor ${donor.id}`);
});

ok('replace: a whole stage, an illegal value, the record itself — refused, and nothing changes', () => {
  const before = bytes(rec);
  const stage = handEditRecord(
    rec,
    { action: 'replace', family: 'LOOK', id: 'look', origin: { kind: 'stage', value: 'whatever' } },
    { legalBodies: BODIES },
  );
  assert.deepEqual([stage.record, stage.refusal], [null, 'illegal-source'], 'a whole stage is never a source');
  const bogus = handEditRecord(
    rec,
    { action: 'replace', family: 'LOOK', id: 'look', origin: { kind: 'deck', value: 'not-a-look' } },
    { legalBodies: BODIES },
  );
  assert.deepEqual([bogus.record, bogus.refusal], [null, 'illegal-source']);
  const offPool = handEditRecord(
    rec,
    { action: 'replace', family: 'FORM', id: 'body', origin: { kind: 'pool', value: 'not-in-the-pool' } },
    { legalBodies: BODIES },
  );
  assert.deepEqual([offPool.record, offPool.refusal], [null, 'illegal-value']);
  const self = handEditRecord(
    rec,
    { action: 'replace', family: 'DRIVE', id: 'strain', origin: { kind: 'donor', donorId: rec.id } },
    { legalBodies: BODIES, donors: [rec] },
  );
  assert.deepEqual([self.record, self.refusal], [null, 'illegal-source'], 'a record is not its own donor');
  const noGene = handEditRecord(rec, { action: 'mutate', family: 'DRIVE', id: 'nope' }, { seed: 1 });
  assert.deepEqual([noGene.record, noGene.refusal], [null, 'no-gene']);
  assert.equal(bytes(rec), before, 'the record itself was never touched');
});

ok('in place: same record, same order, no child — and a bred record keeps its lineage whole', () => {
  const edited = handEditRecord(
    rec,
    { action: 'mutate', family: 'DRIVE', id: 'boredom' },
    { seed: 3, legalBodies: BODIES },
  ).record;
  assert.equal(edited.id, rec.id, 'the same record');
  assert.equal(edited.genome.length, rec.genome.length, 'no gene added, none lost');
  assert.ok(!('lineage' in edited), 'no lineage is born of a hand edit');
  edited.genome.forEach((g, i) => {
    if (g.id !== 'boredom') assert.deepEqual(g, rec.genome[i], `gene ${i} untouched`);
  });
  const strip = genomeStrip(edited);
  const node = strip.bands.flatMap((b) => b.nodes).find((nd) => nd.id === 'boredom');
  assert.equal(node.hand, true);
  assert.equal(node.sourceText, 'hand mutation · this lab');

  let child = null;
  for (let seed = 0; seed < 400 && !child; seed++) {
    const c = breedCreature(parents, seed);
    if (c && c.lineage.mutations.length > 0) child = c;
  }
  const tamed = handEditRecord(
    child,
    { action: 'mutate', family: 'VOICE', id: 'voice' },
    { seed: 4, legalBodies: BODIES },
  );
  assert.equal(tamed.refusal, null);
  assert.deepEqual(
    tamed.record.lineage,
    child.lineage,
    'the lineage is data about the birth — the hand does not rewrite it',
  );
});

ok('lineage: breeding from a hand-edited parent names it, and the child passes the door whole', () => {
  const mutated = handEditRecord(
    parents[0],
    { action: 'mutate', family: 'DRIVE', id: 'approval' },
    { seed: 42, legalBodies: BODIES },
  ).record;
  const replaced = handEditRecord(
    mutated,
    {
      action: 'replace',
      family: 'LOOK',
      id: 'look',
      origin: { kind: 'deck', value: mutated.look === 'praystation' ? 'megacity' : 'praystation' },
    },
    { legalBodies: BODIES },
  ).record;
  assert.ok(replaced && sanitizeCreatureRecord(replaced), 'the hand-edited parent is itself door-clean');
  const trio = [replaced, parents[1], parents[2]];
  let child = null;
  for (let seed = 0; seed < 400 && !child; seed++) child = breedCreature(trio, seed);
  assert.ok(child, 'the trio breeds');
  assert.ok(child.lineage.parents.includes(replaced.id), 'the child names the hand-edited parent');
  assert.deepEqual(
    sanitizeCreatureRecord(JSON.parse(bytes(child))),
    child,
    'a child of a hand-edited parent passes the door whole',
  );
});

ok('door: editing the very gene a birth mutation touched stays lawful — its entry is superseded, not orphaned', () => {
  let child = null;
  let mutGene = null;
  for (let seed = 0; seed < 400 && !child; seed++) {
    const c = breedCreature(parents, seed);
    if (!c) continue;
    const m = c.lineage.mutations.find((x) => x.gene !== 'FORM.skeleton');
    if (m) {
      child = c;
      mutGene = m.gene;
    }
  }
  assert.ok(child && mutGene, 'a bred child with a non-skeleton mutation exists in the seed walk');
  const [family, id] = mutGene.split('.');
  const edited = handEditRecord(child, { action: 'mutate', family, id }, { seed: 6, legalBodies: BODIES });
  assert.equal(edited.refusal, null, `hand-mutating the birth-mutated gene ${mutGene} is lawful`);
  assert.equal(geneOf(edited.record, family, id).source, 'hand:mut');
  assert.deepEqual(sanitizeCreatureRecord(JSON.parse(bytes(edited.record))), edited.record, 'the door keeps it whole');
  assert.deepEqual(edited.record.lineage, child.lineage);
});

ok('door: hand-replacing a skeleton gene supersedes its birth skeleton-swap entry — accounted, not orphaned', () => {
  let child = null;
  for (let seed = 0; seed < 2000 && !child; seed++) {
    const c = breedCreature(parents, seed);
    if (c && c.lineage.mutations.some((m) => m.gene === 'FORM.skeleton')) child = c;
  }
  assert.ok(child, 'a bred child with a skeleton swap exists in the seed walk');
  const bodyAsset = ASSETS.find((a) => a.id === child.body);
  const edited = handEditRecord(
    child,
    { action: 'replace', family: 'FORM', id: 'joints', origin: { kind: 'asset' } },
    { legalBodies: BODIES, bodyAttachPoints: marked(bodyAsset) },
  );
  assert.equal(edited.refusal, null, 'hand-replacing a skeleton gene is lawful');
  assert.equal(geneOf(edited.record, 'FORM', 'joints').source, `hand:asset:${child.body}`);
  assert.deepEqual(
    sanitizeCreatureRecord(JSON.parse(bytes(edited.record))),
    edited.record,
    'the door keeps it whole — the skeleton entry is superseded by the hand source',
  );
  assert.deepEqual(edited.record.lineage, child.lineage, 'the birth record is untouched');
});

ok('door: a tampered post-edit record is refused whole', () => {
  const edited = handEditRecord(
    rec,
    {
      action: 'replace',
      family: 'LOOK',
      id: 'look',
      origin: { kind: 'deck', value: rec.look === 'praystation' ? 'megacity' : 'praystation' },
    },
    { legalBodies: BODIES },
  ).record;
  assert.ok(edited);
  const lied = JSON.parse(bytes(edited));
  geneOf(lied, 'LOOK', 'look').value = 'not-a-look';
  assert.equal(sanitizeCreatureRecord(lied), null, 'a hand source does not launder an illegal value');
  const liedSource = JSON.parse(bytes(edited));
  geneOf(liedSource, 'LOOK', 'look').source = 'hand:donor:cr-00000000';
  liedSource.look = liedSource.genome.find((g) => g.id === 'look').value;
  assert.ok(sanitizeCreatureRecord(liedSource), 'a hand source over a legal value is the door’s business as usual');
  let child = null;
  for (let seed = 0; seed < 400 && !child; seed++) {
    const c = breedCreature(parents, seed);
    if (c) child = c;
  }
  const stray = JSON.parse(bytes(child));
  const pg = stray.genome.find((g) => g.source.startsWith('parent:'));
  pg.source = 'parent:cr-ffffffff';
  assert.equal(sanitizeCreatureRecord(stray), null, 'a bred record still may not lie about its parents');
});

ok('persist: an edited record round-trips byte for byte and its rig re-validates', () => {
  const edited = handEditRecord(
    rec,
    { action: 'mutate', family: 'DRIVE', id: 'crowding' },
    { seed: 8, legalBodies: BODIES },
  ).record;
  const back = sanitizeCreatureRecords([JSON.parse(bytes(edited))]);
  assert.deepEqual(back, [edited], 'the load door returns the edited record exactly');
  const bodyAsset = ASSETS.find((a) => a.id === edited.body);
  const tile = creatureTile(edited, bodyAsset);
  assert.ok(tile && sanitizeOverlay([tile]).length === 1, 'the edited creature’s tile passes the overlay door');
  useStore.setState({ creatureRecords: [edited] });
  const doc = JSON.parse(bytes(serializeProject(S())));
  assert.equal(bytes(doc.creatureRecords), bytes([edited]), 'the document carries the edit byte for byte');
});

ok('store: editCreatureGene banks the edit in place with its rebuilt tile; a refusal moves nothing', () => {
  useStore.setState({ seed: 1870, creatureRecords: [], customAssets: [], creatureGeneNote: null });
  S().assembleCreature(ASSETS[0].id, marked(ASSETS[0]));
  assert.equal(S().creatureRecords.length, 1);
  const before = S().creatureRecords[0];
  const tilesBefore = S().customAssets.length;
  S().editCreatureGene(before.id, { action: 'mutate', family: 'DRIVE', id: 'approval' });
  assert.equal(S().creatureGeneNote.status, 'mutated');
  assert.equal(S().creatureRecords.length, 1, 'the bank does not grow — the edit is in place');
  const after = S().creatureRecords[0];
  assert.equal(after.id, before.id);
  assert.equal(geneOf(after, 'DRIVE', 'approval').source, 'hand:mut');
  assert.equal(S().customAssets.length, tilesBefore, 'the tile is swapped, not added');
  const frozen = bytes(S().creatureRecords);
  S().editCreatureGene(before.id, {
    action: 'replace',
    family: 'LOOK',
    id: 'look',
    origin: { kind: 'deck', value: 'not-a-look' },
  });
  assert.equal(S().creatureGeneNote.status, 'refused');
  assert.equal(bytes(S().creatureRecords), frozen, 'a refused edit leaves the bank byte-identical');
  useStore.setState({ creatureRecords: [], customAssets: [], creatureGeneNote: null });
});

ok('store: an edit whose rebuilt tile cannot land — pool full, or an import on the tile id — refuses whole', () => {
  useStore.setState({ seed: 1870, creatureRecords: [], customAssets: [], creatureGeneNote: null });
  S().assembleCreature(ASSETS[0].id, marked(ASSETS[0]));
  const banked = S().creatureRecords[0];
  const frozenBank = bytes(S().creatureRecords);
  // the creature's own tile is gone (an older document) and the pool is full: nowhere for the rebuilt tile to land
  const fillers = Array.from({ length: OVERLAY_CAP }, (_, i) => ({ id: `filler-${i}`, svg: '<svg/>' }));
  useStore.setState({ customAssets: fillers });
  const frozenPool = bytes(S().customAssets);
  S().editCreatureGene(banked.id, { action: 'mutate', family: 'DRIVE', id: 'approval' });
  assert.equal(S().creatureGeneNote.status, 'refused', 'pool-full refuses the edit');
  assert.equal(bytes(S().creatureRecords), frozenBank, 'the bank never moves');
  assert.equal(bytes(S().customAssets), frozenPool, 'the pool never moves');
  // an import squatting on the creature's tile id is never evicted — the edit refuses instead
  useStore.setState({ customAssets: [{ id: creatureTileId(banked.id), svg: '<svg/>' }] });
  S().editCreatureGene(banked.id, { action: 'mutate', family: 'DRIVE', id: 'approval' });
  assert.equal(S().creatureGeneNote.status, 'refused', 'id-taken refuses the edit');
  assert.equal(bytes(S().creatureRecords), frozenBank, 'the bank never moves');
  useStore.setState({ creatureRecords: [], customAssets: [], creatureGeneNote: null });
});

console.log(`genomeTimeline.selfcheck: ${n} checks passed`);
