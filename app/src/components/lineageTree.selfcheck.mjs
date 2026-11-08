// lineageTree.selfcheck.mjs — #2030 (creatures, of #1848): the Lineage Tree, measured against the spec.
//
//   birth     breeding writes the ancestry summary: the three parents, summarized (identity + genes as they
//             stand at the birth + their own parents' ids), deeper ancestors merged in, deduplicated
//   growth    the summary grows LINEARLY in generations — at most three new entries per birth — where a
//             naive copy of three full trees would grow as 3^generations
//   frozen    the summary is written at birth and never recomputed: a parent edited afterwards does not
//             rewrite a child's retained ancestors, and a hand edit never rewrites the record's own summary
//   founder   an assembled creature carries no ancestry and reads as GEN 01; a record bred before summaries
//             existed keeps its lineage, shows its parents as stubs, and its generation is honestly unknown
//   deltas    what changed in a node against its parents, hand-computed: inherited (unchanged, from the
//             named parent), crossed (the parents' values), mutated (joined to the birth's mutation entry),
//             hand (an edit — on an ancestor, made before it bred; on the creature, after its birth), born
//   door      tampered ancestry refuses the record whole: a founder claiming ancestors, a head that is not
//             the lineage, an illegal gene, a cycle, a duplicate, the record among its own ancestors, a
//             malformed parent list, a bad source, an oversize summary
//   persist   a deep record survives the document round-trip byte for byte, ancestry included
//   shifts    gait and cost are absent, as explicit nulls: no measure set rides a creature record for the
//             solver to read, and no registry prices one — the tree estimates nothing
import assert from 'node:assert/strict';
import {
  assembleCreature,
  sanitizeCreatureRecord,
  sanitizeCreatureRecords,
  MAX_ANCESTRY_ENTRIES,
} from '../engine/creatureAssembler.js';
import { breedCreature, handEditRecord } from '../engine/creatureBreed.js';
import { ASSETS } from '../data/assets/index.js';
import { autoAttachPoints } from '../engine/autoAttach.js';
import { serializeProject } from '../state/projectDocument.js';
import { useStore } from '../state/store.js';
import { lineageTree, nodeDeltas } from './lineageTree.model.mjs';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const S = () => useStore.getState();
const bytes = (v) => JSON.stringify(v);
const geneOf = (rec, family, id) => rec.genome.find((g) => g.family === family && g.id === id);
const entryOf = (rec, id) => rec.ancestry.find((e) => e.id === id);

/** Mark an asset's points the way an artist would: the first point the head, the next two limbs. */
const marked = (asset) =>
  autoAttachPoints(asset.svg).map((p, i) => ({ ...p, role: i === 0 ? 'H' : i <= 2 ? 'L' : undefined }));

const BODIES = ASSETS.filter((a) => a.category !== 'creature').map((a) => a.id);
const mkParent = (i, seed) =>
  assembleCreature({ assetId: ASSETS[i].id, points: marked(ASSETS[i]), seed, lookId: null, voiceId: null });
const founders = [mkParent(0, 11), mkParent(1, 22), mkParent(2, 33)];
assert.ok(founders.every(Boolean) && new Set(founders.map((p) => p.id)).size === 3, 'three distinct founders assemble');

const breedFirst = (trio, pred = () => true) => {
  for (let seed = 0; seed < 2000; seed++) {
    const c = breedCreature(trio, seed);
    if (c && pred(c)) return c;
  }
  return null;
};
const child = breedFirst(founders);
assert.ok(child, 'the founders breed');

ok('birth: the child retains its three parents, summarized at the birth', () => {
  assert.equal(child.ancestry.length, 3);
  assert.deepEqual(
    child.ancestry.map((e) => e.id),
    child.lineage.parents,
    'the head of the summary is the lineage, in its order',
  );
  for (const e of child.ancestry) {
    const parent = founders.find((f) => f.id === e.id);
    assert.deepEqual(e.genes, parent.genome, 'the genes as they stood at the birth');
    assert.deepEqual(e.parents, [], 'a founder has no parents');
  }
  assert.deepEqual(sanitizeCreatureRecord(JSON.parse(bytes(child))), child, 'the door returns the child whole');
});

ok('founder: an assembled creature carries no ancestry', () => {
  assert.ok(!('ancestry' in founders[0]));
  assert.ok(!('ancestry' in sanitizeCreatureRecord(founders[0])));
});

ok('recursive: a grandchild carries its grandparents; the tree derives generations', () => {
  const more = [mkParent(3, 44), mkParent(4, 55)];
  const grand = breedFirst([child, ...more]);
  assert.ok(grand);
  assert.equal(grand.ancestry.length, 6, 'three parents + the child’s three, merged');
  assert.deepEqual(entryOf(grand, child.id).parents, child.lineage.parents, 'the parent entry names its own parents');
  for (const f of founders) assert.ok(entryOf(grand, f.id), `grandparent ${f.id} retained`);
  const tree = lineageTree(grand);
  assert.equal(tree.self.gen, 3);
  assert.equal(tree.nodes.length, 6);
  assert.equal(tree.edges.length, 6, 'three edges from the grandchild, three from its parent');
  assert.equal(tree.nodes.find((nd) => nd.id === child.id).gen, 2);
  assert.ok(
    tree.nodes.filter((nd) => nd.depth === 2).every((nd) => nd.gen === 1),
    'the founders are GEN 01',
  );
  assert.equal(tree.stubs, 0);
  assert.equal(tree.complete, true);
  // reuse deduplicates: breeding the grandchild back into its own parent and a founder retains each
  // ancestor once — 3 head entries plus the 4 of the grandchild's line not already named
  const great = breedFirst([grand, child, founders[0]]);
  assert.ok(great);
  const ids = great.ancestry.map((e) => e.id);
  assert.equal(ids.length, 7, 'the merged summary counts shared ancestors once');
  assert.equal(new Set(ids).size, ids.length, 'no ancestor is retained twice');
  assert.equal(lineageTree(great).self.gen, 4);
});

ok('growth: three new entries per generation at most — linear, never 3^generations', () => {
  const used = new Set();
  let salt = 1000;
  const freshFounder = () => {
    for (;;) {
      const f = mkParent(salt % ASSETS.length, salt);
      salt++;
      if (f && !used.has(f.id)) {
        used.add(f.id);
        return f;
      }
    }
  };
  let prev = null;
  const lengths = [];
  for (let g = 0; g < 5; g++) {
    const trio = prev ? [prev, freshFounder(), freshFounder()] : [freshFounder(), freshFounder(), freshFounder()];
    prev = breedFirst(trio);
    assert.ok(prev, `generation ${g + 1} breeds`);
    lengths.push(prev.ancestry.length);
  }
  assert.deepEqual(lengths, [3, 6, 9, 12, 15], 'each birth adds exactly its three parents’ new entries');
  assert.ok(prev.ancestry.length < 3 ** 5 / 10, 'and nowhere near the naive tree’s 243');
  assert.equal(lineageTree(prev).self.gen, 6, 'five breedings past the founders');
});

ok('frozen: edits after the birth never rewrite a retained summary', () => {
  const editedParent = handEditRecord(
    founders[0],
    { action: 'mutate', family: 'DRIVE', id: 'approval' },
    { seed: 42, legalBodies: BODIES },
  ).record;
  assert.ok(editedParent);
  assert.notDeepEqual(geneOf(editedParent, 'DRIVE', 'approval'), geneOf(founders[0], 'DRIVE', 'approval'));
  assert.deepEqual(
    entryOf(child, founders[0].id).genes,
    founders[0].genome,
    'the child keeps the parent as it was at the birth',
  );
  const editedChild = handEditRecord(
    child,
    { action: 'mutate', family: 'VOICE', id: 'voice' },
    { seed: 4, legalBodies: BODIES },
  ).record;
  assert.deepEqual(editedChild.ancestry, child.ancestry, 'a hand edit leaves the record’s own summary untouched');
});

ok('founder tree: GEN 01, no ancestors, every gene born with it', () => {
  const tree = lineageTree(founders[0]);
  assert.equal(tree.self.gen, 1);
  assert.deepEqual(tree.nodes, []);
  assert.deepEqual(tree.edges, []);
  const view = nodeDeltas(founders[0], founders[0].id);
  assert.equal(view.deltas.length, founders[0].genome.length);
  assert.ok(
    view.deltas.every((d) => d.cls === 'born'),
    'assembly sources only',
  );
});

ok('pre-summary record: lineage without ancestry — parents are stubs, generation unknown', () => {
  const legacy = JSON.parse(bytes(child));
  delete legacy.ancestry;
  const clean = sanitizeCreatureRecord(legacy);
  assert.ok(clean, 'a record bred before summaries existed still loads');
  assert.ok(!('ancestry' in clean));
  const tree = lineageTree(clean);
  assert.equal(tree.self.gen, null, 'its generation cannot be derived — not estimated');
  assert.equal(tree.nodes.length, 3);
  assert.ok(
    tree.nodes.every((nd) => nd.stub && !nd.retained),
    'the parents stand as stubs',
  );
  assert.equal(tree.complete, false);
  const self = nodeDeltas(clean, clean.id);
  const inherited = self.deltas.find((d) => d.cls === 'inherited');
  assert.ok(inherited && inherited.parents[0].retained === false, 'the diff names the parent; its genes were not kept');
  const stub = nodeDeltas(clean, clean.lineage.parents[0]);
  assert.equal(stub.retained, false);
  assert.deepEqual(stub.deltas, [], 'a stub has no deltas to show');
});

ok('deltas: hand-computed against the founders — inherited, crossed, mutated', () => {
  const rich = breedFirst(
    founders,
    (c) =>
      c.lineage.mutations.some((m) => m.gene === 'FORM.skeleton') &&
      c.lineage.mutations.some((m) => m.kind === 'reroll'),
  );
  assert.ok(rich, 'a child with a skeleton swap and a drive reroll exists in the seed walk');
  const view = nodeDeltas(rich, rich.id);
  assert.equal(view.deltas.length, rich.genome.length);
  for (const d of view.deltas) {
    const gene = geneOf(rich, d.family, d.id);
    if (gene.source.startsWith('parent:')) {
      assert.equal(d.cls, 'inherited', `${d.key} reads inherited`);
      const from = founders.find((f) => f.id === d.fromId);
      assert.deepEqual(d.value, geneOf(from, d.family, d.id).value, 'the value is the named parent’s');
      assert.equal(d.parents[0].matches, true, 'unchanged against the retained parent');
    } else if (gene.source.startsWith('cross:')) {
      assert.equal(d.cls, 'crossed', `${d.key} reads crossed`);
      assert.deepEqual(
        d.parents.map((p) => p.value),
        founders
          .slice()
          .sort((a, b) => rich.lineage.parents.indexOf(a.id) - rich.lineage.parents.indexOf(b.id))
          .map((f) => geneOf(f, d.family, d.id).value),
        'all three parents’ values, in lineage order',
      );
    } else if (gene.source.startsWith('mut:')) {
      assert.equal(d.cls, 'mutated', `${d.key} reads mutated`);
      assert.ok(d.mutation, 'joined to the birth’s mutation entry');
    }
  }
  const skel = view.deltas.find((d) => d.family === 'FORM' && d.id === 'limbs');
  if (skel.cls === 'mutated') {
    assert.equal(skel.mutation.gene, 'FORM.skeleton', 'the skeleton genes share the one linkage entry');
    assert.equal(skel.mutation.kind, 'swap');
    assert.ok(founders.some((f) => f.id === skel.mutation.from) && founders.some((f) => f.id === skel.mutation.to));
  }
  const rerolled = view.deltas.find((d) => d.mutation && d.mutation.kind === 'reroll');
  assert.equal(rerolled.value, rerolled.mutation.value, 'a reroll’s value IS its gene’s');
});

ok('deltas: hand edits — on an ancestor before it bred, and on the creature after its birth', () => {
  let edited = handEditRecord(
    founders[0],
    {
      action: 'replace',
      family: 'LOOK',
      id: 'look',
      origin: { kind: 'deck', value: founders[0].look === 'praystation' ? 'megacity' : 'praystation' },
    },
    { legalBodies: BODIES },
  ).record;
  edited = handEditRecord(
    edited,
    { action: 'mutate', family: 'DRIVE', id: 'strain' },
    { seed: 9, legalBodies: BODIES },
  ).record;
  assert.ok(edited);
  const kid = breedFirst([edited, founders[1], founders[2]]);
  assert.ok(kid);
  const editedEntry = entryOf(kid, edited.id);
  assert.equal(
    editedEntry.genes.find((g) => g.family === 'LOOK').source,
    `hand:look:${edited.look}`,
    'the edit is retained',
  );
  const parentView = nodeDeltas(kid, edited.id);
  assert.equal(parentView.deltas.find((d) => d.family === 'LOOK').cls, 'hand', 'the look reads as a hand edit');
  assert.equal(parentView.deltas.find((d) => d.id === 'strain').cls, 'hand', 'the drive reads as a hand edit');
  assert.equal(
    parentView.deltas.find((d) => d.family === 'FORM' && d.id === 'body').cls,
    'born',
    'the rest is its birth',
  );
  const kidLook = nodeDeltas(kid, kid.id).deltas.find((d) => d.family === 'LOOK');
  if (kidLook.fromId === edited.id)
    assert.equal(kidLook.value, edited.look, 'a gene inherited from the edited parent carries the edited value');
  const selfEdited = handEditRecord(
    child,
    { action: 'mutate', family: 'DRIVE', id: 'boredom' },
    { seed: 3, legalBodies: BODIES },
  ).record;
  const selfView = nodeDeltas(selfEdited, selfEdited.id);
  assert.equal(selfView.deltas.find((d) => d.id === 'boredom').cls, 'hand', 'a post-birth edit marks its own delta');
});

ok('door: tampered ancestry refuses the record whole', () => {
  const clone = () => JSON.parse(bytes(child));
  const founderClaim = JSON.parse(bytes(founders[0]));
  founderClaim.ancestry = clone().ancestry;
  assert.equal(sanitizeCreatureRecord(founderClaim), null, 'a founder claiming ancestors');
  const swapped = clone();
  [swapped.ancestry[0], swapped.ancestry[1]] = [swapped.ancestry[1], swapped.ancestry[0]];
  assert.equal(sanitizeCreatureRecord(swapped), null, 'the head is not the lineage, in its order');
  const badGene = clone();
  geneOf({ genome: badGene.ancestry[0].genes }, 'LOOK', 'look').value = 'not-a-look';
  assert.equal(sanitizeCreatureRecord(badGene), null, 'an illegal value in a retained gene');
  const badSource = clone();
  badSource.ancestry[0].genes[0].source = 'stolen';
  assert.equal(sanitizeCreatureRecord(badSource), null, 'a source outside the grammar');
  const dup = clone();
  dup.ancestry.push(dup.ancestry[0]);
  assert.equal(sanitizeCreatureRecord(dup), null, 'an ancestor retained twice');
  const selfAnc = clone();
  selfAnc.ancestry[0] = { ...selfAnc.ancestry[0], id: selfAnc.id };
  assert.equal(sanitizeCreatureRecord(selfAnc), null, 'the record among its own ancestors');
  const shortParents = clone();
  shortParents.ancestry[0].parents = ['cr-00000001'];
  assert.equal(sanitizeCreatureRecord(shortParents), null, 'a parent list that is neither none nor three');
  const noGenes = clone();
  noGenes.ancestry[0].genes = [];
  assert.equal(sanitizeCreatureRecord(noGenes), null, 'an entry without genes');
  assert.equal(sanitizeCreatureRecord({ ...clone(), ancestry: {} }), null, 'ancestry that is not a list');
  // a cycle among entries: a parent entry and a grandparent entry naming each other
  const grand = breedFirst([child, mkParent(3, 44), mkParent(4, 55)]);
  const cyc = JSON.parse(bytes(grand));
  const c1Entry = cyc.ancestry.find((e) => e.id === child.id);
  const f0Entry = cyc.ancestry.find((e) => e.id === founders[0].id);
  f0Entry.parents = [child.id, founders[1].id, founders[2].id];
  assert.ok(c1Entry.parents.includes(founders[0].id), 'the cycle is real: the parent names the founder back');
  assert.equal(sanitizeCreatureRecord(cyc), null, 'ancestry only ever points backwards');
  // oversize: the real head plus synthetic founders past the ceiling
  const big = clone();
  const real = new Set(big.ancestry.map((e) => e.id));
  for (let i = 0; big.ancestry.length <= MAX_ANCESTRY_ENTRIES; i++) {
    const id = `cr-${i.toString(16).padStart(8, '0')}`;
    if (real.has(id)) continue;
    real.add(id);
    big.ancestry.push({
      id,
      genes: [{ family: 'MATERIAL', id: 'material', value: null, source: 'none' }],
      parents: [],
    });
  }
  assert.equal(sanitizeCreatureRecord(big), null, 'a summary past the ceiling refuses, never truncates');
});

ok('persist: a deep record round-trips byte for byte, ancestry included', () => {
  const grand = breedFirst([child, mkParent(3, 44), mkParent(4, 55)]);
  const back = sanitizeCreatureRecords([JSON.parse(bytes(grand))]);
  assert.deepEqual(back, [grand], 'the load door returns the record exactly');
  useStore.setState({ creatureRecords: [grand] });
  const doc = JSON.parse(bytes(serializeProject(S())));
  assert.equal(bytes(doc.creatureRecords), bytes([grand]), 'the document carries the ancestry byte for byte');
  useStore.setState({ creatureRecords: [] });
});

ok('shifts: gait and cost are absent — explicit nulls, never estimates', () => {
  for (const id of [child.id, child.lineage.parents[0]]) {
    assert.deepEqual(nodeDeltas(child, id).shifts, { gait: null, cost: null }, `no shift is computed for ${id}`);
  }
});

console.log(`lineageTree.selfcheck: ${n} checks passed`);
